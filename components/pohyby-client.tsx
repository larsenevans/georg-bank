'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DAILY_PAYMENT_LIMIT_ENABLED,
  DAILY_PAYMENT_LIMIT_EUR,
} from '@/lib/daily-payment-limit'
import { subscribePohybyLive } from '@/lib/pohyby-live'
import { syncWidgetFromTransactionsApi } from '@/lib/widget'
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react'

type DailyLimit = {
  enabled?: boolean
  limitEur: number | null
  usedEur: number
  remainingEur: number | null
}

type TopupPolicy = {
  manualTopupDisabled?: boolean
  autoRefillEveryHours?: number
  autoRefillAllowedInMs?: number
  message?: string
}

type Movement = {
  id: string
  recipient: string
  amount: number
  createdAt: string
  type: string
  status: string
  note?: string
  balanceAfter?: number
}

function formatEur(value: number) {
  return new Intl.NumberFormat('sk-SK', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('sk-SK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function isOutgoing(type: string, amount: number) {
  if (type === 'incoming' || type === 'deposit') return false
  if (type === 'outgoing' || type === 'withdrawal' || type === 'transfer') return true
  return amount < 0
}

export function PohybyClient() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [dailyLimit, setDailyLimit] = useState<DailyLimit>({
    limitEur: DAILY_PAYMENT_LIMIT_ENABLED ? DAILY_PAYMENT_LIMIT_EUR : null,
    usedEur: 0,
    remainingEur: DAILY_PAYMENT_LIMIT_ENABLED ? DAILY_PAYMENT_LIMIT_EUR : null,
  })
  const [topupPolicy, setTopupPolicy] = useState<TopupPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/transactions', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nepodarilo sa načítať pohyby')
      }
      setMovements(data.transactions ?? [])
      if (data.dailyLimit) setDailyLimit(data.dailyLimit)
      if (data.topupPolicy) setTopupPolicy(data.topupPolicy)
      setUpdatedAt(new Date())
      setError('')
      void syncWidgetFromTransactionsApi({
        transactions: data.transactions ?? [],
        dailyLimit: data.dailyLimit,
        accounts: data.accounts,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba načítania')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // Fast poll so every outgoing payment shows within ~1.5s even without BroadcastChannel.
    const id = window.setInterval(() => void load(true), 1500)
    const unsub = subscribePohybyLive(() => {
      void load(true)
    })
    const onFocus = () => void load(true)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void load(true)
    })
    return () => {
      window.clearInterval(id)
      unsub()
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const limitEnabled = dailyLimit.enabled ?? DAILY_PAYMENT_LIMIT_ENABLED
  const usedPct = limitEnabled
    ? Math.min(100, (dailyLimit.usedEur / Math.max(dailyLimit.limitEur ?? 1, 1)) * 100)
    : 0

  return (
    <div className="min-h-[100dvh] bg-[#0b1220] text-slate-100">
      <header className="border-b border-white/10 bg-[#0f1a2e]/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">Live</p>
            <h1 className="text-xl font-semibold tracking-tight">Pohyby na účte</h1>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            data-testid="pohyby-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Obnoviť
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        <section
          className="rounded-2xl border border-sky-400/20 bg-gradient-to-br from-[#13233f] to-[#0d1729] p-5 shadow-[0_0_40px_rgba(56,189,248,0.08)]"
          data-testid="pohyby-daily-limit"
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-300">
                {limitEnabled
                  ? 'Limit platieb (24 h) — nie zostatok účtu'
                  : 'Platby (24 h) — bez denného limitu'}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {limitEnabled && dailyLimit.remainingEur != null
                  ? formatEur(dailyLimit.remainingEur)
                  : 'Neobmedzené'}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {limitEnabled && dailyLimit.limitEur != null
                  ? `zostáva z limitu ${formatEur(dailyLimit.limitEur)}`
                  : 'Obmedzuje len zostatok na účte'}
              </p>
            </div>
            <div className="text-right text-sm text-slate-300">
              <p>Za 24 h použité</p>
              <p className="mt-1 text-lg font-medium tabular-nums text-amber-200">
                {formatEur(dailyLimit.usedEur)}
              </p>
            </div>
          </div>
          {limitEnabled && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-sky-400 transition-all duration-500"
                style={{ width: `${usedPct}%` }}
              />
            </div>
          )}
          {updatedAt && (
            <p className="mt-3 text-xs text-slate-500">
              Aktualizované {updatedAt.toLocaleTimeString('sk-SK')}
            </p>
          )}
          <div
            className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100/95"
            data-testid="pohyby-topup-policy"
          >
            <p className="font-semibold text-amber-200">Pravidlo dobíjania</p>
            <p className="mt-1 leading-relaxed">
              {topupPolicy?.message ||
                (topupPolicy?.manualTopupDisabled
                  ? 'Manuálne dobíjanie € je zakázané. Automatické obnovenie zostatku je možné až po 24 hodinách (max 1×).'
                  : 'Manuálne dobíjanie € je povolené (sandbox). Automatické obnovenie zostatku max 1× / 24 h.')}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#101a2c]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="font-medium">História pohybov</h2>
            <span className="text-xs text-slate-400">{movements.length} záznamov</span>
          </div>

          {loading ? (
            <p className="px-4 py-8 text-center text-slate-400">Načítavam…</p>
          ) : error ? (
            <p className="px-4 py-8 text-center text-rose-300">{error}</p>
          ) : movements.length === 0 ? (
            <p className="px-4 py-8 text-center text-slate-400">
              Zatiaľ žiadne pohyby v databáze.
            </p>
          ) : (
            <ul className="divide-y divide-white/5" data-testid="pohyby-list">
              {movements.map((m) => {
                const outgoing = isOutgoing(m.type, m.amount)
                const signed = outgoing ? -Math.abs(m.amount) : Math.abs(m.amount)
                return (
                  <li key={m.id} className="flex items-start gap-3 px-4 py-3.5">
                    <div
                      className={`mt-0.5 rounded-full p-2 ${
                        outgoing
                          ? 'bg-rose-500/15 text-rose-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {outgoing ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate font-medium text-slate-100">
                          {m.recipient}
                        </p>
                        <p
                          className={`shrink-0 tabular-nums font-semibold ${
                            outgoing ? 'text-rose-300' : 'text-emerald-300'
                          }`}
                        >
                          {outgoing ? '−' : '+'}
                          {formatEur(Math.abs(signed))}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{formatWhen(m.createdAt)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {m.status}
                        {typeof m.balanceAfter === 'number'
                          ? ` · zostatok ${formatEur(m.balanceAfter)}`
                          : ''}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <p className="pb-8 text-center text-xs text-slate-500">
          Live · auto-obnova 1,5 s · každá odchádzajúca platba sa zapisuje hneď do DB
        </p>
      </main>
    </div>
  )
}
