import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bankAccount } from '@/lib/db/schema'
import {
  DEMO_ACCOUNT_NUMBER,
  DEMO_DEFAULT_USER_ID,
  pickDemoBankAccount,
} from '@/lib/demo-user'

export type TransactionsPayer = {
  userId: string
  account: typeof bankAccount.$inferSelect | null
  source: 'session' | 'demo'
}

async function sessionUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Prefer the logged-in guest SPACE account. Fall back to the demo Business účet L
 * account only when there is no session (scripts / unauthenticated GET).
 */
export async function resolveTransactionsPayer(): Promise<TransactionsPayer> {
  const sid = await sessionUserId()
  if (sid) {
    const owned = await db.query.bankAccount.findMany({
      where: (fields, { eq: eqFn }) => eqFn(fields.userId, sid),
    })
    const account = pickDemoBankAccount(owned) ?? owned[0] ?? null
    return { userId: sid, account, source: 'session' }
  }

  const byIban = await db.query.bankAccount.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.accountNumber, DEMO_ACCOUNT_NUMBER),
  })
  if (byIban) {
    return { userId: byIban.userId, account: byIban, source: 'demo' }
  }

  const byUser = await db.query.bankAccount.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.userId, DEMO_DEFAULT_USER_ID),
  })
  return {
    userId: byUser?.userId ?? DEMO_DEFAULT_USER_ID,
    account: byUser ?? null,
    source: 'demo',
  }
}
