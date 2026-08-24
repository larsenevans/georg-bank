/** Rolling 24h outgoing payment allowance for the demo payer (EUR). */
export const DAILY_PAYMENT_LIMIT_EUR = 8850
export const DAILY_PAYMENT_LIMIT_CENTS = DAILY_PAYMENT_LIMIT_EUR * 100

/** When false, outgoing payments are only limited by account balance. */
export const DAILY_PAYMENT_LIMIT_ENABLED = false

/** Demo account seed / auto-refill target (independent of payment limit). */
export const DEMO_ACCOUNT_TARGET_BALANCE_EUR = DAILY_PAYMENT_LIMIT_EUR
export const DEMO_ACCOUNT_TARGET_BALANCE_CENTS = DAILY_PAYMENT_LIMIT_CENTS

export type DailyLimitSnapshot = {
  enabled: boolean
  limitEur: number | null
  usedEur: number
  remainingEur: number | null
  usedCents: number
  remainingCents: number | null
  limitCents: number | null
}

/** Start of the rolling 24-hour window (now − 24h). */
export function startOfRolling24h(date = new Date()): Date {
  return new Date(date.getTime() - 24 * 60 * 60 * 1000)
}

/** @deprecated Prefer startOfRolling24h — kept as alias for call sites. */
export function startOfLocalDay(date = new Date()): Date {
  return startOfRolling24h(date)
}

export function isOutgoingPaymentType(type: string | null | undefined): boolean {
  return type === 'outgoing' || type === 'withdrawal' || type === 'transfer'
}

export function exceedsDailyPaymentLimit(usedCents: number, amountCents: number): boolean {
  if (!DAILY_PAYMENT_LIMIT_ENABLED) return false
  const snapshot = dailyLimitSnapshot(usedCents)
  return amountCents > (snapshot.remainingCents ?? 0)
}

export function dailyLimitSnapshot(usedCents: number): DailyLimitSnapshot {
  const used = Math.max(0, usedCents)

  if (!DAILY_PAYMENT_LIMIT_ENABLED) {
    return {
      enabled: false,
      limitEur: null,
      usedEur: used / 100,
      remainingEur: null,
      usedCents: used,
      remainingCents: null,
      limitCents: null,
    }
  }

  const remainingCents = Math.max(0, DAILY_PAYMENT_LIMIT_CENTS - used)
  return {
    enabled: true,
    limitEur: DAILY_PAYMENT_LIMIT_EUR,
    usedEur: used / 100,
    remainingEur: remainingCents / 100,
    usedCents: used,
    remainingCents,
    limitCents: DAILY_PAYMENT_LIMIT_CENTS,
  }
}
