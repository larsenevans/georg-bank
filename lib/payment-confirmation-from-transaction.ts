import {
  generateMaskedSenderIban,
  type PaymentConfirmationPdfData,
} from '@/lib/payment-confirmation-pdf'
import { formatTransactionDateMedium } from '@/lib/format-date'

type TransactionRecord = {
  id: string
  type: string
  description: string | null
  amount: number
  balanceBefore: number | null
  balanceAfter: number | null
  createdAt: Date
}

type AccountRecord = {
  accountNumber: string
  currency: string
}

function parseDescription(description: string | null) {
  const parts = (description ?? '').split('|').map((part) => part.trim())
  return {
    recipientName: parts[0] || 'Prevod',
    note: parts[1] || '',
    category: parts[2] || '',
    recipientAccountOrEmail: parts[3] || '',
    variableSymbol: parts[4] || '',
    constantSymbol: parts[5] || '',
    specificSymbol: parts[6] || '',
    payerReference: parts[7] || '',
  }
}

function isEmailTransfer(description: string | null) {
  const account = parseDescription(description).recipientAccountOrEmail
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)
}

export function buildPaymentConfirmationFromTransaction(
  txn: TransactionRecord,
  account: AccountRecord,
): PaymentConfirmationPdfData {
  const parsed = parseDescription(txn.description)
  const transferType: PaymentConfirmationPdfData['transferType'] =
    isEmailTransfer(txn.description) || parsed.recipientAccountOrEmail.includes('@')
      ? 'email'
      : 'external'

  const recipientAccountOrEmail =
    parsed.recipientAccountOrEmail ||
    (transferType === 'email' ? parsed.recipientName : '—')

  return {
    transactionId: txn.id,
    createdAt: formatTransactionDateMedium(txn.createdAt.toISOString()),
    status: 'Štandardný platobný príkaz',
    transferType,
    fromAccountNumber: generateMaskedSenderIban(),
    recipientName: parsed.recipientName,
    recipientAccountOrEmail,
    amount: (txn.amount / 100).toFixed(2),
    currency: account.currency || 'EUR',
    variableSymbol: parsed.variableSymbol,
    constantSymbol: parsed.constantSymbol,
    specificSymbol: parsed.specificSymbol,
    note: parsed.note,
    payerReference: parsed.payerReference,
    dueDate: '',
    repeatDays: '0',
    createTemplate: false,
    emailConfirmation: false,
    balanceBefore: ((txn.balanceBefore ?? 0) / 100).toFixed(2),
    balanceAfter: ((txn.balanceAfter ?? 0) / 100).toFixed(2),
  }
}

export function getPaymentConfirmationApiPath(transactionId: string) {
  return `/api/export/payment-confirmation?transactionId=${encodeURIComponent(transactionId)}`
}

export function encodeTransactionDescription(fields: {
  recipientName: string
  note: string
  category: string
  recipientAccountOrEmail?: string
  variableSymbol?: string
  constantSymbol?: string
  specificSymbol?: string
  payerReference?: string
}) {
  return [
    fields.recipientName,
    fields.note,
    fields.category,
    fields.recipientAccountOrEmail ?? '',
    fields.variableSymbol ?? '',
    fields.constantSymbol ?? '',
    fields.specificSymbol ?? '',
    fields.payerReference ?? '',
  ].join('|')
}