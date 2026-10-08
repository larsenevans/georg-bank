import { HorizonShell } from '@/components/horizon-bank/horizon-shell'
import type { HorizonShellData } from '@/components/horizon-bank/types'

export const dynamic = 'force-dynamic'

/**
 * Samostatná demo/preview stránka Horizon dashboardu.
 * - Žiadna auth, žiadna DB — len fiktívne dáta na ukážku layoutu.
 * - Route: /horizon-preview
 */
export default function HorizonPreviewPage() {
  const previewData: HorizonShellData = {
    balanceEur: 8850.0,
    account: {
      id: 'acc-preview',
      userId: 'user-preview',
      accountNumber: 'SK31 0900 0000 0050 1234 5678',
      displayName: 'Business účet L',
      currency: 'EUR',
      balanceEur: 8850.0,
    },
    isSuperadmin: true,
    displayName: 'Business účet L',
    transactions: [
      {
        id: 'tx-1',
        recipient: 'Výplata sporiteľňa',
        amountEur: 6660.0,
        type: 'incoming',
        status: 'completed',
        category: 'Príjem',
        note: 'Mzda',
        date: '10.07.2026',
        createdAt: '2026-07-10T08:00:00.000Z',
      },
      {
        id: 'tx-2',
        recipient: 'Tesco',
        amountEur: 14.99,
        type: 'outgoing',
        status: 'completed',
        category: 'Potraviny a nákupy',
        note: 'Platba kartou',
        date: new Date().toLocaleDateString('sk-SK'),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'tx-3',
        recipient: 'O2 Slovensko',
        amountEur: 20.0,
        type: 'outgoing',
        status: 'completed',
        category: 'Telekomunikácie',
        note: 'Faktúra',
        date: new Date(Date.now() - 86400000).toLocaleDateString('sk-SK'),
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'tx-4',
        recipient: 'Payroll s.r.o.',
        amountEur: 1200.5,
        type: 'incoming',
        status: 'completed',
        category: 'Business',
        note: 'Faktúra',
        date: '12.07.2026',
        createdAt: '2026-07-12T09:30:00.000Z',
      },
      {
        id: 'tx-5',
        recipient: 'Slovnaft',
        amountEur: 58.9,
        type: 'outgoing',
        status: 'completed',
        category: 'Cestovanie a doprava',
        note: 'Tankovanie',
        date: '15.07.2026',
        createdAt: '2026-07-15T14:12:00.000Z',
      },
    ],
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0a10] p-0 sm:p-6">
      <div className="h-dvh max-h-dvh w-full max-w-md overflow-hidden rounded-none sm:h-[90dvh] sm:rounded-3xl sm:border sm:border-white/10">
        <HorizonShell data={previewData} />
      </div>
    </div>
  )
}