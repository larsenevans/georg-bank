import {
  DEMO_ACCOUNT_TARGET_BALANCE_CENTS,
  DEMO_ACCOUNT_TARGET_BALANCE_EUR,
} from '@/lib/daily-payment-limit'

/** When true, manual deposit/incoming top-ups are blocked (sandbox default: unlocked). */
export const MANUAL_TOPUP_DISABLED = process.env.MANUAL_TOPUP_DISABLED === 'true'

/** Automatic balance restore is allowed only once per this interval. */
export const AUTO_REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000

/** Target balance after a successful auto-refill (matches 24h payment allowance). */
export const AUTO_REFILL_TARGET_CENTS = DEMO_ACCOUNT_TARGET_BALANCE_CENTS

/** Marker stored in transaction.description for auto-refill events. */
export const AUTO_REFILL_MARKER = '[auto-refill-24h]'

export const MANUAL_TOPUP_BLOCKED_MESSAGE =
  'Dobíjanie € je zakázané. Automatické obnovenie zostatku je možné až po 24 hodinách.'

export const MANUAL_TOPUP_ENABLED_MESSAGE =
  'Manuálne dobíjanie € je povolené (sandbox). Automatické obnovenie zostatku max 1× / 24 h.'

export function isManualTopupType(type: string | null | undefined): boolean {
  const t = (type || '').toLowerCase()
  return t === 'deposit' || t === 'incoming' || t === 'topup' || t === 'top-up'
}

function toTimestamp(at: Date | string | null | undefined): number | null {
  if (!at) return null
  const d = typeof at === 'string' ? new Date(at) : at
  const ms = d.getTime()
  return Number.isFinite(ms) ? ms : null
}

/** Cooldown anchor = most recent auto-refill OR outgoing payment. */
export function msUntilAutoRefillAllowed(
  lastRefillAt: Date | string | null | undefined,
  lastOutgoingAt?: Date | string | null | undefined
): number {
  const anchors = [toTimestamp(lastRefillAt), toTimestamp(lastOutgoingAt)].filter(
    (ms): ms is number => ms != null
  )
  if (anchors.length === 0) return 0
  const elapsed = Date.now() - Math.max(...anchors)
  return Math.max(0, AUTO_REFILL_COOLDOWN_MS - elapsed)
}

export function canAutoRefillNow(
  lastRefillAt: Date | string | null | undefined,
  lastOutgoingAt?: Date | string | null | undefined
): boolean {
  return msUntilAutoRefillAllowed(lastRefillAt, lastOutgoingAt) === 0
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

export function autoRefillInfoMessage(
  lastRefillAt: Date | string | null | undefined,
  lastOutgoingAt?: Date | string | null | undefined
): string {
  const wait = msUntilAutoRefillAllowed(lastRefillAt, lastOutgoingAt)
  if (wait <= 0) {
    return `Automatické obnovenie na ${DEMO_ACCOUNT_TARGET_BALANCE_EUR} € je pripravené (max 1× / 24 h).`
  }
  return `Automatické obnovenie bude možné o ${formatAutoRefillWait(wait)} (pravidlo 24 h).`
}
