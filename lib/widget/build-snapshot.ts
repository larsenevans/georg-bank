import {
  DAILY_PAYMENT_LIMIT_ENABLED,
  DEMO_ACCOUNT_TARGET_BALANCE_CENTS,
  isOutgoingPaymentType,
} from '@/lib/daily-payment-limit'
import { DEMO_DEFAULT_USER_NAME } from '@/lib/demo-user'
import {
  DEFAULT_WIDGET_DEEP_LINKS,
  DEFAULT_WIDGET_SETTINGS,
  type WidgetSnapshot,
} from '@/lib/widget/types'

type TxnLike = {
  id?: string
  recipient?: string
  amount?: number
  createdAt?: string
  type?: string
  note?: string
  balanceAfter?: number
}

type DailyLimitLike = {
  enabled?: boolean
  limitEur?: number | null
  usedEur?: number
  remainingEur?: number | null
  limitCents?: number | null
  usedCents?: number
  remainingCents?: number | null
}

type AccountLike = {
  balance?: number
}

export type TransactionsApiPayload = {
  transactions?: TxnLike[]
  dailyLimit?: DailyLimitLike
  accounts?: AccountLike[]
  /** Optional display name override (e.g. session user). */
  displayName?: string
}

function toCentsFromEur(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined
  return Math.round(value * 100)
}

function resolveBalanceCents(payload: TransactionsApiPayload, txns: TxnLike[]): number {
  const accountBalance = payload.accounts?.[0]?.balance
  if (typeof accountBalance === 'number' && Number.isFinite(accountBalance)) {
    // API / Supabase stores account.balance in cents.
    return Math.round(accountBalance)
  }
  for (const t of txns) {
    const after = toCentsFromEur(t.balanceAfter)
    if (after !== undefined) return after
  }
  return DEMO_ACCOUNT_TARGET_BALANCE_CENTS
}

function resolveDailyLimit(payload: TransactionsApiPayload) {
  const dl = payload.dailyLimit
  const enabled = dl?.enabled ?? DAILY_PAYMENT_LIMIT_ENABLED
  const usedCents = dl?.usedCents ?? Math.round((dl?.usedEur ?? 0) * 100)

  if (!enabled) {
    const unlimitedCents = 999_999_999
    return {
      enabled: false,
      limitCents: unlimitedCents,
      usedCents,
      remainingCents: unlimitedCents,
    }
  }

  const limitCents =
    dl?.limitCents ??
    (typeof dl?.limitEur === 'number' ? Math.round(dl.limitEur * 100) : undefined) ??
    DEMO_ACCOUNT_TARGET_BALANCE_CENTS
  const remainingCents =
    dl?.remainingCents ??
    (typeof dl?.remainingEur === 'number' ? Math.round(dl.remainingEur * 100) : undefined) ??
    Math.max(0, limitCents - usedCents)
  return { enabled: true, limitCents, usedCents, remainingCents }
}

function resolveLastPayment(txns: TxnLike[]) {
  const outgoing = txns.find((t) => isOutgoingPaymentType(t.type))
  const pick = outgoing ?? txns[0]
  if (!pick?.id || typeof pick.amount !== 'number') return undefined
  const outgoingFlag =
    isOutgoingPaymentType(pick.type) ||
    (pick.type !== 'incoming' && pick.type !== 'deposit' && pick.amount < 0)
  const amountCents = Math.round(Math.abs(pick.amount) * 100) * (outgoingFlag ? -1 : 1)
  return {
    id: pick.id,
    amountCents,
    label: pick.recipient || pick.note || 'Platba',
    createdAt: pick.createdAt || new Date().toISOString(),
  }
}

/** Build WidgetSnapshot v1 from GET /api/transactions payload (+ optional display name). */
export function buildWidgetSnapshotFromTransactionsApi(
  payload: TransactionsApiPayload,
  now = new Date()
): WidgetSnapshot {
  const txns = Array.isArray(payload.transactions) ? payload.transactions : []
  const dailyLimit = resolveDailyLimit(payload)
  const lastPayment = resolveLastPayment(txns)

  return {
    version: 1,
    updatedAt: now.toISOString(),
    profile: {
      displayName: payload.displayName?.trim() || DEMO_DEFAULT_USER_NAME || 'George',
      gender: 'male',
      greetingStyle: 'informal',
    },
    money: {
      currency: 'EUR',
      balanceCents: resolveBalanceCents(payload, txns),
      ...(lastPayment ? { lastPayment } : {}),
    },
    dailyLimit: {
      ...dailyLimit,
      // Rolling 24h has no fixed end; expose a soft horizon for UI.
      windowEndsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
    settings: { ...DEFAULT_WIDGET_SETTINGS },
    deepLink: { ...DEFAULT_WIDGET_DEEP_LINKS },
  }
}
