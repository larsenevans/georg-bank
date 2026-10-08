'use client'

import { useState } from 'react'
import {
  Bell,
  Check,
  KeyRound,
  Lock,
  Moon,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Loader2,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHorizonBalance } from '../balance-context'
import {
  subscribeToPush,
  unsubscribeFromPush,
  showLocalNotification,
} from '@/lib/push-notifications'

type ThemeMode = 'dark' | 'light'

/**
 * Používateľské Nastavenia — client-only preferences persisted in
 * localStorage. Balance hiding is shared with the overview banner through
 * the balance context.
 */
export function UserSettingsTab() {
  const { hideBalance, setHideBalance } = useHorizonBalance()

  // Theme
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('hb.theme')
    if (saved === 'light' || saved === 'dark') return saved
    return 'dark'
  })
  // Security
  const [bioEnabled, setBioEnabled] = useState(() => localStorage.getItem('hb.bio') === '1')
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinMessage, setPinMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Limits
  const [dailyLimit, setDailyLimit] = useState<number>(() =>
    Number(localStorage.getItem('hb.dailyLimitEur')) || 8850,
  )
  const [limitMessage, setLimitMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Notifications
  const [pushNotif, setPushNotif] = useState(() => localStorage.getItem('hb.push') === '1')
  const [pushLoading, setPushLoading] = useState(false)
  const [pushMessage, setPushMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [smsNotif, setSmsNotif] = useState(() => localStorage.getItem('hb.sms') === '1')

  const handlePushToggle = async (targetState: boolean) => {
    if (!targetState) {
      setPushNotif(false)
      persist('hb.push', '0')
      await unsubscribeFromPush()
      setPushMessage({ ok: true, text: 'Push upozornenia boli vypnuté.' })
      return
    }

    setPushLoading(true)
    setPushMessage(null)

    const res = await subscribeToPush('user')
    setPushLoading(false)

    if (res.success) {
      setPushNotif(true)
      persist('hb.push', '1')
      setPushMessage({ ok: true, text: res.message })
      showLocalNotification('George Bank', 'Push notifikácie sú aktívne. Budete informovaní o každom pohybe.')
    } else {
      setPushNotif(false)
      persist('hb.push', '0')
      setPushMessage({ ok: false, text: res.message })
    }
  }

  const handleTestPush = async () => {
    const success = await showLocalNotification('George Bank', 'Testovacie upozornenie: Váš účet a push notifikácie fungujú na 100%!')
    if (!success) {
      await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'George Bank',
          message: 'Testovacie upozornenie: Váš účet a push notifikácie fungujú na 100%!',
          url: '/dashboard-v2',
        }),
      }).catch(() => null)
    }
    setPushMessage({ ok: true, text: 'Testovacie upozornenie bolo odoslané na toto zariadenie.' })
  }

  const persist = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Storage may be unavailable (private mode); preferences simply won't persist.
    }
  }

  const applyTheme = (mode: ThemeMode) => {
    setTheme(mode)
    persist('hb.theme', mode)
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', mode === 'dark')
    }
  }

  const handlePinChange = () => {
    if (!/^[0-9]{4,12}$/.test(newPin)) {
      setPinMessage({ ok: false, text: 'Nový PIN musí mať 4 až 12 číslic.' })
      return
    }
    if (!oldPin) {
      setPinMessage({ ok: false, text: 'Zadajte starý George PIN.' })
      return
    }
    persist('hb.georgePin', newPin)
    setPinMessage({ ok: true, text: 'George PIN bol zmenený.' })
    setOldPin('')
    setNewPin('')
  }

  const handleLimitChange = (value: number) => {
    const clamped = Math.min(10_000, Math.max(500, Math.round(value)))
    setDailyLimit(clamped)
    persist('hb.dailyLimitEur', String(clamped))
    setLimitMessage({ ok: true, text: `Denný limit: ${clamped.toLocaleString('sk-SK')} €` })
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Privacy */}
      <SettingsGroup
        icon={<Shield className="h-4 w-4 text-primary" />}
        title="Súkromie"
        subtitle="Nastavte, čo je viditeľné"
      >
        <ToggleRow
          label="Skryť zostatok na domove"
          description="Namiesto čísla zobrazí € ••••• — okamžite ovplyvní banner."
          checked={hideBalance}
          onChange={setHideBalance}
        />
      </SettingsGroup>

      {/* Theme */}
      <SettingsGroup
        icon={<Sun className="h-4 w-4 text-primary" />}
        title="Vzhľad"
        subtitle="Horizon UI farebná paleta"
      >
        <div className="grid grid-cols-2 gap-3">
          <ThemeButton
            active={theme === 'light'}
            icon={<Sun className="h-5 w-5" />}
            label="Svetlý"
            onClick={() => applyTheme('light')}
          />
          <ThemeButton
            active={theme === 'dark'}
            icon={<Moon className="h-5 w-5" />}
            label="Tmavý"
            onClick={() => applyTheme('dark')}
          />
        </div>
      </SettingsGroup>

      {/* Security */}
      <SettingsGroup
        icon={<Lock className="h-4 w-4 text-primary" />}
        title="Zabezpečenie"
        subtitle="Prihlásenie a ochrana"
      >
        <ToggleRow
          label="Prihlasovanie cez Face ID / Biometriu"
          description="Rýchle odomknutie bez zadávania PINu."
          checked={bioEnabled}
          onChange={(v) => {
            setBioEnabled(v)
            persist('hb.bio', v ? '1' : '0')
          }}
        />

        <div className="space-y-2.5">
          <p className="flex items-center gap-1.5 pt-1 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-primary" /> Zmena George PINu
          </p>
          <div className="grid grid-cols-1 gap-2.5">
            <PinInput value={oldPin} onChange={setOldPin} placeholder="Starý PIN" label="Starý PIN" />
            <PinInput value={newPin} onChange={setNewPin} placeholder="Nový PIN" label="Nový PIN" />
          </div>
          <button
            type="button"
            onClick={handlePinChange}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-95"
          >
            Zmeniť PIN
          </button>
          {pinMessage && (
            <p className={cn('text-xs', pinMessage.ok ? 'text-emerald-500' : 'text-rose-500')}>
              {pinMessage.text}
            </p>
          )}
        </div>
      </SettingsGroup>

      {/* Limits */}
      <SettingsGroup
        icon={<SlidersHorizontal className="h-4 w-4 text-primary" />}
        title="Limity"
        subtitle="Denný limit platieb"
      >
        <ToggleRow
          label="Denný limit platieb"
          description={`Aktuálne: ${dailyLimit.toLocaleString('sk-SK')} €`}
          checked
          onChange={() => undefined}
          disabled
        />
        <input
          type="range"
          min={500}
          max={10_000}
          step={100}
          value={dailyLimit}
          onChange={(e) => handleLimitChange(Number(e.target.value))}
          className="w-full accent-[#4318ff]"
          aria-label="Denný limit platieb"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>500 €</span>
          <span className="font-semibold text-foreground">{dailyLimit.toLocaleString('sk-SK')} €</span>
          <span>10 000 €</span>
        </div>
        {limitMessage && <p className="text-xs text-emerald-500">{limitMessage.text}</p>}
      </SettingsGroup>

      {/* Notifications */}
      <SettingsGroup
        icon={<Bell className="h-4 w-4 text-primary" />}
        title="Notifikácie"
        subtitle="Upozornenia na váš telefón"
      >
        <ToggleRow
          icon={pushLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Smartphone className="h-4 w-4" />}
          label="Push upozornenia na platby"
          description="Okamžité upozornenie pri každom pohybe."
          checked={pushNotif}
          disabled={pushLoading}
          onChange={handlePushToggle}
        />

        {pushMessage && (
          <div
            className={cn(
              'flex items-start gap-1.5 rounded-xl p-2.5 text-xs',
              pushMessage.ok
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            )}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{pushMessage.text}</p>
          </div>
        )}

        {pushNotif && (
          <button
            type="button"
            onClick={handleTestPush}
            className="w-full rounded-xl border border-primary/20 bg-primary/5 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 active:scale-95"
          >
            🔔 Otestovať push upozornenie na tomto zariadení
          </button>
        )}

        <ToggleRow
          icon={<Bell className="h-4 w-4" />}
          label="SMS notifikácie"
          description="SMS po každej zrealizovanej platbe."
          checked={smsNotif}
          onChange={(v) => {
            setSmsNotif(v)
            persist('hb.sms', v ? '1' : '0')
          }}
        />
      </SettingsGroup>
    </div>
  )
}

function SettingsGroup({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon?: React.ReactNode
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-xl px-1 py-2.5', disabled && 'opacity-70')}>
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-[#4318ff]' : 'bg-muted',
          disabled && 'cursor-default',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </div>
  )
}

function ThemeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition',
        active ? 'border-[#4318ff] bg-[#4318ff]/10 text-foreground' : 'border-border text-muted-foreground',
      )}
    >
      {icon}
      {label}
      {active && <Check className="h-3.5 w-3.5 text-primary" />}
    </button>
  )
}

function PinInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 12))}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4318ff]/40"
      />
    </label>
  )
}