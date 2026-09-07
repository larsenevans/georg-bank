import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { guestLoginPath } from '@/lib/guest-auth'
import { getBankAccounts } from '@/app/actions/banking'
import { StatementGeneratorClient } from '@/components/statement-generator-client'

export const metadata = {
  title: 'Generátor výpisov – George',
  description: 'Hromadné generovanie mesačných HTML výpisov',
}

export default async function StatementGeneratorPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect(guestLoginPath('/dashboard/statements/generator'))

  const accounts = await getBankAccounts()
  if (accounts.length === 0) redirect('/dashboard')

  return (
    <StatementGeneratorClient
      accounts={accounts.map((account) => ({
        id: account.id,
        accountNumber: account.accountNumber,
        displayName: account.displayName ?? null,
        balance: account.balance,
        currency: account.currency,
      }))}
      defaultAccountName={session.user.name || 'Business účet'}
    />
  )
}