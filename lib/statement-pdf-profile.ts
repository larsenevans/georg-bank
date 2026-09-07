export class StatementPdfValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StatementPdfValidationError'
  }
}

export interface BankAccountStatementProfile {
  displayName?: string | null
  accountNumber: string
  currency?: string | null
  accountType: string
  productLabel?: string | null
  holderAddressLine1?: string | null
  holderAddressLine2?: string | null
  holderAddressLine3?: string | null
}

const ACCOUNTING_PERIOD_RE =
  /^\d{2}\.\s\d{2}\.\s\d{4}\s-\s\d{2}\.\s\d{2}\.\s\d{4}$/

const STATEMENT_NUMBER_RE = /^\d{1,2}\/\d{4}$/

export function validateAccountingPeriod(value: string) {
  if (!ACCOUNTING_PERIOD_RE.test(value.trim())) {
    throw new StatementPdfValidationError(
      'Účtovné obdobie musí mať formát DD. MM. YYYY - DD. MM. YYYY.',
    )
  }
}

export function validateStatementNumber(value: string) {
  if (!STATEMENT_NUMBER_RE.test(value.trim())) {
    throw new StatementPdfValidationError('Číslo výpisu musí mať formát N/YYYY.')
  }
}

export function validateStatementDate(value: string) {
  if (!/^\d{2}\.\s\d{2}\.\s\d{4}$/.test(value.trim())) {
    throw new StatementPdfValidationError(
      'Dátum vyhotovenia výpisu musí mať formát DD. MM. YYYY.',
    )
  }
}

export function resolveProductLabel(account: BankAccountStatementProfile): string {
  if (account.productLabel?.trim()) return account.productLabel.trim()
  if (account.accountType === 'savings') return 'Sporenie'
  if (account.displayName?.toLowerCase().includes('osobn')) return 'Osobný účet'
  if (account.displayName?.toLowerCase().includes('space')) return 'Business účet'
  if (account.displayName?.toLowerCase().includes('business')) return 'Business účet'
  return 'Business účet S'
}

export function resolveHolderAddressLines(
  account: BankAccountStatementProfile,
  accountName: string,
): string[] {
  const lines = [
    account.holderAddressLine1,
    account.holderAddressLine2,
    account.holderAddressLine3,
  ]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line))

  if (lines.length === 0) {
    throw new StatementPdfValidationError(
      'Adresa klienta nie je vyplnená. Doplňte holderAddressLine1–3 v bankovom účte.',
    )
  }

  return [accountName, ...lines]
}

export function resolveAccountDisplayName(account: BankAccountStatementProfile): string {
  return account.displayName?.trim() || 'Klient'
}

export function buildStatementAccountFields(account: BankAccountStatementProfile) {
  const accountName = resolveAccountDisplayName(account)
  return {
    accountName,
    accountProductType: resolveProductLabel(account),
    holderAddressLines: resolveHolderAddressLines(account, accountName),
  }
}
