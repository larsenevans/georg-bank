import assert from 'node:assert/strict'
import {
  generateTransactionsPdf,
  renderStatementSkeletonHtml,
} from '../lib/generate-transactions-pdf'
import { generatePaymentConfirmationHtml } from '../lib/payment-confirmation-pdf'
import { computeStatementTax } from '../lib/statement-tax'
import { StatementPdfValidationError } from '../lib/statement-pdf-profile'
import { buildStatementFromPayment } from '../lib/statement-from-payment'

const BASE_INPUT = {
  accountName: 'DALMAN group s. r. o.',
  accountNumber: 'SK04 0900 0000 0052 0896 0265',
  currency: 'EUR',
  accountProductType: 'Business účet S',
  holderAddressLines: [
    'DALMAN group s. r. o.',
    'Trebišov Hodvábna 4269/13',
    '071 01 Michalovce 1',
  ],
  statementDate: '31. 03. 2026',
  accountingPeriod: '01. 03. 2026 - 31. 03. 2026',
  statementNumber: '3/2026',
  initialBalance: 4_035_000,
  finalBalance: 4_035_000,
  depositsTotal: 4_035_000,
  withdrawalsTotal: 4_035_000,
  transactions: [] as Parameters<typeof generateTransactionsPdf>[0]['transactions'],
}

async function testPaginationLogic() {
  const statementData = { ...BASE_INPUT, transactions: [] as Parameters<typeof generateTransactionsPdf>[0]['transactions'] }

  for (let i = 0; i < 10; i++) {
    statementData.transactions.push({
      date: '05. 04. 2026',
      description: `Tx ${i}`,
      amount: 10_000,
      type: 'deposit',
    })
  }

  let html = await generateTransactionsPdf(statementData)
  let viewportCount = (html.match(/class="page-viewport"/g) || []).length
  assert.equal(viewportCount, 1, '10 transactions should fit on 1 page')

  for (let i = 10; i < 13; i++) {
    statementData.transactions.push({
      date: '05. 04. 2026',
      description: `Tx ${i}`,
      amount: 10_000,
      type: 'deposit',
    })
  }
  html = await generateTransactionsPdf(statementData)
  viewportCount = (html.match(/class="page-viewport"/g) || []).length
  assert.equal(viewportCount, 2, '13 transactions should take 2 pages')
  assert.ok(html.includes('Strana 2/2'), '2nd page should indicate Strana 2/2')

  for (let i = 13; i < 31; i++) {
    statementData.transactions.push({
      date: '05. 04. 2026',
      description: `Tx ${i}`,
      amount: 10_000,
      type: 'deposit',
    })
  }
  html = await generateTransactionsPdf(statementData)
  viewportCount = (html.match(/class="page-viewport"/g) || []).length
  assert.equal(viewportCount, 3, '31 transactions should take 3 pages')
  assert.ok(html.includes('Strana 3/3'), '3rd page should indicate Strana 3/3')
}

async function testSlspTemplateStructure() {
  const html = await generateTransactionsPdf({
    ...BASE_INPUT,
    transactionTaxTotalCents: 8009,
    transactionTaxLines: [
      { label: 'Transakčná daň', amountCents: 8003, count: 2 },
      { label: 'Transakčná daň (z poplatkov, úrokov)', amountCents: 3, count: 1 },
    ],
  })

  assert.ok(html.includes('Výpis z Účtu: Business účet S'))
  assert.ok(html.includes('č.3/2026 - Strana 1/1'))
  assert.ok(html.includes('SLOVENSKÁ'))
  assert.ok(html.includes('erste-symbol'))
  assert.ok(html.includes('Dátum vyhotovenia výpisu'))
  assert.ok(html.includes('Konečný stav Účtu'))
  assert.ok(html.includes('Transakčná daň spolu:'))
  assert.ok(html.includes('Prehľad zúčtovanej Transakčnej dane:'))
  assert.ok(html.includes('Vklad podliehajúci ochrane vkladov'))
  assert.ok(!html.includes('Informácia pre klienta'))
  assert.ok(!html.includes('Nepovoleného prečerpania'))
  assert.ok(!html.includes('Zostatok<br>po transakcii'))
}

function testAutoTransactionTax() {
  const tax = computeStatementTax([
    {
      id: '1',
      date: '01. 03. 2026',
      type: 'withdrawal',
      description: 'Test|Platba|Cat|SK|',
      amount: 10_000_000,
      balanceAfter: 0,
      feeCents: 15,
    },
    {
      id: '2',
      date: '02. 03. 2026',
      type: 'withdrawal',
      description: 'Test|Platba|Cat|SK|',
      amount: 10_000_000,
      balanceAfter: 0,
    },
  ])

  assert.equal(tax.lines[0]?.count, 2)
  assert.equal(tax.lines[0]?.amountCents, 80_000)
  assert.equal(tax.lines[1]?.amountCents, 3)
  assert.equal(tax.totalCents, 80_003)
}

async function testValidationErrors() {
  await assert.rejects(
    () =>
      generateTransactionsPdf({
        ...BASE_INPUT,
        holderAddressLines: [],
      }),
    StatementPdfValidationError,
  )

  await assert.rejects(
    () =>
      generateTransactionsPdf({
        ...BASE_INPUT,
        accountingPeriod: '01/03/2026-31/03/2026',
      }),
    StatementPdfValidationError,
  )
}

async function testPaymentConfirmationDate() {
  const paymentData = {
    transactionId: 'txn-123',
    createdAt: '15.07.2026 12:34:56',
    status: 'Štandardný platobný príkaz',
    transferType: 'external' as const,
    fromAccountNumber: 'SK0000000000000000000000',
    recipientName: 'Test Recipient',
    recipientAccountOrEmail: 'SK0000000000000000000001',
    amount: '100.00',
    currency: 'EUR',
    variableSymbol: '123456',
    constantSymbol: '',
    specificSymbol: '',
    note: '',
    payerReference: '',
    dueDate: '',
    repeatDays: '',
    createTemplate: false,
    emailConfirmation: false,
    balanceBefore: '1000.00',
    balanceAfter: '900.00',
  }

  const html = generatePaymentConfirmationHtml(paymentData)
  assert.ok(html.includes('15.07.2026'))
}

function testPaymentTransactionRow() {
  const html = generateTransactionsPdf({
    ...BASE_INPUT,
    transactions: [
      {
        id: 'pay-1',
        date: '15. 08. 2026',
        type: 'withdrawal',
        description:
          'Ján Kovác|Platba za tovar|Platby|SK9609000000000233473298|123456|||',
        amount: 10_000,
        balanceAfter: 4_024_000,
      },
    ],
  })

  return html.then((content) => {
    assert.ok(content.includes('Platba pre: Ján Kovác'))
    assert.ok(content.includes('Var. symbol: 123456'))
    assert.ok(content.includes('Poznámka: Platba za tovar'))
    assert.ok(content.includes('SK96 0900 0000 0002 3347 3298'))
    assert.ok(content.includes('- 100,00'))
  })
}

async function testEmptyTemplateMessage() {
  const html = await generateTransactionsPdf({
    ...BASE_INPUT,
    transactions: [],
  })

  assert.ok(html.includes('Žiadne transakcie v danom období'))
  assert.ok(!html.match(/class="transaction-row"/))
}

function testSkeletonHasNoData() {
  const html = renderStatementSkeletonHtml()

  for (const token of [
    '{{ accountName }}',
    '{{ accountNumber }}',
    '{{ accountingPeriod }}',
    '{{ initialBalance }}',
    '{{ depositsTotal }}',
    '{{ withdrawalsTotal }}',
    '{{ finalBalance }}',
    '{{ transactionTaxTotal }}',
  ]) {
    assert.ok(html.includes(token), `skeleton should expose ${token}`)
  }

  assert.ok(html.includes('Slovenská sporiteľňa, a.s.'), 'bank block stays static')
  assert.ok(html.includes('Žiadne transakcie v danom období'))
  assert.ok(!html.includes('DALMAN'), 'skeleton must not embed demo data')
  assert.ok(!html.includes('40 350,00'), 'skeleton must not embed demo balances')
  assert.ok(!html.match(/SK\d{2} \d{4}/), 'skeleton must not embed a real IBAN')
}

function testStatementFromPayment() {
  const statement = buildStatementFromPayment(
    {
      id: 'pay-1',
      date: '2026-08-06T09:30:00.000Z',
      recipientName: 'Ján Kovác',
      recipientIban: 'SK9609000000000233473298',
      amountCents: 10_000,
      variableSymbol: '123456',
      note: 'Platba za tovar',
    },
    {
      currency: 'EUR',
      holderAddressLines: ['Hlavná 1', '811 01 Bratislava'],
    },
  )

  assert.equal(statement.accountName, 'Ján Kovác')
  assert.equal(statement.accountNumber, 'SK9609000000000233473298')
  assert.equal(statement.statementDate, '06. 08. 2026')
  assert.equal(statement.accountingPeriod, '06. 08. 2026 - 06. 08. 2026')
  assert.equal(statement.statementNumber, '8/2026')
  assert.deepEqual(statement.holderAddressLines, [
    'Ján Kovác',
    'Hlavná 1',
    '811 01 Bratislava',
  ])

  // 0,40 % of a 100,00 EUR payment = 0,40 EUR; balances reconcile against it.
  assert.equal(statement.transactionTaxTotalCents, 40)
  assert.equal(statement.depositsTotal, 0)
  assert.equal(statement.withdrawalsTotal, 10_000)
  assert.equal(statement.finalBalance, -10_040)
  assert.equal(statement.transactions[0].balanceAfter, -10_040)

  assert.throws(
    () =>
      buildStatementFromPayment(
        { ...{ id: 'x', date: new Date(), recipientName: '', recipientIban: 'SK1', amountCents: 1 } },
        { holderAddressLines: ['Hlavná 1'] },
      ),
    StatementPdfValidationError,
  )
}

async function testPaymentStatementRendersPaymentValues() {
  const statement = buildStatementFromPayment(
    {
      id: 'pay-2',
      date: '2026-08-06T09:30:00.000Z',
      recipientName: 'Ján Kovác',
      recipientIban: 'SK9609000000000233473298',
      amountCents: 10_000,
      variableSymbol: '123456',
      note: 'Platba za tovar',
    },
    {
      currency: 'EUR',
      holderAddressLines: ['Hlavná 1', '811 01 Bratislava'],
    },
  )

  const html = await generateTransactionsPdf(statement)

  assert.ok(html.includes('Platba pre: Ján Kovác'))
  assert.ok(html.includes('SK96 0900 0000 0002 3347 3298'))
  assert.ok(html.includes('Var. symbol: 123456'))
  assert.ok(html.includes('- 0,40 EUR'))
  assert.ok(!html.includes('{{'), 'rendered statement keeps no placeholders')
}

async function testPaymentStatementIncludesExpectedIban() {
  const expectedIban = 'SK9609000000000233473298'
  const statement = buildStatementFromPayment(
    {
      id: 'pay-iban',
      date: '2026-08-06T09:30:00.000Z',
      recipientName: 'Ján Kovác',
      recipientIban: expectedIban,
      amountCents: 10_000,
      note: 'Kontrola IBAN',
    },
    {
      currency: 'EUR',
      holderAddressLines: ['Hlavná 1', '811 01 Bratislava'],
    },
  )

  const html = await generateTransactionsPdf(statement)
  const matches = html.match(/IBAN:\s*(SK\d{2}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4})/g) || []

  assert.equal(matches.length, 1, 'statement should render exactly one recipient IBAN')
  assert.ok(matches[0]?.includes('SK96 0900 0000 0002 3347 3298'))
}

async function run() {
  await testPaginationLogic()
  await testSlspTemplateStructure()
  testAutoTransactionTax()
  await testValidationErrors()
  await testPaymentTransactionRow()
  await testEmptyTemplateMessage()
  testSkeletonHasNoData()
  testStatementFromPayment()
  await testPaymentStatementRendersPaymentValues()
  await testPaymentStatementIncludesExpectedIban()
  await testPaymentConfirmationDate()
  console.log('pdf-generator.test.ts: all tests passed')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
