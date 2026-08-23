'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronUp,
  ChevronDown,
  Download,
  Search,
  WalletCards,
  X,
} from 'lucide-react'
import { TransferForm } from '@/components/transfer-form'
import { AddMoneyFooter } from '@/components/add-money-footer'
import { AssistantWidget } from '@/components/assistant/assistant-widget'
import { formatTransactionDateMedium, formatTransactionDateTime } from '@/lib/format-date'
import { getCategoryConfigByName } from '@/lib/categories'
import { deleteAllTransactions } from '@/app/actions/banking'

interface BankAccount {
  id: string
  accountNumber: string
  accountType: string
  balance: string | number
  currency: string
  isActive: boolean
}

interface DashboardClientProps {
  user: { name: string | null; email: string }
  accounts: BankAccount[]
  transactions: DashboardTransaction[]
}

interface DashboardTransaction {
  id: string
  fromAccountId: string | null
  toAccountId: string | null
  amount: string | number
  balanceBefore: string | number | null
  balanceAfter: string | number | null
  type: string
  description: string | null
  status: string
  createdAt: string
}

type TransactionFilter = 'all' | 'incoming' | 'outgoing' | 'deposit'

export function DashboardClient({ accounts, transactions }: DashboardClientProps) {
  const router = useRouter()
  const [productsOpen, setProductsOpen] = useState(true)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all')
  const [selectedTransaction, setSelectedTransaction] = useState<DashboardTransaction | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const getErrorMessage = (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback

  const handleDeleteAllTransactions = async () => {
    const pin = window.prompt('Zadajte PIN kód pre potvrdenie vymazania všetkých platieb:')
    if (pin === null) return // User cancelled

    setIsDeleting(true)
    try {
      await deleteAllTransactions(pin)
      router.refresh()
    } catch (err: unknown) {
      alert(getErrorMessage(err, 'Nepodarilo sa vymazať platby.'))
    } finally {
      setIsDeleting(false)
    }
  }

  useEffect(() => {
    const handleOpen = () => setShowTransfer(true)
    window.addEventListener('open-transfer-modal', handleOpen)
    return () => window.removeEventListener('open-transfer-modal', handleOpen)
  }, [])

  // Auto push / browser notifications disabled (were spamming /api/push/send on load).

  // Use the active account ID or fallback
  const activeAccount = accounts[0]
  const activeAccountId = activeAccount?.id || ''

  const formatBalance = (val: number | string | undefined) => {
    if (val === undefined || val === null) return '0,00'
    return (Number(val) / 100).toFixed(2).replace('.', ',')
  }

  const formatMoney = (val: number | string | null | undefined, currency = activeAccount?.currency ?? 'EUR') => {
    if (val === undefined || val === null) return `0,00 ${currency}`
    return `${(Number(val) / 100).toFixed(2).replace('.', ',')} ${currency}`
  }

  const parseTransaction = (txn: DashboardTransaction) => {
    const [name = '', note = '', category = ''] = (txn.description ?? '').split('|')
    const isOutgoing = txn.type === 'withdrawal' || txn.type === 'transfer'
    const isIncoming = txn.type === 'deposit' && Boolean(txn.toAccountId)
    const isTopUp = txn.type === 'deposit' && !txn.toAccountId

    return {
      name: name.trim() || (isOutgoing ? 'Odoslaná platba' : isIncoming ? 'Prijatá platba' : 'Dobitie účtu'),
      note: note.trim() || (isOutgoing ? 'Interný prevod' : isIncoming ? 'Prijatá platba' : 'Pridanie peňazí'),
      category: category.trim() || (isOutgoing ? 'Nezaradené výdavky' : 'Ostatné nepravidelné príjmy'),
      direction: isOutgoing ? 'outgoing' : isIncoming ? 'incoming' : isTopUp ? 'deposit' : 'incoming',
      label: isOutgoing ? 'Odoslané' : isIncoming ? 'Prijaté' : 'Dobitie',
      signedAmount: isOutgoing ? `- ${formatMoney(txn.amount)}` : `+ ${formatMoney(txn.amount)}`,
      amountClass: isOutgoing ? 'text-[#ef4444]' : 'text-[#179f42]',
    }
  }

  const filteredTransactions = transactions.filter((txn) => {
    if (transactionFilter === 'all') return true
    return parseTransaction(txn).direction === transactionFilter
  })

  const regularTransactions = filteredTransactions

  const filterItems: { value: TransactionFilter; label: string }[] = [
    { value: 'all', label: 'Všetko' },
    { value: 'incoming', label: 'Prijaté' },
    { value: 'outgoing', label: 'Odoslané' },
    { value: 'deposit', label: 'Dobitie' },
  ]

  // Card items exactly as shown in the screenshot
  const cards = [
    {
      name: 'VISA elektronická',
      owner: 'PETER',
      status: 'BLOKOVANÁ',
      type: 'visa-electron'
    },
    {
      name: 'VISA elektronická Vlastná karta',
      owner: 'PETER',
      status: 'BLOKOVANÁ',
      type: 'visa-electron'
    },
    {
      name: 'VISA elektronická',
      owner: 'PETER',
      number: '4544 12** **** 1234',
      type: 'visa-electron'
    },
    {
      name: 'VISA elektronická Vlastná karta',
      owner: 'PETER',
      number: '4544 12** **** 4321',
      type: 'visa-electron'
    },
    {
      name: 'VISA Platinum',
      owner: 'PETER',
      number: '4544 12** **** 4444',
      type: 'visa-platinum'
    },
    {
      name: 'VISA elektronická Vlastná karta',
      owner: 'PETER',
      status: 'BLOKOVANÁ',
      type: 'visa-electron'
    }
  ]

  return (
    <div className="flex-1 bg-[#030305] text-white flex flex-col font-sans min-h-dvh select-none">
      {/* Domov full width title bar */}
      <div className="w-full bg-[#0a0a10] border-b border-slate-900/40 px-6 py-3.5 text-[15px] font-bold text-white tracking-tight select-none">
        Domov
      </div>

      {/* Main Container */}
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col px-4 pt-4 pb-28">
        
        {/* Vaše produkty collapsible header bar */}
        <div className="w-full george-card glow-purple rounded-2xl overflow-hidden mb-5 border border-slate-800/40 shadow-lg shadow-black/20">
          <button
            type="button"
            onClick={() => setProductsOpen(!productsOpen)}
            className="w-full p-4 flex items-center justify-between hover:bg-[#1b1b26]/50 transition-all duration-200 ease-out focus:outline-none"
          >
            <span className="text-base font-bold text-white tracking-tight">Vaše produkty</span>
            <div className="w-7 h-7 rounded-full bg-[#1b1b26] border border-slate-800 flex items-center justify-center text-[#327bf5]">
              {productsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {productsOpen && (
            <div className="px-4 pb-6 pt-2 border-t border-slate-800/40 bg-transparent">
              
              {/* Bežné účty Section Header */}
              <div className="flex justify-between items-center mb-4 mt-2 select-none">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bežné účty</span>
                <button type="button" className="text-xs font-bold text-[#327bf5] hover:text-blue-400 transition-colors">
                  Usporiadať
                </button>
              </div>

              {/* SPACE účet clickable card */}
              <div 
                onClick={() => {
                  if (activeAccountId) {
                    router.push(`/dashboard/accounts/${activeAccountId}`)
                  }
                }}
                className="flex items-center gap-4 py-3 hover:bg-[#1b1b26]/55 rounded-xl px-2 -mx-2 cursor-pointer transition-all duration-200 ease-out"
              >
                <div className="w-12 h-12 rounded-full border border-indigo-500/25 overflow-hidden shrink-0 shadow-inner">
                  <img 
                    src="/images/default-avatar.svg"
                    alt="Account Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 font-medium">Peter</p>
                  <h4 className="font-bold text-sm text-white mt-0.5">SPACE účet</h4>
                  <p className="text-[11px] text-slate-400 font-medium tracking-wide mt-0.5">{activeAccount?.accountNumber ?? 'SK67 0900 0000 0050 4463 0752'}</p>
                  <p className="text-sm font-bold text-[#179f42] mt-1">€ {formatBalance(activeAccount?.balance ?? 85)}</p>
                </div>
              </div>

              {/* Karty Section Header */}
              <div className="mb-4 mt-6">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Karty</span>
              </div>

              {/* Cards List */}
              <div className="flex flex-col divide-y divide-slate-800/40">
                {cards.map((card, idx) => (
                  <div key={idx} className="flex items-center gap-4 py-3.5 px-1 select-none">
                    
                    {/* Card Icon */}
                    {card.type === 'visa-platinum' ? (
                      /* Platinum Card Icon */
                      <div className="w-11 h-11 rounded-full border border-slate-800 overflow-hidden shrink-0 bg-linear-to-br from-[#d4af37] via-[#a37c1a] to-[#5c4008] flex items-center justify-center">
                        <span className="text-xs font-bold text-white">PLATINUM</span>
                      </div>
                    ) : (
                      /* Standard round VISA card graphic icon */
                      <div className="w-11 h-11 rounded-full bg-[#1b1b26] border border-slate-800 flex flex-col items-center justify-center shrink-0 text-white font-black text-[9px] tracking-wider">
                        VISA
                      </div>
                    )}

                    {/* Card Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase">{card.owner}</p>
                      <h4 className="font-bold text-[13px] text-white mt-0.5 truncate">{card.name}</h4>
                      
                      {card.number && (
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5 tracking-wider">{card.number}</p>
                      )}

                      {card.status === 'BLOKOVANÁ' && (
                        <span className="bg-red-500/10 text-red-400 text-[8px] font-black px-2 py-0.5 rounded-xl border border-red-500/20 mt-1 inline-block uppercase tracking-widest">
                          BLOKOVANÁ
                        </span>
                      )}
                    </div>

                  </div>
                ))}
              </div>

            </div>
          )}
        </div>

        <section className="w-full george-card glow-purple rounded-2xl overflow-hidden mb-5 border border-slate-800/40 shadow-lg shadow-black/20">
          <div className="p-4 border-b border-slate-800/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">História</p>
                <h2 className="text-base font-bold text-white mt-1">Prehľad prevodov</h2>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400 font-semibold">Aktuálny zostatok</p>
                <p className="text-sm font-black text-[#179f42] mt-0.5">
                  € {formatBalance(activeAccount?.balance ?? 0)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {filterItems.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTransactionFilter(item.value)}
                  className={`h-9 shrink-0 rounded-full border px-3 text-xs font-bold transition-all duration-200 ${
                    transactionFilter === item.value
                      ? 'border-[#327bf5] bg-[#327bf5] text-white'
                      : 'border-slate-800 bg-[#1b1b26] text-slate-355 hover:border-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>



          {regularTransactions.length > 0 ? (
            <div className="divide-y divide-slate-800/40">
              {regularTransactions.slice(0, 12).map((txn) => {
                const meta = parseTransaction(txn)
                const Icon = meta.direction === 'outgoing' ? ArrowUpRight : meta.direction === 'deposit' ? WalletCards : ArrowDownLeft

                return (
                  <button
                    key={txn.id}
                    type="button"
                    onClick={() => setSelectedTransaction(txn)}
                    className="w-full px-4 py-3.5 text-left transition-all duration-200 ease-out hover:bg-[#1b1b26]/55 focus-visible:bg-[#1b1b26]/55 focus-visible:outline-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-[#1b1b26]">
                        <Icon className={`h-4 w-4 ${meta.amountClass}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-white">{meta.name}</p>
                          <span className="shrink-0 rounded-full bg-[#1b1b26] border border-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">
                          {formatTransactionDateTime(txn.createdAt)} | {meta.note}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          Zostatok po: {txn.balanceAfter ? `€ ${formatBalance(txn.balanceAfter)}` : 'nezaznamenané'}
                        </p>
                        {meta.category && (
                          <span className={`inline-block ${getCategoryConfigByName(meta.category).bgClass} ${getCategoryConfigByName(meta.category).textClass} text-[9px] font-bold px-2 py-0.5 rounded-full mt-1.5 border ${getCategoryConfigByName(meta.category).borderClass} w-fit`}>
                            {meta.category}
                          </span>
                        )}
                      </div>
                      <p className={`shrink-0 text-sm font-black ${meta.amountClass}`}>
                        {meta.signedAmount.replace('EUR', '€')}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-800 bg-[#1b1b26]">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-3 text-sm font-bold text-white">Žiadne transakcie v tomto filtri</p>
              <p className="mt-1 text-xs text-slate-400">Po ďalšom prevode sa objavia priamo tu.</p>
            </div>
          )}
        </section>

        {/* Samostatný kontajner pre pridanie peňazí */}
        <AddMoneyFooter
          accountId={activeAccountId}
          accountNumber={activeAccount?.accountNumber}
          balance={activeAccount?.balance}
          currency={activeAccount?.currency ?? 'EUR'}
        />

        {/* Samostatný kontajner pre Asistenta */}
        <AssistantWidget />

        {/* Tlačidlo na vymazanie všetkých platieb */}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleDeleteAllTransactions}
            className="h-8 px-4 rounded-xl bg-red-600/20 hover:bg-red-600/35 border border-red-500/20 text-red-400 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors shadow-md"
          >
            {isDeleting ? 'Vymazávam...' : 'Vymazať všetky platby'}
          </button>
        </div>

      </div>

      {selectedTransaction && (
        <div className="fixed inset-0 z-80 flex items-end justify-center bg-black/70 px-4 pb-4 pt-20 backdrop-blur-sm">
          <div className="w-full max-w-md george-card glow-purple rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800/40 p-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Detail transakcie</p>
                <h3 className="mt-1 text-lg font-black text-white">
                  {parseTransaction(selectedTransaction).name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="rounded-full p-1.5 text-slate-400 transition-all duration-200 hover:bg-[#1b1b26]/50 hover:text-white focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Zavrieť detail transakcie"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4 text-sm">
              {[
                ['Suma', parseTransaction(selectedTransaction).signedAmount.replace('EUR', '€')],
                ['Typ', parseTransaction(selectedTransaction).label],
                ['Stav', selectedTransaction.status],
                ['Dátum', formatTransactionDateMedium(selectedTransaction.createdAt)],
                ['Poznámka', parseTransaction(selectedTransaction).note],
                ['Kategória', parseTransaction(selectedTransaction).category],
                ['Zostatok pred', selectedTransaction.balanceBefore ? `€ ${formatBalance(selectedTransaction.balanceBefore)}` : 'nezaznamenané'],
                ['Zostatok po', selectedTransaction.balanceAfter ? `€ ${formatBalance(selectedTransaction.balanceAfter)}` : 'nezaznamenané'],
                ['ID transakcie', selectedTransaction.id],
              ].map(([label, value]) => {
                const isCategory = label === 'Kategória'
                const catConfig = isCategory ? getCategoryConfigByName(value as string) : null

                return (
                  <div key={label} className="flex items-start justify-between gap-4 rounded-xl bg-[#1b1b26] border border-slate-800/40 px-3 py-2.5">
                    <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
                    {isCategory && catConfig ? (
                      <span className={`inline-block ${catConfig.bgClass} ${catConfig.textClass} text-[10px] font-bold px-2 py-0.5 rounded-full border ${catConfig.borderClass}`}>
                        {value}
                      </span>
                    ) : (
                      <span className="break-all text-right text-xs font-semibold text-white">{value}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {(selectedTransaction.type === 'withdrawal' || selectedTransaction.type === 'transfer') && (
              <div className="border-t border-slate-800/40 p-4 flex flex-col gap-2">
                <a
                  href={`/api/export/payment-confirmation?transactionId=${encodeURIComponent(selectedTransaction.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-[#327bf5] hover:bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/30"
                >
                  Zobraziť doklad
                </a>
                <a
                  href={`/api/export/payment-confirmation?transactionId=${encodeURIComponent(selectedTransaction.id)}`}
                  download
                  className="w-full h-11 rounded-xl bg-[#1b1b26] hover:bg-[#1b1b26]/85 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors border border-slate-800"
                >
                  <Download className="h-4 w-4" />
                  Stiahnuť doklad
                </a>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Full-screen Transfer Modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-60 bg-[#030305] animate-fade-in flex flex-col overflow-y-auto">
          <TransferForm 
            accountId={activeAccountId} 
            accounts={accounts}
            onClose={() => setShowTransfer(false)}
          />
        </div>
      )}

    </div>
  )
}
