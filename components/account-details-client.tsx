'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Search, 
  Printer, 
  Download, 
  Lock, 
  ChevronDown, 
  ArrowUpRight, 
  ArrowDownLeft,
  ChevronLeft,
  Loader2
} from 'lucide-react'
import { formatTransactionDateLong } from '@/lib/format-date'
import { DashboardHeader } from '@/components/dashboard-header'
import { AddMoneyFooter } from '@/components/add-money-footer'
import { AssistantWidget } from '@/components/assistant/assistant-widget'
import { getCategoryConfigByName, categorizeTransaction } from '@/lib/categories'

interface Transaction {
  id: string
  amount: string | number
  balanceBefore?: string | number | null
  balanceAfter?: string | number | null
  type: string
  description: string | null
  status: string
  createdAt: Date | string
}

interface Account {
  id: string
  accountNumber: string
  accountType: string
  balance: string | number
  currency: string
  isActive: boolean
}

interface AccountDetailsClientProps {
  user: { name: string | null; email: string }
  account: Account
  initialTransactions: Transaction[]
}

export function AccountDetailsClient({ user, account, initialTransactions }: AccountDetailsClientProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [reservationsOpen, setReservationsOpen] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // Format balance helper
  const formatBalance = (val: number | string) => {
    return (Number(val) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  }

  useEffect(() => {
    // Generate the 5 mock transactions from the screenshot if they aren't already seeded in the list
    const mockTxns: Transaction[] = [
      {
        id: 'mock-1',
        amount: '142.76',
        type: 'deposit',
        description: 'Michal Pasztor|nic|Ostatné nepravidelné príjmy',
        status: 'completed',
        createdAt: new Date('2026-06-21T12:00:00Z').toISOString()
      },
      {
        id: 'mock-2',
        amount: '13.00',
        type: 'withdrawal',
        description: 'Poplatok|KS: 0898|Poplatky',
        status: 'completed',
        createdAt: new Date('2026-06-20T15:30:00Z').toISOString()
      },
      {
        id: 'mock-3',
        amount: '10.00',
        type: 'deposit',
        description: 'Judita Prokopcakova|Odoslane z Revolutu|Ostatné nepravidelné príjmy',
        status: 'completed',
        createdAt: new Date('2026-06-20T11:15:00Z').toISOString()
      },
      {
        id: 'mock-4',
        amount: '0.01',
        type: 'withdrawal',
        description: 'Ing. Smicka, Radim|421944071611 - overeni uctu|Nezaradené výdavky',
        status: 'completed',
        createdAt: new Date('2026-06-20T09:05:00Z').toISOString()
      },
      {
        id: 'mock-5',
        amount: '0.10',
        type: 'deposit',
        description: 'W. Mohamad Amir|Ok|Ostatné nepravidelné príjmy',
        status: 'completed',
        createdAt: new Date('2026-06-20T08:00:00Z').toISOString()
      }
    ]

    // Mix in user's actual database transactions (filtering out placeholders to avoid duplicates)
    const dbTxns = initialTransactions.filter(
      t => !t.description?.includes('Michal Pasztor') && 
           !t.description?.includes('Poplatok') &&
           !t.description?.includes('Judita')
    )

    // Combine them, sorting by date descending
    const combined = [...dbTxns, ...mockTxns].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    setTransactions(combined)
  }, [initialTransactions])

  // Parse transaction info
  const parseTxn = (txn: Transaction) => {
    const desc = txn.description || ''
    if (desc.includes('|')) {
      const [name, note, category] = desc.split('|')
      return { name, note, category }
    }
    
    // Default fallback for dynamic transfers
    const isDeposit = txn.type === 'deposit'
    const name = isDeposit ? 'Prichádzajúca platba' : 'Prevod prostriedkov'
    const note = desc || 'Úspešná transakcia'
    const category = categorizeTransaction(name, note, txn.type)
    return { name, note, category }
  }

  // Filter transactions based on search query
  const filteredTransactions = transactions.filter(txn => {
    if (!searchQuery) return true
    const { name, note, category } = parseTxn(txn)
    const query = searchQuery.toLowerCase()
    return (
      name.toLowerCase().includes(query) ||
      note.toLowerCase().includes(query) ||
      category.toLowerCase().includes(query) ||
      txn.amount.toString().includes(query)
    )
  })

  const canShowPaymentConfirmation = (txn: Transaction) =>
    (txn.type === 'withdrawal' || txn.type === 'transfer') && !txn.id.startsWith('mock-')

  const handleExportPdf = async () => {
    if (isExporting) return
    setIsExporting(true)
    setExportError(null)

    try {
      const response = await fetch(`/api/export/pdf?accountId=${account.id}`)
      
      if (!response.ok) {
        throw new Error('Nepodarilo sa vygenerovať výpis.')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      // Provide a nice dynamic filename
      a.download = `vypis-${account.accountNumber.replace(/\s/g, '')}-${new Date().toISOString().split('T')[0]}.html`
      document.body.appendChild(a)
      a.click()
      
      // Cleanup
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error downloading statement:', err)
      setExportError('Nepodarilo sa stiahnuť výpis. Skúste to znova.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex-1 bg-[#030305] text-white flex flex-col font-sans min-h-[100dvh]">
      <DashboardHeader
        user={user}
        account={{
          displayName: 'Business účet',
          balance: account.balance,
          currency: account.currency,
        }}
      />

      {/* Account Info Dark Sub-Header */}
      <div className="bg-[#0a0a10] text-center pt-2.5 pb-3.5 border-t border-slate-900/40 text-white select-none">
        <div className="text-xs text-slate-400 font-semibold tracking-wider">
          Business účet | € {formatBalance(account.balance)}
        </div>
        <button 
          type="button"
          onClick={() => router.push('/dashboard')}
          className="flex items-center justify-center gap-1 mt-1.5 font-bold text-white text-base hover:text-[#327bf5] mx-auto focus:outline-none transition-colors"
        >
          História 
          <span className="inline-block text-[10px] ml-1 text-[#327bf5]">▼</span>
        </button>
      </div>

      {/* Main page content container */}
      <main className="max-w-md mx-auto w-full flex-1 flex flex-col px-4 pt-4 pb-28">
        
        {/* Back Link */}
        <button 
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1 text-xs text-[#327bf5] hover:text-blue-400 mb-4 w-fit transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Späť na prehľad
        </button>

        {/* Search Input Bar */}
        <div className="relative flex items-center mb-4">
          <Search className="w-5 h-5 text-slate-400 absolute left-4" />
          <input 
            type="text" 
            placeholder="Nájsť transakcie"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-12 pr-4 bg-[#1b1b26] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#327bf5] focus:ring-1 focus:ring-[#327bf5] transition-all shadow-sm"
          />
        </div>

        {/* Filter / Cards & Actions row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button 
              type="button"
              className="h-9 px-4 bg-[#1b1b26] border border-slate-800 rounded-xl text-xs font-semibold hover:bg-[#1b1b26]/50 flex items-center gap-1.5 focus:outline-none transition-colors"
            >
              Filter <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            <button 
              type="button"
              className="h-9 px-4 bg-[#1b1b26] border border-slate-800 rounded-xl text-xs font-semibold hover:bg-[#1b1b26]/50 flex items-center gap-1.5 focus:outline-none transition-colors"
            >
              Karty <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <button 
              type="button" 
              className="hover:text-white transition-colors" 
              aria-label="Tlačiť"
              onClick={() => window.print()}
            >
              <Printer className="w-5 h-5" />
            </button>
            <button 
              type="button" 
              className={`hover:text-white transition-colors flex items-center relative group ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Stiahnuť výpis"
              onClick={handleExportPdf}
              disabled={isExporting}
              title="Stiahnuť výpis (HTML)"
            >
              {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Export Error Alert */}
        {exportError && (
          <div className="mb-4 bg-red-900/20 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl text-center font-medium">
            {exportError}
          </div>
        )}

        {/* 2 Rezervácie Collapsible Bar */}
        <div className="george-card glow-purple border border-slate-800/40 rounded-2xl overflow-hidden mb-6 shadow-sm">
          <button
            type="button"
            onClick={() => setReservationsOpen(!reservationsOpen)}
            className="w-full p-4 flex items-center justify-between focus:outline-none hover:bg-[#1b1b26]/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-white" />
              <span className="text-sm font-bold text-white tracking-wide">2 rezervácie</span>
            </div>
            <div className={`w-7 h-7 rounded-full bg-[#1b1b26] border border-slate-800 flex items-center justify-center text-[#327bf5] transition-transform duration-200 ${reservationsOpen ? 'rotate-180' : ''}`}>
              <ChevronDown className="w-4 h-4" />
            </div>
          </button>

          {reservationsOpen && (
            <div className="px-4 pb-4 pt-1 border-t border-slate-800/40 divide-y divide-slate-800/40 text-xs">
              <div className="py-2.5 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Billa</p>
                  <p className="text-slate-400 mt-0.5">21. jún • Kartová blokácia</p>
                </div>
                <span className="font-bold text-[#ef4444] text-sm">- € 12,40</span>
              </div>
              <div className="py-2.5 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Čerpacia stanica Slovnaft</p>
                  <p className="text-slate-400 mt-0.5">21. jún • Kartová blokácia</p>
                </div>
                <span className="font-bold text-[#ef4444] text-sm">- € 45,00</span>
              </div>
            </div>
          )}
        </div>

        {/* Transactions List */}
        <div>
          <h3 className="text-[15px] font-bold text-white mb-3 px-1">Jún 2026</h3>
          <div className="flex flex-col divide-y divide-slate-800/40">
            {filteredTransactions.map((txn) => {
              const { name, note, category } = parseTxn(txn)
              const isDeposit = txn.type === 'deposit'
              const formattedAmt = isDeposit 
                ? `€ ${formatBalance(txn.amount)}` 
                : `- € ${formatBalance(txn.amount)}`

              return (
                <div key={txn.id} className="py-4 flex items-start gap-4 select-none hover:bg-[#1b1b26]/55 rounded-xl px-2 -mx-2 transition-all duration-200">
                  {/* Circle Icon */}
                  <div className="w-10 h-10 rounded-full bg-[#1b1b26] border border-slate-800 flex items-center justify-center shrink-0">
                    {name === 'Poplatok' ? (
                      /* Sparkasse S logo icon */
                      <svg className="w-5 h-5 text-white" viewBox="0 0 32 32" fill="currentColor">
                        <path d="M16 4C11.58 4 8 7.58 8 12H24C24 7.58 20.42 4 16 4Z"/>
                        <circle cx="16" cy="20" r="4" />
                      </svg>
                    ) : isDeposit ? (
                      <ArrowDownLeft className="w-5 h-5 text-[#179f42]" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-slate-400" />
                    )}
                  </div>

                  {/* Transaction Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-sm text-white truncate pr-2">{name}</h4>
                      <span className={`text-[15px] font-bold shrink-0 ${isDeposit ? 'text-[#179f42]' : 'text-[#ef4444]'}`}>
                        {formattedAmt}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      {formatTransactionDateLong(txn.createdAt)}
                    </p>
                    
                    {note && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{note}</p>
                    )}

                    {/* Category pill tag */}
                    {category && (
                      <span className={`inline-block ${getCategoryConfigByName(category).bgClass} ${getCategoryConfigByName(category).textClass} text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-2 border ${getCategoryConfigByName(category).borderClass}`}>
                        {category}
                      </span>
                    )}

                    {canShowPaymentConfirmation(txn) && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <a
                          href={`/api/export/payment-confirmation?transactionId=${encodeURIComponent(txn.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-8 px-3 rounded-xl bg-[#327bf5] hover:bg-blue-600 text-white text-[11px] font-bold inline-flex items-center transition-colors shadow-lg shadow-blue-900/30"
                        >
                          Zobraziť doklad
                        </a>
                        <a
                          href={`/api/export/payment-confirmation?transactionId=${encodeURIComponent(txn.id)}`}
                          download
                          className="h-8 px-3 rounded-xl bg-[#1b1b26] hover:bg-[#1b1b26]/85 text-white text-[11px] font-bold inline-flex items-center gap-1.5 border border-slate-800 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Stiahnuť
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {filteredTransactions.length === 0 && (
              <p className="text-center text-sm text-slate-450 py-8">Nenašli sa žiadne transakcie.</p>
            )}
          </div>
        </div>
      </main>
      <AddMoneyFooter
        accountId={account.id}
        accountNumber={account.accountNumber}
        balance={account.balance}
        currency={account.currency}
      />
      <AssistantWidget />
    </div>
  )
}
