'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, CreditCard, Crown, LayoutGrid, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HorizonBalanceProvider } from './balance-context'
import { OverviewTab } from './tabs/overview-tab'
import { UserSettingsTab } from './tabs/user-settings-tab'
import { SuperadminSheet } from './admin/superadmin-sheet'
import type { HorizonAccount, HorizonShellData, HorizonTransaction } from './types'

type TabId = 'overview' | 'cards' | 'settings'

interface HorizonShellProps {
  data: HorizonShellData
}

/**
 * 100dvh, mobile-first Horizon UI banking shell. Header stays fixed on top,
 * the active tab scrolls between it and the fixed bottom navigation, and the
 * superadmin sheet slides up for god-mode controls.
 */
export function HorizonShell({ data }: HorizonShellProps) {
  // Seed theme from Horizon palette (dark by default; Settings overrides).
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hb.theme')
      document.documentElement.classList.toggle('dark', saved !== 'light')
    } catch {
      document.documentElement.classList.add('dark')
    }
  }, [])

  return (
    <HorizonBalanceProvider initialBalanceEur={data.balanceEur}>
      <HorizonShellInner data={data} />
    </HorizonBalanceProvider>
  )
}

function HorizonShellInner({ data }: HorizonShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [adminOpen, setAdminOpen] = useState(false)
  const [transactions, setTransactions] = useState<HorizonTransaction[]>(data.transactions)
  const [refreshKey, setRefreshKey] = useState(0)

  const refreshTransactions = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as {
        transactions?: Array<{
          id: string
          recipient: string
          amount: number
          date?: string
          createdAt?: string
          type?: string
          status?: string
          note?: string
          pdfUrl?: string | null
        }>
      }
      if (Array.isArray(json.transactions)) {
        setTransactions(
          json.transactions.map((t) => ({
            id: t.id,
            recipient: t.recipient || 'Platba',
            amountEur: Math.abs(Number(t.amount) || 0),
            type: t.type || 'transfer',
            status: t.status,
            note: t.note,
            date: t.date || '',
            createdAt: t.createdAt || new Date().toISOString(),
            pdfUrl: t.pdfUrl || null,
          })),
        )
      }
    } catch {
      // Keep the server-fetched list as fallback.
    }
  }, [])

  // Re-load whenever the admin sheet mutates data (balance / new movement).
  useEffect(() => {
    if (refreshKey > 0) void refreshTransactions()
  }, [refreshKey, refreshTransactions])

  const onTransactionsChanged = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const account: HorizonAccount | null = data.account

  return (
    <div className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-background text-foreground select-none">
      {/* ---- Fixed Header ---- */}
      <header className="shrink-0 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              aria-label="Späť na prehľad"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-bold leading-tight">George</h1>
              <p className="text-[11px] text-muted-foreground">Horizon Bank</p>
            </div>
          </div>
          {data.isSuperadmin && (
            <button
              type="button"
              onClick={() => setAdminOpen(true)}
              aria-label="God-Mode panel"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-amber-300 to-amber-500 text-black shadow-[0_8px_20px_-6px_rgba(245,158,11,0.6)]"
            >
              <Crown className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* ---- Scroller (between header and bottom nav) ---- */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar px-5">
        <div key={activeTab} className="animate-fade-in py-1">
          {activeTab === 'overview' && (
            <OverviewTab
              transactions={transactions}
              accountNumber={(account && account.accountNumber) || ''}
              displayName={data.displayName}
              onQuickAction={(action) => {
                if (action === 'statement') {
                  void refreshTransactions()
                }
              }}
            />
          )}
          {activeTab === 'settings' && <UserSettingsTab />}
          {activeTab === 'cards' && <CardsTab onBack={() => setActiveTab('overview')} />}
        </div>
      </main>

      {/* ---- Fixed Bottom Nav ---- */}
      <nav className="shrink-0 border-t border-border bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="grid grid-cols-4 gap-1 px-3">
          <NavButton
            active={activeTab === 'overview'}
            icon={<LayoutGrid className="h-5 w-5" />}
            label="Prehľad"
            onClick={() => setActiveTab('overview')}
          />
          <NavButton
            active={activeTab === 'cards'}
            icon={<CreditCard className="h-5 w-5" />}
            label="Karty"
            onClick={() => setActiveTab('cards')}
          />
          <NavButton
            active={activeTab === 'settings'}
            icon={<Settings className="h-5 w-5" />}
            label="Nastavenia"
            onClick={() => setActiveTab('settings')}
          />
          {data.isSuperadmin ? (
            <button
              type="button"
              onClick={() => setAdminOpen(true)}
              className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium text-amber-500 active:scale-95"
            >
              <Crown className="h-5 w-5" />
              Admin
            </button>
          ) : (
            <div className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] text-transparent">
              <Crown className="h-5 w-5" />
              •
            </div>
          )}
        </div>
      </nav>

      {/* ---- Superadmin God-Mode Sheet ---- */}
      <SuperadminSheet
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        onTransactionsChanged={onTransactionsChanged}
      />
    </div>
  )
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition active:scale-95',
        active ? 'text-[#4318ff]' : 'text-muted-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/** Minimal Cards tab — product card preview. */
function CardsTab({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-5 pb-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Späť
      </button>

      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#0a0a1a] via-[#1b1533] to-[#3a2b6b] p-5 text-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[#4318ff]/40 blur-2xl" />
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-white/60">George Credit</div>
          <div className="flex h-7 w-10 items-center justify-center rounded-md bg-linear-to-br from-amber-300 to-amber-500 text-[10px] font-bold text-black">
            VIS
          </div>
        </div>
        <p className="mt-5 font-mono text-lg tracking-widest">•••• •••• •••• 4242</p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] text-white/50">DRŽITEĽ</p>
            <p className="text-xs font-medium">PÁN BIZNIS</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/50">EXP</p>
            <p className="text-xs font-medium">12/28</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MiniPanel label="Bezkontaktné platby" />
        <MiniPanel label="Online platby" />
        <MiniPanel label="Výbery z bankomatu" />
        <MiniPanel label="Limity karty" />
      </div>
    </div>
  )
}

function MiniPanel({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <CreditCard className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium leading-tight">{label}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Zapnuté</p>
    </div>
  )
}