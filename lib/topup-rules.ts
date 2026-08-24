import {
  DEMO_ACCOUNT_TARGET_BALANCE_CENTS,
  DEMO_ACCOUNT_TARGET_BALANCE_EUR,
} from '@/lib/daily-payment-limit'

/** Manual top-up / deposit is permanently disabled. */
export const MANUAL_TOPUP_DISABLED = true

/** Automatic balance restore is allowed only once per this interval. */
export const AUTO_REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000

/** Target balance after a successful auto-refill (matches 24h payment allowance). */
export const AUTO_REFILL_TARGET_CENTS = DEMO_ACCOUNT_TARGET_BALANCE_CENTS

/** Marker stored in transaction.description for auto-refill events. */
export const AUTO_REFILL_MARKER = '[auto-refill-24h]'

export const MANUAL_TOPUP_BLOCKED_MESSAGE =
  'Dobíjanie € je zakázané. Automatické obnovenie zostatku je možné až po 24 hodinách.'

export function isManualTopupType(type: string | null | undefined): boolean {
  const t = (type || '').toLowerCase()
  return t === 'deposit' || t === 'incoming' || t === 'topup' || t === 'top-up'
}

export function msUntilAutoRefillAllowed(lastRefillAt: Date | string | null | undefined): number {
  if (!lastRefillAt) return 0
  const last = typeof lastRefillAt === 'string' ? new Date(lastRefillAt) : lastRefillAt
  const elapsed = Date.now() - last.getTime()
  return Math.max(0, AUTO_REFILL_COOLDOWN_MS - elapsed)
}

export function canAutoRefillNow(lastRefillAt: Date | string | null | undefined): boolean {
  return msUntilAutoRefillAllowed(lastRefillAt) === 0
}

export function formatAutoRefillWait(ms: number): string {
  if (ms <= 0) return 'teraz'
  const totalMin = Math.ceil(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function autoRefillInfoMessage(lastRefillAt: Date | string | null | undefined): string {
  const wait = msUntilAutoRefillAllowed(lastRefillAt)
  if (wait <= 0) {
    return `Automatické obnovenie na ${DEMO_ACCOUNT_TARGET_BALANCE_EUR} € je pripravené (max 1× / 24 h).`
  }
  return `Automatické obnovenie bude možné o ${formatAutoRefillWait(wait)} (pravidlo 24 h).`
}
