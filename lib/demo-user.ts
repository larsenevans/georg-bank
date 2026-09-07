/** Shared demo payer used by dashboard2 /transactions seed paths. */
export const DEMO_DEFAULT_USER_ID = 'user-peter-default'

/** Previous demo user ids that may still exist in local DBs. */
export const DEMO_DEFAULT_USER_LEGACY_IDS = ['user-filip-default'] as const

export const DEMO_DEFAULT_USER_NAME = 'Peter'
export const DEMO_DEFAULT_USER_EMAIL = 'peter@example.com'

/** Canonical demo SPACE IBAN (must match ensure-db / Supabase seed). */
export const DEMO_ACCOUNT_NUMBER = 'SK3109000000005012345678'

export function normalizeIban(iban: string | null | undefined): string {
  return String(iban || '').replace(/\s+/g, '').toUpperCase()
}

export function isSpaceLabeled(account: {
  displayName?: string | null
  productLabel?: string | null
}): boolean {
  const blob = `${account.displayName || ''} ${account.productLabel || ''}`.toLowerCase()
  return blob.includes('space')
}

/**
 * Prefer the SPACE checking account of the current payer.
 * Demo IBAN is only a fallback when nothing is labeled SPACE.
 */
export function pickDemoBankAccount<T extends {
  accountNumber?: string | null
  displayName?: string | null
  productLabel?: string | null
  accountType?: string | null
}>(
  accounts: T[] | undefined | null
): T | undefined {
  if (!accounts?.length) return undefined
  if (accounts.length === 1) return accounts[0]
  const space = accounts.find(isSpaceLabeled)
  if (space) return space
  const checking = accounts.find((a) => a.accountType === 'checking')
  if (checking) return checking
  const target = normalizeIban(DEMO_ACCOUNT_NUMBER)
  return accounts.find((a) => normalizeIban(a.accountNumber) === target) ?? accounts[0]
}

/** Balance for dashboard refresh: latest txn ledger wins over raw account row. */
export function resolveSpaceBalanceFromApi(
  accounts: Array<{ balance?: number | null; accountNumber?: string | null }> | undefined | null,
  latestBalanceAfterEur?: number | null
): number | undefined {
  const demo = pickDemoBankAccount(accounts)
  const fromAccount = demo?.balance != null ? demo.balance / 100 : undefined
  if (latestBalanceAfterEur != null && Number.isFinite(latestBalanceAfterEur)) {
    return latestBalanceAfterEur
  }
  return fromAccount
}

/** Legacy placeholder that must never appear on payment receipts. */
export const LEGACY_FAKE_SENDER_IBAN = 'SK9009000000000098765432'
