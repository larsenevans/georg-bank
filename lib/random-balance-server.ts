import { db } from '@/lib/db'
import { bankAccount, accessSession } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolveTransactionsPayer } from '@/lib/transactions-payer'
import { readAccessCookieToken } from '@/lib/access-session'
import { generateRandomLoginBalanceCents } from '@/lib/random-balance'

/**
 * On login / PIN verification:
 * 1. Generates random balance in range [4 675.45, 15 873.20] EUR.
 * 2. Updates active bankAccount in DB.
 * 3. Resets accessSession.transactionUsed = false so user is allowed 1 fresh outgoing payment.
 */
export async function applyLoginSessionBalance(): Promise<{ balanceEur: number; balanceCents: number }> {
  const balanceCents = generateRandomLoginBalanceCents()
  const balanceEur = balanceCents / 100

  try {
    const payer = await resolveTransactionsPayer()
    if (payer.account) {
      await db
        .update(bankAccount)
        .set({ balance: balanceCents, updatedAt: new Date() })
        .where(eq(bankAccount.id, payer.account.id))
    }
  } catch (error) {
    console.error('[random-balance] Failed to update bank account in DB:', error)
  }

  try {
    const token = await readAccessCookieToken()
    if (token) {
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
