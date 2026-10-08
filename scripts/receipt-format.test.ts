import assert from 'node:assert/strict'
import {
  getReceiptFormat,
  setReceiptFormat,
  RECEIPT_FORMAT_STORAGE_KEY,
  RECEIPT_FORMAT_CHANGE_EVENT,
} from '../lib/receipt-format'
import {
  getPaymentConfirmationFilename,
  type PaymentConfirmationPdfData,
} from '../lib/payment-confirmation-pdf'

// Mock minimal window & localStorage for Node runtime
let storageState: Record<string, string> = {}
const listeners: Record<string, ((e: Event) => void)[]> = {}

const mockStorage = {
  getItem: (k: string) => storageState[k] ?? null,
  setItem: (k: string, v: string) => { storageState[k] = v },
  removeItem: (k: string) => { delete storageState[k] },
  clear: () => { storageState = {} },
}

const mockWindow = {
  addEventListener: (name: string, fn: (e: Event) => void) => {
    listeners[name] = listeners[name] || []
    listeners[name].push(fn)
  },
  removeEventListener: (name: string, fn: (e: Event) => void) => {
    if (listeners[name]) {
      listeners[name] = listeners[name].filter((f) => f !== fn)
    }
  },
  dispatchEvent: (e: Event) => {
    const list = listeners[e.type] || []
    list.forEach((fn) => fn(e))
    return true
  },
}

interface CustomEventInitMock {
  detail?: unknown
}

class MockCustomEvent extends Event {
  detail: unknown
  constructor(type: string, params?: CustomEventInitMock) {
    super(type)
    this.detail = params?.detail
  }
}

Object.defineProperty(globalThis, 'window', { value: mockWindow, writable: true })
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true })
Object.defineProperty(globalThis, 'CustomEvent', { value: MockCustomEvent, writable: true })

// 1. Default format must be 'pdf'
mockStorage.clear()
assert.equal(getReceiptFormat(), 'pdf', 'Default receipt format must be PDF')

// 2. Set format to 'html'
let eventDispatchedDetail: unknown = null
mockWindow.addEventListener(RECEIPT_FORMAT_CHANGE_EVENT, (e: Event) => {
  eventDispatchedDetail = (e as MockCustomEvent).detail
})

setReceiptFormat('html')
assert.equal(getReceiptFormat(), 'html', 'Format should switch to HTML')
assert.equal(mockStorage.getItem(RECEIPT_FORMAT_STORAGE_KEY), 'html', 'HTML must be saved in localStorage')
assert.equal(eventDispatchedDetail, 'html', 'Event must notify listeners with html')

// 3. Switch back to 'pdf'
setReceiptFormat('pdf')
assert.equal(getReceiptFormat(), 'pdf', 'Format should switch back to PDF')
assert.equal(mockStorage.getItem(RECEIPT_FORMAT_STORAGE_KEY), 'pdf', 'PDF must be saved in localStorage')
assert.equal(eventDispatchedDetail, 'pdf', 'Event must notify listeners with pdf')

// 4. Filename format test based on format
const sampleData: PaymentConfirmationPdfData = {
  transactionId: 'test-123',
  createdAt: '08.10.2026 20:30:00',
  status: 'Štandardný platobný príkaz',
  transferType: 'external',
  fromAccountNumber: 'SK31 0900 1111 2222 3333',
  recipientName: 'Test Recipient',
  recipientAccountOrEmail: 'SK8090000000001234567890',
  amount: '10.00',
  currency: 'EUR',
  variableSymbol: '12345',
  constantSymbol: '0308',
  specificSymbol: '',
  note: 'Platba',
  payerReference: '',
  dueDate: 'Dnes',
  repeatDays: '0',
  createTemplate: false,
  emailConfirmation: false,
  balanceBefore: '100.00',
  balanceAfter: '90.00',
}

const pdfFile = getPaymentConfirmationFilename(sampleData, 'pdf')
const htmlFile = getPaymentConfirmationFilename(sampleData, 'html')

assert.match(pdfFile, /\.pdf$/i, 'PDF filename must end with .pdf')
assert.match(htmlFile, /\.html$/i, 'HTML filename must end with .html')

console.log('✅ receipt-format.test.ts: all unit assertions passed successfully!')
