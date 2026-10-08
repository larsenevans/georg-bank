'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  FileDown,
  Plus,
  QrCode,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHorizonBalance, formatEur } from '../balance-context'
import type { HorizonTransaction } from '../types'
import { getCategoryConfigByName } from '@/lib/categories'

interface OverviewTabProps {
  transactions: HorizonTransaction[]
  accountNumber: string
  displayName: string | null
  onQuickAction: (action: 'pay' | 'qr' | 'add' | 'statement') => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function relativeDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startToday.getTime() - startDay.getTime()) / 86400000)
  if (diffDays === 0) return 'Dnes'
  if (diffDays === 1) return 'Včera'
  return formatDate(iso)
}

function isIncoming(type: string): boolean {
  return type === 'incoming' || type === 'deposit' || type === 'topup'
}

export function OverviewTab({
  transactions,
  accountNumber,
  displayName,
  onQuickAction,
}: OverviewTabProps) {
  const { balanceEur, hideBalance, setHideBalance } = useHorizonBalance()
  const [copied, setCopied] = useState(false)
  const [filterMode, setFilterMode] = useState<'all' | 'users' | 'admin'>('all')

  const maskBalance = hideBalance ? '€ •••••' : formatEur(balanceEur)

  const filteredTransactions = useMemo(() => {
    if (filterMode === 'admin') return transactions.filter((t) => t.isSuperadmin)
    if (filterMode === 'users') return transactions.filter((t) => !t.isSuperadmin)
    return transactions
  }, [transactions, filterMode])

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    let income = 0
    let expense = 0
    for (const t of transactions) {
      const d = new Date(t.createdAt)
      if (Number.isNaN(d.getTime()) || d < monthStart) continue
      if (isIncoming(t.type)) income += Math.abs(t.amountEur)
      else expense += Math.abs(t.amountEur)
    }
    return { incomeEur: income, expenseEur: expense }
  }, [transactions])

  const copyIban = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard may be unavailable; ignore silently.
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* ---- Horizon Balance Banner ---- */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#4318ff] via-[#7a3cff] to-[#a855f7] p-5 text-white shadow-[0_20px_50px_-12px_rgba(122,60,255,0.55)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-[#00d4ff]/20 blur-3xl" />

        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/70">
              {displayName || 'Business účet'}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{maskBalance}</p>
            <p className="mt-1 text-xs text-white/60">Aktuálny zostatok</p>
          </div>
          <button
            type="button"
            onClick={() => setHideBalance(!hideBalance)}
            aria-label={hideBalance ? 'Zobraziť zostatok' : 'Skryť zostatok'}
            className="rounded-full bg-white/15 p-2.5 backdrop-blur transition active:scale-90"
          >
            {hideBalance ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        <div className="relative mt-5 flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-white/60">Číslo účtu</p>
            <p className="truncate font-mono text-sm tracking-wide">{accountNumber}</p>
          </div>
          <button
            type="button"
            onClick={copyIban}
            aria-label="Kopírovať číslo účtu"
            className="shrink-0 rounded-lg bg-white/15 p-2 transition active:scale-90"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </section>

      {/* ---- Quick Actions ---- */}
      <section className="grid grid-cols-4 gap-2.5">
        <QuickAction
          label="Zaplatiť"
          icon={<ArrowUpRight className="h-5 w-5" />}
          onClick={() => onQuickAction('pay')}
        />
        <QuickAction
          label="QR"
          icon={<QrCode className="h-5 w-5" />}
          onClick={() => onQuickAction('qr')}
        />
        <QuickAction
          label="Pridať"
          icon={<Plus className="h-5 w-5" />}
          onClick={() => onQuickAction('add')}
        />
        <QuickAction
          label="Výpis PDF"
          icon={<FileDown className="h-5 w-5" />}
          onClick={() => onQuickAction('statement')}
        />
      </section>

      {/* ---- MiniStatistics ---- */}
      <section className="grid grid-cols-2 gap-3">
        <StatCard
          label="Príjmy tento mesiac"
          value={formatEur(stats.incomeEur)}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="green"
        />
        <StatCard
          label="Výdavky tento mesiac"
          value={formatEur(stats.expenseEur)}
          icon={<TrendingDown className="h-4 w-4" />}
          tone="red"
        />
      </section>

      {/* ---- Transaction History & Filter ---- */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">História transakcií</h2>
          <span className="text-xs text-muted-foreground">{filteredTransactions.length} zobrazených</span>
        </div>

        {/* Prepínač filtrov: Všetky vs Bežní používatelia vs Superadmin */}
        <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-border bg-card/60 p-1 text-xs">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={cn(
              'flex-1 rounded-lg py-1.5 px-2 text-center font-medium transition',
              filterMode === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Všetky ({transactions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('users')}
            className={cn(
              'flex-1 rounded-lg py-1.5 px-2 text-center font-medium transition',
              filterMode === 'users'
                ? 'bg-blue-600 text-white shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            👤 Klienti ({transactions.filter((t) => !t.isSuperadmin).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('admin')}
            className={cn(
              'flex-1 rounded-lg py-1.5 px-2 text-center font-medium transition',
              filterMode === 'admin'
                ? 'bg-amber-500 text-black shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            👑 Admin ({transactions.filter((t) => t.isSuperadmin).length})
          </button>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {filterMode === 'admin'
              ? 'Žiadne pohyby generované superadminom.'
              : filterMode === 'users'
                ? 'Zatiaľ tu nie sú žiadne pohyby bežných klientov.'
                : 'Zatiaľ tu nie sú žiadne pohyby.'}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredTransactions.slice(0, 20).map((t) => (
              <TransactionRow key={t.id} transaction={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function QuickAction({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card py-3.5 text-xs font-medium text-foreground transition active:scale-95"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      {label}
    </button>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: 'green' | 'red'
}) {
  const toneClass = tone === 'green' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
        {icon}
      </div>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function TransactionRow({ transaction }: { transaction: HorizonTransaction }) {
  const incoming = isIncoming(transaction.type)
  const category = transaction.category ? getCategoryConfigByName(transaction.category) : null
  const amountAbs = Math.abs(transaction.amountEur)

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          incoming ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
        }`}
      >
        {incoming ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{transaction.recipient}</p>
          {transaction.isSuperadmin ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/20">
              <Crown className="h-2.5 w-2.5 inline" /> God-Mode
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              👤 Klient
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground mt-0.5">
          {relativeDate(transaction.createdAt)}
          {category ? ` · ${category.name}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-sm font-semibold tabular-nums ${incoming ? 'text-emerald-500' : 'text-foreground'}`}>
          {incoming ? '+' : '−'}
          {formatEur(amountAbs)}
        </span>
        {transaction.pdfUrl && (
          <a
            href={transaction.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Stiahnuť PDF potvrdenie"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:text-primary"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>
    </li>
  )
}