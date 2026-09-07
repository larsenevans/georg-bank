import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { guestLoginPath } from '@/lib/guest-auth'
import { getBankAccounts } from '@/app/actions/banking'
import { DashboardHeader } from '@/components/dashboard-header'
import { PaymentOrdersClient } from '@/components/payment-orders-client'

export const metadata = {
  title: 'Platobné príkazy – George',
  description: 'George klientska zóna',
}

export default async function PaymentOrdersPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect(guestLoginPath('/dashboard/payment-orders'))

  const accounts = await getBankAccounts()
  const checkingAccount = accounts.find((acc) => acc.accountType === 'checking') ?? accounts[0]

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#111216]">
      <DashboardHeader
        user={session.user}
        account={checkingAccount ? {
          displayName: 'Business účet',
          balance: checkingAccount.balance,
          currency: checkingAccount.currency,
        } : undefined}
      />
      <PaymentOrdersClient />
    </div>
  )
}