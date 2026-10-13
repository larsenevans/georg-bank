/**
 * Unit: HTML potvrdenie obsahuje všetky platobné údaje.
 * Run: npx tsx scripts/payment-html.test.ts
 */
import assert from 'node:assert/strict'
import {
  generatePaymentConfirmationHtml,
  getPaymentConfirmationFilename,
  type PaymentConfirmationPdfData,
} from '../lib/payment-confirmation-pdf'
import {
  DEMO_ACCOUNT_NUMBER,
  LEGACY_FAKE_SENDER_IBAN,
} from '../lib/demo-user'

const data: PaymentConfirmationPdfData = {
  transactionId: 'mock-test-001',
  createdAt: '17.07.2026 15:30:00',
  status: 'Štandardný platobný príkaz',
  transferType: 'external',
  fromAccountNumber: DEMO_ACCOUNT_NUMBER,
  recipientName: 'Mária Nováková',
  recipientAccountOrEmail: 'SK8090000000001234567890',
  amount: '0.25',
  currency: 'EUR',
  variableSymbol: '20260717',
  constantSymbol: '0308',
  specificSymbol: '',
  note: 'Test HTML',
  payerReference: '',
  dueDate: 'Dnes',
  repeatDays: '0',
  createTemplate: false,
  emailConfirmation: false,
  balanceBefore: '0.53',
  balanceAfter: '0.28',
}

const html = generatePaymentConfirmationHtml(data)
const filenameHtml = getPaymentConfirmationFilename(data, 'html')
const filenamePdf = getPaymentConfirmationFilename(data, 'pdf')
const htmlCompact = html.replace(/\s+/g, '')

assert.match(filenameHtml, /\.html$/i, 'filename ends with .html')
assert.match(filenamePdf, /\.pdf$/i, 'pdf filename ends with .pdf')
assert.match(filenameHtml, /potvrdenie/i, 'filename is potvrdenie-*')
assert.ok(filenameHtml.includes('20260717'), 'filename contains VS')
assert.ok(filenamePdf.includes('20260717'), 'pdf filename contains VS')

assert.ok(html.includes('<!DOCTYPE html>'), 'full HTML document')
assert.ok(html.includes('Mária Nováková'), 'recipient name')
assert.ok(html.includes('Test HTML'), 'note in HTML')
// VS is encoded in filename; body has note, amount, IBAN, name
assert.ok(/0[,.]25/.test(html), 'amount 0.25 in HTML')
assert.ok(htmlCompact.includes('SK8090000000001234567890'), 'recipient IBAN')
assert.ok(
  /SK310900\d{12}/.test(htmlCompact),
  'sender IBAN is randomized SK31 0900 xxxx xxxx xxxx'
)
assert.ok(
  !htmlCompact.includes(DEMO_ACCOUNT_NUMBER),
  'real sender IBAN (DEMO_ACCOUNT_NUMBER) must not appear on receipt for security'
)
assert.ok(
  !htmlCompact.includes(LEGACY_FAKE_SENDER_IBAN),
  'legacy fake sender IBAN SK90…98765432 must not appear'
)
assert.ok(
  !htmlCompact.includes('SK9009000000000098765432'),
  'unspaced fake sender IBAN must not appear'
)
assert.ok(html.length > 1000, 'HTML is substantial')

// Pixel-Perfect Header & Layout Assertions
assert.ok(html.includes('SLOVENSKÁ'), 'bank logo title: SLOVENSKÁ')
assert.ok(html.includes('sporiteľňa'), 'bank logo subtitle: sporiteľňa')
assert.ok(html.includes('Tomášikova 48, 832 37 Bratislava'), 'bank address')
assert.ok(html.includes('IČO 00 151 653'), 'bank ICO')
assert.ok(html.includes('details-box'), 'details-box container present')
assert.ok(html.includes('Názov Účtu'), 'Account name label')
assert.ok(html.includes('Business účet L'), 'Account name value')
assert.ok(html.includes('GIBASKBX'), 'SLSP BIC code')
assert.ok(html.includes('Výbery spolu'), 'Withdrawals summary label')
assert.ok(html.includes('Informácia pre klienta'), 'Client notice section')
assert.ok(html.includes('cez George kľúč (mToken)'), 'Authorization method note')

// Scenár 2: Pixel-Perfect Potvrdenie pre CZK platbu do ČR s FX audit trailom
const dataCzk: PaymentConfirmationPdfData = {
  transactionId: 'mock-czk-fx-002',
  createdAt: '13.10.2026 14:15:00',
  status: 'Štandardný platobný príkaz',
  transferType: 'external',
  fromAccountNumber: DEMO_ACCOUNT_NUMBER,
  recipientName: 'Karel Dvořák',
  recipientAccountOrEmail: 'CZ0408003470671916139268',
  amount: '200.00',
  currency: 'EUR',
  variableSymbol: '9876543210',
  constantSymbol: '0308',
  specificSymbol: '',
  note: 'Platba do ČR: 5040.00 CZK (kurz 1 EUR = 25.20 CZK)',
  payerReference: '',
  dueDate: 'Dnes',
  repeatDays: '0',
  createTemplate: false,
  emailConfirmation: false,
  balanceBefore: '8350.10',
  balanceAfter: '8150.10',
}

const htmlCzk = generatePaymentConfirmationHtml(dataCzk)
assert.ok(htmlCzk.includes('Karel Dvořák'), 'CZ recipient name')
assert.ok(htmlCzk.includes('CZ04 0800 3470 6719 1613 9268') || htmlCzk.includes('CZ0408003470671916139268'), 'CZ IBAN formatted')
assert.ok(htmlCzk.includes('Platba do ČR: 5040.00 CZK (kurz 1 EUR = 25.20 CZK)'), 'FX audit trail in receipt')
assert.ok(/200[,.]00/.test(htmlCzk), 'EUR deducted amount in receipt')

console.log('payment-html unit tests passed (including pixel-perfect layout & CZK FX audit)')
console.log('  file html:', filenameHtml)
console.log('  file pdf:', filenamePdf)
console.log('  html bytes:', html.length)
console.log('  sender IBAN:', DEMO_ACCOUNT_NUMBER)
