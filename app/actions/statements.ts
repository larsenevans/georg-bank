'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bankAccount, transaction } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { generateTransactionsPdf } from '@/lib/generate-transactions-pdf'
import {
  generateBulkStatements,
  type StatementMix,
  toPersistableTransactions,
} from '@/lib/statement-generator'
import { buildStatementAccountFields } from '@/lib/statement-pdf-profile'
import {
  formatSlspAccountingPeriod,
  formatSlspStatementDate,
  formatSlspStatementNumber,
} from '@/lib/format-date'
import { checkStatementGenerationRateLimit } from '@/lib/statement-rate-limit'
import {
  afterPdfSuccess,
  clearAccessCookieFromServerAction,
  readAccessCookieToken,
  requireAccessForPdf,
} from '@/lib/access-session'

export interface BulkStatementRequest {
  accountId: string
  accountDisplayName: string
  transactionsPerMonth: number
  averageMonthlyTurnover: number
  mix: StatementMix
  persistToDatabase: boolean
}

export interface BulkStatementResult {
  month: string
  html: string
  filename: string
}

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

function validateRequest(config: BulkStatementRequest) {
  if (!config.accountId) throw new Error('Vyberte účet.')
  if (config.accountDisplayName.trim().length < 2 || config.accountDisplayName.trim().length > 60) {
    throw new Error('Názov účtu musí mať 2 až 60 znakov.')
  }
  if (config.transactionsPerMonth < 10 || config.transactionsPerMonth > 30) {
    throw new Error('Počet platieb musí byť medzi 10 a 30.')
  }
  if (config.averageMonthlyTurnover < 100 || config.averageMonthlyTurnover > 500_000) {
    throw new Error('Priemerný obrat musí byť medzi 100 a 500 000 EUR.')
  }

  const mixTotal = config.mix.outgoing + config.mix.incoming + config.mix.topup
  if (mixTotal <= 0) {
    throw new Error('Vyberte aspoň jeden typ platby.')
  }
}

export async function generateBulkStatementsAction(
  config: BulkStatementRequest,
): Promise<BulkStatementResult[]> {
  const pdfGate = await requireAccessForPdf(await readAccessCookieToken())
  if (!pdfGate.ok) {
    if (pdfGate.status === 403) {
      await clearAccessCookieFromServerAction()
    }
    throw new Error(pdfGate.error === 'pdf_already_generated'
      ? 'Táto session už vygenerovala PDF.'
      : 'Vyžaduje sa aktívna access session.')
  }
  const accessSessionRow = pdfGate.skipped ? null : pdfGate.session

  const userId = await getUserId()
  validateRequest(config)

  if (!checkStatementGenerationRateLimit(userId)) {
    throw new Error('Limit generovania bol vyčerpaný. Skúste znova o hodinu.')
  }

  const accountResult = await db
    .select()
    .from(bankAccount)
    .where(
      and(
        eq(bankAccount.id, config.accountId),
        eq(bankAccount.userId, userId),
      ),
    )
    .limit(1)

  const account = accountResult[0]
  if (!account) {
    throw new Error('Účet nebol nájdený.')
  }

  const displayName = config.accountDisplayName.trim()
  await db
    .update(bankAccount)
    .set({ displayName })
    .where(eq(bankAccount.id, account.id))

  const statements = generateBulkStatements({
    accountNumber: account.accountNumber,
    transactionsPerMonth: config.transactionsPerMonth,
    averageMonthlyTurnoverEur: config.averageMonthlyTurnover,
    mix: config.mix,
    initialBalanceCents: account.balance,
    seed: Date.now() % 1_000_000,
  })

  if (config.persistToDatabase) {
    const persistable = toPersistableTransactions(statements, userId, account.id)
    if (persistable.length > 0) {
      await db.insert(transaction).values(
        persistable.map((row) => ({
          id: row.id,
          userId: row.userId,
          fromAccountId: row.fromAccountId,
          toAccountId: row.toAccountId,
          amount: row.amount,
          balanceBefore: row.balanceBefore,
          balanceAfter: row.balanceAfter,
          type: row.type,
          description: row.description,
          status: row.status,
          createdAt: row.createdAt,
        })),
      )

      const finalBalance = statements[statements.length - 1]?.finalBalance ?? account.balance
      await db
        .update(bankAccount)
        .set({ balance: finalBalance, displayName })
        .where(eq(bankAccount.id, account.id))
    }
  }

  const results = await Promise.all(
    statements.map(async (statement) => {
      const profile = buildStatementAccountFields({
        ...account,
        displayName,
      })

      const html = await generateTransactionsPdf({
        ...profile,
        accountNumber: account.accountNumber,
        currency: account.currency || 'EUR',
        statementDate: formatSlspStatementDate(statement.periodEnd.toISOString()),
        accountingPeriod: formatSlspAccountingPeriod(
          statement.periodStart.toISOString(),
          statement.periodEnd.toISOString(),
        ),
        statementNumber: formatSlspStatementNumber(statement.periodEnd.toISOString()),
        transactions: statement.transactions,
        initialBalance: statement.initialBalance,
        finalBalance: statement.finalBalance,
        depositsTotal: statement.depositsTotal,
        withdrawalsTotal: statement.withdrawalsTotal,
      })

      const ibanSlug = account.accountNumber.replace(/\s/g, '')
      return {
        month: statement.month,
        html,
        filename: `vypis-${ibanSlug}-${statement.month}.html`,
      }
    }),
  )

  if (accessSessionRow) {
    await afterPdfSuccess(accessSessionRow)
    await clearAccessCookieFromServerAction()
  }
  return results
}