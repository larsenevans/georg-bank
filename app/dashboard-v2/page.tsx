import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { transaction, bankAccount, accessRequest } from '@/lib/db/schema'
import { getAccessEnabled, isSuperadminToken } from '@/lib/access-flow'
import { getActiveAccessSession } from '@/lib/access-session'
import { DEMO_ACCOUNT_NUMBER, DEMO_DEFAULT_USER_ID } from '@/lib/demo-user'
import { HorizonShell } from '@/components/horizon-bank/horizon-shell'
import type {
  HorizonAccount,
  HorizonLiveUser,
  HorizonShellData,
  HorizonTransaction,
} from '@/components/horizon-bank/types'

export const dynamic = 'force-dynamic'

/**
 * Horizon banking dashboard (100dvh, Horizon UI style).
 *
 * Session source of truth is the `access_granted` cookie:
 *  - superadmin token ('superadmin_*' or the master code) => superadmin role + admin controls
 *  - a valid access session                               => guest role
 * Loads the demo payer's bank account and transaction history from Drizzle.
 */
export default async function HorizonDashboardV2Page() {
  const jar = await cookies()
  const token = jar.get('access_granted')?.value ?? null

  const isSuperadmin =
    isSuperadminToken(token) || process.env.NODE_ENV !== 'production'

  // Guest users must have an active access session; otherwise protect (only in production).
  if (getAccessEnabled() && !isSuperadmin) {
    if (!token) {
      redirect('/welcome')
    }
    const session = await getActiveAccessSession(token)
    if (!session) {
      redirect('/api/access/logout')
    }
  }

  // Resolve the demo payer account (SPACE IBAN preferred, then demo user).
  let account: typeof bankAccount.$inferSelect | null = null
  let userId = DEMO_DEFAULT_USER_ID
  try {
    const byIban = await db.query.bankAccount.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.accountNumber, DEMO_ACCOUNT_NUMBER),
    })
    if (byIban) {
      account = byIban
      userId = byIban.userId
    } else {
      account =
        (await db.query.bankAccount.findFirst({
          where: (t, { eq: eqFn }) => eqFn(t.userId, DEMO_DEFAULT_USER_ID),
        })) ?? null
    }
  } catch (error) {
    console.error('[dashboard-v2] bank account lookup failed:', error)
  }

  // Load recent transactions: all transactions for superadmin, or own for guest.
  let transactions: HorizonTransaction[] = []
  try {
    const rows = await db.query.transaction.findMany({
      where: isSuperadmin ? undefined : (fields, { eq: eqFn }) => eqFn(fields.userId, userId),
      orderBy: [desc(transaction.createdAt)],
      limit: 150,
    })
    transactions = rows.map((t) => ({
      id: t.id,
      recipient: t.description || 'Platba',
      amountEur: Math.abs(t.amount) / 100,
      type: t.type,
      status: t.status,
      note: t.description ?? undefined,
      date: new Date(t.createdAt).toLocaleDateString('sk-SK'),
      createdAt: new Date(t.createdAt).toISOString(),
      pdfUrl: t.pdfUrl || null,
      isSuperadmin: Boolean(t.isSuperadmin),
      userId: t.userId,
    }))
  } catch (error) {
    console.error('[dashboard-v2] transaction lookup failed:', error)
  }

  // Live Users feed for superadmin monitoring
  let liveUsers: HorizonLiveUser[] = []
  if (isSuperadmin) {
    try {
      const requests = await db.query.accessRequest.findMany({
        orderBy: [desc(accessRequest.createdAt)],
        limit: 30,
      })
      const sessions = await db.query.accessSession.findMany({
        limit: 50,
      })
      const sessionMap = new Map(sessions.map((s) => [s.requestId, s]))

      liveUsers = requests.map((r) => {
        const sess = sessionMap.get(r.id)
        return {
          id: r.id,
          requestId: r.id,
          email: r.email,
          code: r.code,
          status: r.status,
          deviceHint: r.deviceHint,
          createdAt: new Date(r.createdAt).toISOString(),
          sessionToken: r.sessionToken ?? sess?.sessionToken ?? null,
          transactionUsed: Boolean(sess?.transactionUsed),
          pdfGenerated: Boolean(sess?.pdfGenerated),
          paymentsCount: sess?.transactionUsed ? 1 : 0,
        }
      })
    } catch (err) {
      console.error('[dashboard-v2] live users lookup failed:', err)
    }
  }

  const accountPayload: HorizonAccount | null = account
    ? {
        id: account.id,
        userId: account.userId,
        accountNumber: account.accountNumber,
        displayName: account.displayName,
        currency: account.currency,
        balanceEur: account.balance / 100,
      }
    : null

  const data: HorizonShellData = {
    balanceEur: account ? account.balance / 100 : 0,
    account: accountPayload,
    transactions,
    isSuperadmin,
    displayName: (account && account.displayName) || (account && account.productLabel) || null,
    liveUsers,
  }

  return <HorizonShell data={data} />
}