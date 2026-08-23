/** Rolling 24h outgoing payment allowance for the demo payer (EUR). */
export const DAILY_PAYMENT_LIMIT_EUR = 8850
export const DAILY_PAYMENT_LIMIT_CENTS = DAILY_PAYMENT_LIMIT_EUR * 100

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

export function dailyLimitSnapshot(usedCents: number) {
  const used = Math.max(0, usedCents)
  const remainingCents = Math.max(0, DAILY_PAYMENT_LIMIT_CENTS - used)
  return {
    limitEur: DAILY_PAYMENT_LIMIT_EUR,
    usedEur: used / 100,
    remainingEur: remainingCents / 100,
    usedCents: used,
    remainingCents,
    limitCents: DAILY_PAYMENT_LIMIT_CENTS,
  }
}
