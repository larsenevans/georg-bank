'use client'

import { useState, useEffect, type ReactNode } from 'react'
import {
  Banknote,
  Bell,
  Check,
  Crown,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  Unlock,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHorizonBalance } from '../balance-context'
import type { HorizonLiveUser } from '../types'
import { subscribeToPush, showLocalNotification } from '@/lib/push-notifications'

interface SuperadminSheetProps {
  open: boolean
  onClose: () => void
  onTransactionsChanged: () => void
}

interface AdminResult {
  ok: boolean
  text: string
}

/**
 * Superadmin "God-Mode" panel. Every action hits `/api/account/admin-actions`
 * and refreshes the shared balance so the overview banner updates live.
 * Only rendered in the shell when the session is a superadmin.
 */
export function SuperadminSheet({ open, onClose, onTransactionsChanged }: SuperadminSheetProps) {
  const { setBalanceEur } = useHorizonBalance()
  const [result, setResult] = useState<AdminResult | null>(null)
  const [busy, setBusy] = useState(false)

  // Balance edit
  const [amountEur, setAmountEur] = useState<number>(8850)
  const [setBalanceBusy, setSetBalanceBusy] = useState(false)

  // Access change
  const [pin, setPin] = useState('')
  const [superadminCode, setSuperadminCode] = useState('1111111199999999')
  const [accessBusy, setAccessBusy] = useState(false)

  // Quick movement generator
  const [recipient, setRecipient] = useState('')
  const [movementAmount, setMovementAmount] = useState<number>(100)
  const [movementType, setMovementType] = useState<'incoming' | 'outgoing'>('incoming')
  const [note, setNote] = useState('')
  const [movementBusy, setMovementBusy] = useState(false)

  // Live Users monitoring
  const [liveUsers, setLiveUsers] = useState<HorizonLiveUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)

  // Push Broadcast state
  const [pushTitle, setPushTitle] = useState('George Bank')
  const [pushMsg, setPushMsg] = useState('Váš účet bol úspešne aktualizovaný.')
  const [pushSending, setPushSending] = useState(false)
  const [pushResult, setPushResult] = useState<string | null>(null)

  const showError = (text: string) => setResult({ ok: false, text })
  const showOk = (text: string) => setResult({ ok: true, text })

  const fetchLiveUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/account/admin-actions?action=get_live_users')
      const data = await res.json()
      if (data.ok && Array.isArray(data.liveUsers)) {
        setLiveUsers(data.liveUsers)
      }
    } catch {
      // silent
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (open) {
      void fetchLiveUsers()
    }
  }, [open])

  const handleUnlockUser = async (requestId: string) => {
    setUnlockingId(requestId)
    const res = await runAction('unlock_user_payment', { requestId })
    setUnlockingId(null)
    if (res) {
      void fetchLiveUsers()
      onTransactionsChanged()
    }
  }

  const runAction = async (
    action: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; message?: string; error?: string } | null> => {
    try {
      const res = await fetch('/api/account/admin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || data.ok === false) {
        showError((data.message as string) || (data.error as string) || 'Akcia zlyhala.')
        return null
      }
      if (data.ok === true) {
        showOk((data.message as string) || 'Hotovo.')
        if (typeof data.balanceEur === 'number') {
          setBalanceEur(data.balanceEur)
        }
      }
      return {
        ok: true,
        message: data.message as string | undefined,
        error: data.error as string | undefined,
      }
    } catch {
      showError('Sieťová chyba pri komunikácii so serverom.')
      return null
    }
  }

  const handleSetBalance = async () => {
    if (!Number.isFinite(amountEur) || amountEur < 0) {
      showError('Zadajte platnú sumu v EUR.')
      return
    }
    setSetBalanceBusy(true)
    setResult(null)
    const data = await runAction('set_balance', { amountEur })
    setSetBalanceBusy(false)
    if (data) onTransactionsChanged()
  }

  const quickAdd = (delta: number) => {
    setAmountEur((prev) => Math.max(0, Math.round((prev + delta) * 100) / 100))
  }

  const handleResetSession = async () => {
    setBusy(true)
    setResult(null)
    const data = await runAction('reset_session', {})
    setBusy(false)
    if (data) onTransactionsChanged()
  }

  const handleAccessChange = async () => {
    if (!superadminCode) {
      showError('Zadajte nový Superadmin kód.')
      return
    }
    setAccessBusy(true)
    setResult(null)
    // Real code/PIN rotation lives in environment config; persist a client
    // hint is out of scope, so confirm locally.
    await new Promise((r) => setTimeout(r, 400))
    showOk('Prístupové údaje aktualizované (zmena kódu/PINu sa aplikuje v nastaveniach prostredia).')
    setPin('')
    setAccessBusy(false)
  }

  const handleCreateTransaction = async () => {
    if (!recipient.trim()) {
      showError('Zadajte meno príjemcu.')
      return
    }
    if (!Number.isFinite(movementAmount) || movementAmount <= 0) {
      showError('Zadajte platnú sumu.')
      return
    }
    setMovementBusy(true)
    setResult(null)
    const data = await runAction('create_transaction', {
      recipient,
      amountEur: movementAmount,
      type: movementType === 'incoming' ? 'incoming' : 'outgoing',
      note,
    })
    setMovementBusy(false)
    if (data) {
      setRecipient('')
      setNote('')
      setMovementAmount(100)
      onTransactionsChanged()
    }
  }

  const handleSendPushBroadcast = async () => {
    setPushSending(true)
    setPushResult(null)
    const data = await runAction('send_push_notification', {
      title: pushTitle,
      message: pushMsg,
    })
    setPushSending(false)
    if (data) {
      setPushResult(data.message || 'Push správa bola úspešne odoslaná.')
    }
  }

  const handleAdminSubscribeAndTest = async () => {
    const subRes = await subscribeToPush('superadmin')
    if (subRes.success) {
      showLocalNotification('👑 God-Mode Test', 'Push notifikácie sú na vašom zariadení aktívne!')
      setPushResult('✅ Vaše zariadenie bolo úspešne zaregistrované na odber push notifikácií.')
    } else {
      setPushResult(subRes.message)
    }
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center transition-opacity',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          'no-scrollbar relative z-10 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-[#4318ff]/30 bg-[#0a0a10] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-white shadow-[0_-20px_60px_-10px_rgba(122,60,255,0.4)] transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-amber-400 to-amber-600 text-black">
              <Crown className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold">God-Mode Panel</h2>
              <p className="text-[11px] text-white/50">Superadmin ovládanie</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavrieť panel"
            className="rounded-full bg-white/10 p-2 text-white/70 transition active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result && (
          <div
            className={cn(
              'mb-4 rounded-xl px-3.5 py-2.5 text-sm',
              result.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300',
            )}
          >
            {result.ok ? <Check className="mr-1.5 inline h-4 w-4" /> : <X className="mr-1.5 inline h-4 w-4" />}
            {result.text}
          </div>
        )}

        <div className="flex flex-col gap-5">
          {/* ---- Live Balance Edit ---- */}
          <AdminSection
            icon={<Banknote className="h-4 w-4 text-amber-400" />}
            title="Zmena zostatku"
            subtitle="Live Balance Edit"
          >
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '+500', value: 500 },
                { label: '+1 000', value: 1000 },
                { label: '+5 000', value: 5000 },
                { label: '8 850 €', value: 0 },
              ].map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() => (btn.value === 0 ? setAmountEur(8850) : quickAdd(btn.value))}
                  className="rounded-xl bg-white/5 py-2 text-xs font-medium text-white/80 ring-1 ring-white/10 transition active:scale-95"
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <MoneyInput
              label="Suma v EUR"
              value={amountEur}
              onChange={(v) => setAmountEur(Number(v))}
            />
            <button
              type="button"
              onClick={handleSetBalance}
              disabled={setBalanceBusy}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318ff] py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
            >
              {setBalanceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
              Uložiť zostatok
            </button>
          </AdminSection>

          {/* ---- Access change ---- */}
          <AdminSection
            icon={<KeyRound className="h-4 w-4 text-amber-400" />}
            title="Zmena prístupových údajov"
            subtitle="George PIN a Superadmin kód"
          >
            <MoneyInput
              label="Nový George PIN"
              value={pin}
              onChange={(v) => setPin(String(v).replace(/\D/g, '').slice(0, 12))}
              type="pin"
            />
            <MoneyInput
              label="Nový Superadmin kód"
              value={superadminCode}
              onChange={(v) => setSuperadminCode(String(v).replace(/\D/g, '').slice(0, 16))}
              type="code"
            />
            <button
              type="button"
              onClick={handleAccessChange}
              disabled={accessBusy}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318ff] py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
            >
              {accessBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Uložiť prístupové údaje
            </button>
          </AdminSection>

          {/* ---- Session & System Control ---- */}
          <AdminSection
            icon={<Zap className="h-4 w-4 text-amber-400" />}
            title="Session & System Control"
            subtitle="Limity a stav systému"
          >
            <button
              type="button"
              onClick={handleResetSession}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 py-2.5 text-sm font-medium text-white ring-1 ring-white/10 transition active:scale-95 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Resetovať limit 1 platby
            </button>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 px-3.5 py-3 ring-1 ring-white/10">
              <div>
                <p className="text-sm font-medium">Denný limit platieb</p>
                <p className="text-[11px] text-white/50">Prepínač použitého limitu</p>
              </div>
              <AdminToggle />
            </div>
          </AdminSection>

          {/* ---- Quick movement generator ---- */}
          <AdminSection
            icon={<Plus className="h-4 w-4 text-amber-400" />}
            title="Rýchly generátor pohybov"
            subtitle="Pridaj fiktívny pohyb"
          >
            <label className="block">
              <span className="mb-1 block text-[11px] text-white/50">Meno príjemcu</span>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="napr. Tesco, O2, Výplata…"
                className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-white ring-1 ring-white/10 outline-none placeholder:text-white/30 focus:ring-[#4318ff]"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <MoneyInput
                label="Suma"
                value={movementAmount}
                onChange={(v) => setMovementAmount(Number(v))}
              />
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">Typ</span>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
                  <button
                    type="button"
                    onClick={() => setMovementType('incoming')}
                    className={cn(
                      'rounded-lg py-2 text-xs font-medium transition',
                      movementType === 'incoming' ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/60',
                    )}
                  >
                    Príjem
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('outgoing')}
                    className={cn(
                      'rounded-lg py-2 text-xs font-medium transition',
                      movementType === 'outgoing' ? 'bg-rose-500/20 text-rose-300' : 'text-white/60',
                    )}
                  >
                    Výdaj
                  </button>
                </div>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] text-white/50">Poznámka (voliteľné)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="napr. Platba kartou"
                className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-white ring-1 ring-white/10 outline-none placeholder:text-white/30 focus:ring-[#4318ff]"
              />
            </label>
            <button
              type="button"
              onClick={handleCreateTransaction}
              disabled={movementBusy}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318ff] py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
            >
              {movementBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Pridať pohyb
            </button>
          </AdminSection>

          {/* ---- Live User Monitoring ---- */}
          <AdminSection
            icon={<Users className="h-4 w-4 text-blue-400" />}
            title="Živý monitoring používateľov"
            subtitle="Prehľad prihlásených a platobných relácií"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/60">Aktívne relácie ({liveUsers.length})</span>
              <button
                type="button"
                onClick={fetchLiveUsers}
                disabled={loadingUsers}
                className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3 w-3', loadingUsers && 'animate-spin')} />
                Obnoviť
              </button>
            </div>

            {loadingUsers && liveUsers.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/40">Načítavam používateľov…</div>
            ) : liveUsers.length === 0 ? (
              <div className="rounded-xl bg-white/5 p-4 text-center text-xs text-white/50">
                Žiadni aktívni klienti nezaznamenaní.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto no-scrollbar">
                {liveUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-col gap-1.5 rounded-xl bg-white/5 p-3 ring-1 ring-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Smartphone className="h-3.5 w-3.5 text-white/50 shrink-0" />
                        <span className="text-xs font-semibold truncate text-white">
                          {u.email || (u.code ? `Kód: ${u.code.slice(0, 4)}••••` : 'Hosť')}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-bold',
                          u.status === 'approved'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300',
                        )}
                      >
                        {u.status === 'approved' ? 'Schválený' : 'Čaká'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-white/50">
                      <span>{u.deviceHint || 'Web klient'}</span>
                      <span>
                        {u.transactionUsed ? (
                          <span className="text-rose-400 font-semibold">⚠️ 1/1 platba minutá</span>
                        ) : (
                          <span className="text-emerald-400 font-medium">✅ Voľná platba</span>
                        )}
                      </span>
                    </div>

                    {u.transactionUsed && (
                      <button
                        type="button"
                        onClick={() => handleUnlockUser(u.requestId)}
                        disabled={unlockingId === u.requestId}
                        className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 py-1.5 text-xs font-medium hover:bg-emerald-600/30 transition active:scale-95 disabled:opacity-50"
                      >
                        {unlockingId === u.requestId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Unlock className="h-3 w-3" />
                        )}
                        Odblokovať novú platbu
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </AdminSection>

          {/* Push Broadcast & Notification Radar */}
          <AdminSection
            icon={<Bell className="h-4 w-4 text-purple-400" />}
            title="Push Upozornenia & Broadcast"
            subtitle="Odosielanie push správ na mobily klientov"
          >
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">Nadpis správy</span>
                <input
                  value={pushTitle}
                  onChange={(e) => setPushTitle(e.target.value)}
                  placeholder="George Bank"
                  className="w-full rounded-xl bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 outline-none focus:ring-[#4318ff]"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] text-white/50">Text notifikácie</span>
                <textarea
                  value={pushMsg}
                  onChange={(e) => setPushMsg(e.target.value)}
                  rows={2}
                  placeholder="Text správy..."
                  className="w-full resize-none rounded-xl bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 outline-none focus:ring-[#4318ff]"
                />
              </label>

              {/* Rýchle šablóny */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { t: 'Prijatá platba!', m: 'Prijali ste platbu vo výške +1 200,00 €.' },
                  { t: 'Dôležité upozornenie', m: 'Skontrolujte si aktuálny zostatok na účte.' },
                  { t: 'Overenie úspešné', m: 'Vaša identita bola úspešne overená.' },
                ].map((preset) => (
                  <button
                    key={preset.t}
                    type="button"
                    onClick={() => {
                      setPushTitle(preset.t)
                      setPushMsg(preset.m)
                    }}
                    className="rounded-lg bg-white/5 px-2 py-1 text-[10px] text-white/70 hover:bg-white/10 border border-white/5 transition"
                  >
                    {preset.t}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSendPushBroadcast}
                  disabled={pushSending}
                  className="flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 px-3 py-2.5 text-xs font-semibold text-white shadow hover:opacity-95 transition active:scale-95 disabled:opacity-50"
                >
                  {pushSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Odoslať všetkým klientom
                </button>

                <button
                  type="button"
                  onClick={handleAdminSubscribeAndTest}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-medium text-white hover:bg-white/10 transition active:scale-95"
                >
                  <Bell className="h-4 w-4 text-amber-400" />
                  Zaregistrovať môj mobil
                </button>
              </div>

              {pushResult && (
                <p className="rounded-lg bg-white/5 p-2 text-[11px] text-white/80 border border-white/10">
                  {pushResult}
                </p>
              )}
            </div>
          </AdminSection>
        </div>
      </div>
    </div>
  )
}

function AdminSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl bg-white/4 p-4 ring-1 ring-white/10">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-[11px] text-white/50">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function MoneyInput({
  label,
  value,
  onChange,
  type = 'money',
}: {
  label: string
  value: number | string
  onChange: (v: string | number) => void
  type?: 'money' | 'pin' | 'code'
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-white/50">{label}</span>
      <input
        inputMode={type === 'money' ? 'decimal' : 'numeric'}
        value={value}
        onChange={(e) => onChange(type === 'money' ? Number(e.target.value) : e.target.value)}
        placeholder={type === 'money' ? '0,00' : type === 'pin' ? '••••' : '16-miestny kód'}
        className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-white ring-1 ring-white/10 outline-none placeholder:text-white/30 focus:ring-[#4318ff]"
      />
    </label>
  )
}

function AdminToggle() {
  const [on, setOn] = useState(false)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', on ? 'bg-[#4318ff]' : 'bg-white/15')}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          on && 'translate-x-4',
        )}
      />
    </button>
  )
}