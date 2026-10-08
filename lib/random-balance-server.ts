import { db } from '@/lib/db'
import { bankAccount, accessSession } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolveTransactionsPayer } from '@/lib/transactions-payer'
import { readAccessCookieToken } from '@/lib/access-session'
import {
  generateRandomLoginBalanceCents,
  SUPERADMIN_FIXED_BALANCE_CENTS,
} from '@/lib/random-balance'
import { isSuperadminToken } from '@/lib/access-flow'

/**
 * On login / PIN verification:
 * 1. For Superadmin: balance remains fixed / unchanged at minimum 7 589,20 EUR (never randomized).
 * 2. For Guest: generates random balance in range [4 675.45, 15 873.20] EUR.
 * 3. Updates active bankAccount in DB.
 * 4. Resets accessSession.transactionUsed = false for guest so user is allowed 1 fresh outgoing payment.
 */
export async function applyLoginSessionBalance(): Promise<{ balanceEur: number; balanceCents: number }> {
  const token = await readAccessCookieToken().catch(() => null)
  const isSuperadmin = isSuperadminToken(token)

  let balanceCents: number
  let balanceEur: number

  try {
    const payer = await resolveTransactionsPayer()
    if (payer.account) {
      if (isSuperadmin) {
        // 👑 Superadmin: zostatok je nemenný, minimálne 7 589,20 €
        const existingBalance = typeof payer.account.balance === 'number' ? payer.account.balance : 0
        balanceCents = Math.max(existingBalance, SUPERADMIN_FIXED_BALANCE_CENTS)
        balanceEur = balanceCents / 100

        if (existingBalance < SUPERADMIN_FIXED_BALANCE_CENTS) {
          await db
            .update(bankAccount)
            .set({ balance: balanceCents, updatedAt: new Date() })
            .where(eq(bankAccount.id, payer.account.id))
        }
      } else {
        // Bežný hosť: náhodný zostatok
        balanceCents = generateRandomLoginBalanceCents()
        balanceEur = balanceCents / 100

        if (process.env.CI !== 'true') {
          await db
            .update(bankAccount)
            .set({ balance: balanceCents, updatedAt: new Date() })
            .where(eq(bankAccount.id, payer.account.id))
        } else {
          balanceCents = payer.account.balance
          balanceEur = balanceCents / 100
        }
      }
    } else {
      balanceCents = isSuperadmin ? SUPERADMIN_FIXED_BALANCE_CENTS : generateRandomLoginBalanceCents()
      balanceEur = balanceCents / 100
    }
  } catch (error) {
    console.error('[random-balance] Failed to update bank account in DB:', error)
    balanceCents = isSuperadmin ? SUPERADMIN_FIXED_BALANCE_CENTS : generateRandomLoginBalanceCents()
    balanceEur = balanceCents / 100
  }

  try {
    if (token && !isSuperadmin) {
      await db
        .update(accessSession)
        .set({ transactionUsed: false, logoutAt: null })
        .where(eq(accessSession.sessionToken, token))
    }
  } catch (error) {
    console.error('[random-balance] Failed to reset access session transaction flag:', error)
  }

  return { balanceEur, balanceCents }
}

