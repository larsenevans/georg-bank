import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bankAccount, transaction } from '@/lib/db/schema'
import { and, eq, or, desc, gte, lt } from 'drizzle-orm'
import { generateTransactionsPdf, TransactionRow } from '@/lib/generate-transactions-pdf'
import { getMonthUtcRange } from '@/lib/month-range'
import { buildStatementAccountFields } from '@/lib/statement-pdf-profile'
import {
  formatSlspAccountingPeriod,
  formatSlspStatementDate,
  formatSlspStatementNumber,
} from '@/lib/format-date'
import {
  afterPdfSuccess,
  clearAccessCookie,
  readAccessCookieToken,
  requireAccessForPdf,
} from '@/lib/access-session'
import { isSuperadminCode, isSuperadminToken } from '@/lib/access-flow'

export async function GET(req: Request) {
  try {
    const cookieToken = await readAccessCookieToken()
    const pdfGate = await requireAccessForPdf(cookieToken)
    if (!pdfGate.ok) {
      const response = NextResponse.json({ error: pdfGate.error }, { status: pdfGate.status })
      return pdfGate.status === 403 ? clearAccessCookie(response) : response
    }
    const accessSessionRow = pdfGate.skipped ? null : pdfGate.session

    const isSuperadmin = Boolean(
      isSuperadminToken(cookieToken) ||
      isSuperadminCode(cookieToken) ||
      isSuperadminToken(accessSessionRow?.sessionToken)
    )

    const url = new URL(req.url)
    const accountId = url.searchParams.get('accountId')
    const month = url.searchParams.get('month')

    if (!accountId) {
      return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })
    }

    const session = await auth.api.getSession({
      headers: req.headers
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    const account = await db
      .select()
      .from(bankAccount)
      .where(
        and(
          eq(bankAccount.id, accountId),
          eq(bankAccount.userId, userId)
        )
      )
      .limit(1)

    if (!account[0]) {
      return NextResponse.json({ error: 'Account not found or unauthorized' }, { status: 404 })
    }

    const currentAccount = account[0]
    const monthRange = month ? getMonthUtcRange(month) : null

    if (month && !monthRange) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 })
    }

    const accountFilter = and(
      eq(transaction.userId, userId),
      isSuperadmin ? undefined : eq(transaction.isSuperadmin, false),
      or(
        eq(transaction.fromAccountId, accountId),
        eq(transaction.toAccountId, accountId)
      )
    )

    const dateFilter = monthRange
      ? and(
          gte(transaction.createdAt, monthRange.start),
          lt(transaction.createdAt, monthRange.end)
        )
      : undefined

    const transactions = await db
      .select()
      .from(transaction)
      .where(dateFilter ? and(accountFilter, dateFilter) : accountFilter)
      .orderBy(desc(transaction.createdAt))
      .limit(monthRange ? 200 : 500)

    let depositsTotal = 0
    let withdrawalsTotal = 0

    const transactionRows: TransactionRow[] = transactions.map(t => {
      const isDeposit = t.type === 'deposit'

      if (isDeposit) depositsTotal += t.amount
      else withdrawalsTotal += t.amount

      return {
        id: t.id,
        date: formatSlspStatementDate(t.createdAt.toISOString()),
        type: t.type,
        description: t.description,
        amount: t.amount,
        balanceAfter: t.balanceAfter
      }
    })

    const currentBalance = currentAccount.balance || 0
    let initialBalance = currentBalance - depositsTotal + withdrawalsTotal
    let finalBalance = currentBalance

    if (monthRange && transactions.length > 0) {
      const chronological = [...transactions].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )
      const firstTxn = chronological[0]
      const lastTxn = chronological[chronological.length - 1]

      if (firstTxn.balanceBefore !== null && firstTxn.balanceBefore !== undefined) {
        initialBalance = firstTxn.balanceBefore
      }
      if (lastTxn.balanceAfter !== null && lastTxn.balanceAfter !== undefined) {
        finalBalance = lastTxn.balanceAfter
      }
    }

    const now = new Date()
    let periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    let periodEnd = now

    if (monthRange) {
      periodStart = monthRange.start
      periodEnd = new Date(monthRange.end.getTime() - 1)
    }

    const profile = buildStatementAccountFields({
      ...currentAccount,
      displayName: currentAccount.displayName || session.user.name || 'Užívateľ',
    })

    const pdfData = {
      ...profile,
      accountNumber: currentAccount.accountNumber,
      currency: currentAccount.currency || 'EUR',
      statementDate: formatSlspStatementDate(periodEnd),
      accountingPeriod: formatSlspAccountingPeriod(periodStart, periodEnd),
      statementNumber: formatSlspStatementNumber(periodEnd),
      transactions: transactionRows,
      initialBalance,
      finalBalance,
      depositsTotal,
      withdrawalsTotal,
    }

    const htmlContent = await generateTransactionsPdf(pdfData)
    const filenameMonth = month ? month.replace('-', '') : new Date().toISOString().split('T')[0].replace(/-/g, '')

    if (accessSessionRow) {
      await afterPdfSuccess(accessSessionRow)
    }

    const response = new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="vypis-${currentAccount.accountNumber.replace(/\s/g, '')}-${filenameMonth}.html"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    })
    return accessSessionRow ? clearAccessCookie(response) : response
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}