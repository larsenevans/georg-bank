export const MIN_LOGIN_BALANCE_EUR = 4675.45
export const MAX_LOGIN_BALANCE_EUR = 15873.20

/**
 * 👑 Superadmin pevný / minimálny zostatok: 7 589,20 €
 * Pre Superadmina ostáva zostatok nemenný a nikdy sa negeneruje náhodne.
 */
export const SUPERADMIN_FIXED_BALANCE_EUR = 7589.20
export const SUPERADMIN_FIXED_BALANCE_CENTS = 758920

export function generateRandomLoginBalanceCents(): number {
  const minCents = 467545
  const maxCents = 1587320
  return Math.floor(Math.random() * (maxCents - minCents + 1)) + minCents
}

export function generateRandomLoginBalanceEur(): number {
  return generateRandomLoginBalanceCents() / 100
}

