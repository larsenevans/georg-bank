export type ReceiptFormat = 'pdf' | 'html'

export const RECEIPT_FORMAT_STORAGE_KEY = 'george_receipt_format'
export const RECEIPT_FORMAT_CHANGE_EVENT = 'george-receipt-format-changed'

/**
 * Získa preferovaný formát dokladov ('pdf' | 'html').
 * Predvolená hodnota je 'pdf'.
 */
export function getReceiptFormat(): ReceiptFormat {
  if (typeof window === 'undefined') return 'pdf'
  try {
    const saved = localStorage.getItem(RECEIPT_FORMAT_STORAGE_KEY)
    if (saved === 'html' || saved === 'pdf') {
      return saved
    }
  } catch {
    // Odchytenie výnimiek pri zablokovanom localStorage
  }
  return 'pdf'
}

/**
 * Uloží preferovaný formát dokladov a notifikuje všetky komponenty v aplikácii.
 */
export function setReceiptFormat(format: ReceiptFormat): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(RECEIPT_FORMAT_STORAGE_KEY, format)
    window.dispatchEvent(
      new CustomEvent(RECEIPT_FORMAT_CHANGE_EVENT, { detail: format })
    )
  } catch {
    // Odchytenie výnimiek pri zablokovanom localStorage
  }
}
