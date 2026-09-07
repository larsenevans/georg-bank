import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { guestLoginPath } from '@/lib/guest-auth'
import { db } from '@/lib/db'
import { bankAccount, transaction } from '@/lib/db/schema'
import { and, eq, or, desc, gte, lt } from 'drizzle-orm'
import { DashboardHeader } from '@/components/dashboard-header'
import { DashboardPaymentClient } from '@/components/dashboardpayment-client'
import { getMonthUtcRange, PAYMENT_OVERVIEW_MONTH, formatMonthLabel } from '@/lib/month-range'

export const metadata = {
  title: 'Platby – George Internetbanking',
  description: 'Prehľad platieb za mesiac',
}

export default async function DashboardPaymentPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect(guestLoginPath('/dashboardpayment'))

  const userId = session.user.id
  const monthRange = getMonthUtcRange(PAYMENT_OVERVIEW_MONTH)
  if (!monthRange) redirect('/dashboard')

  const accounts = await db
    .select()
    .from(bankAccount)
    .where(
      and(
        eq(bankAccount.userId, userId),
        eq(bankAccount.accountType, 'checking')
      )
    )
    .limit(1)

  if (!accounts[0]) redirect('/dashboard')
  const account = accounts[0]

  const txns = await db
    .select()
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        or(
          eq(transaction.fromAccountId, account.id),
          eq(transaction.toAccountId, account.id)
        ),
        gte(transaction.createdAt, monthRange.start),
        lt(transaction.createdAt, monthRange.end)
      )
    )
    .orderBy(desc(transaction.createdAt))

  const typedTransactions = txns.map(txn => ({
    id: txn.id,
    fromAccountId: txn.fromAccountId,
    toAccountId: txn.toAccountId,
    amount: txn.amount,
    balanceBefore: txn.balanceBefore,
    balanceAfter: txn.balanceAfter,
    type: txn.type,
    description: txn.description,
    status: txn.status,
    createdAt: txn.createdAt.toISOString(),
  }))

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#121620]">
      <DashboardHeader
        user={session.user}
        account={{
          displayName: account.displayName || 'Business účet',
          balance: account.balance,
          currency: account.currency,
        }}
      />
      <DashboardPaymentClient
        user={session.user}
        month={PAYMENT_OVERVIEW_MONTH}
        monthLabel={formatMonthLabel(PAYMENT_OVERVIEW_MONTH)}
        account={{
          id: account.id,
          accountNumber: account.accountNumber,
          displayName: account.displayName || 'Business účet S',
          balance: account.balance,
          currency: account.currency,
        }}
        transactions={typedTransactions}
      />
    </div>
  )
}