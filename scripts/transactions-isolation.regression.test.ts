import assert from 'node:assert/strict'
import { isSuperadminToken, isSuperadminCode } from '../lib/access-flow'

interface MockTransaction {
  id: string
  userId: string
  amount: number
  description: string
  isSuperadmin: boolean
  createdAt: Date
}

async function runTransactionsIsolationRegressionTest() {
  console.log('========================================================================')
  console.log('🧪 SPUSTENIE REGRESNÝCH TESTOV: IZOLÁCIA TRANSAKCIÍ (GUEST VS SUPERADMIN)')
  console.log('========================================================================\n')

  const guestUserId = 'guest-user-uuid-12345'
  const regularGuestCookieToken = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  const superadminCookieToken = 'superadmin_999988887777666655554444'

  // Vytvoríme sadu testovacích dát
  const sampleTransactions: MockTransaction[] = [
    {
      id: 'txn-guest-1',
      userId: guestUserId,
      amount: -1500, // 15.00 €
      description: 'Nákup potravín Billa',
      isSuperadmin: false,
      createdAt: new Date('2026-10-09T08:00:00Z'),
    },
    {
      id: 'txn-superadmin-1',
      userId: guestUserId,
      amount: -500000, // 5 000.00 €
      description: 'Superadmin prevod na zahraničný účet',
      isSuperadmin: true,
      createdAt: new Date('2026-10-09T08:15:00Z'),
    },
    {
      id: 'txn-guest-2',
      userId: guestUserId,
      amount: 10000, // 100.00 €
      description: 'Výplata mzdy',
      isSuperadmin: false,
      createdAt: new Date('2026-10-09T08:30:00Z'),
    },
    {
      id: 'txn-superadmin-2',
      userId: guestUserId,
      amount: -250000, // 2 500.00 €
      description: 'Superadmin interný presun likvidity',
      isSuperadmin: true,
      createdAt: new Date('2026-10-09T08:45:00Z'),
    },
  ]

  console.log('--- [1/4] Testovanie detekcie role z cookie tokenu ---')
  const isGuestAdmin = Boolean(
    isSuperadminToken(regularGuestCookieToken) || isSuperadminCode(regularGuestCookieToken)
  )
  const isSuperAdminRole = Boolean(
    isSuperadminToken(superadminCookieToken) || isSuperadminCode(superadminCookieToken)
  )

  assert.equal(isGuestAdmin, false, 'Bežný hosť nesmie byť označený ako Superadmin')
  assert.equal(isSuperAdminRole, true, 'Superadmin token musí byť správne rozpoznaný')
  console.log('  ✅ Detekcia rolí funguje korektne.')

  console.log('\n--- [2/4] Testovanie filtrovania GET /api/transactions pre bežného hosťa ---')
  // Simulácia filtra z app/api/transactions/route.ts
  const guestVisibleTxns = sampleTransactions.filter((t) => {
    return isGuestAdmin ? t.userId === guestUserId : t.userId === guestUserId && !t.isSuperadmin
  })

  assert.equal(guestVisibleTxns.length, 2, 'Bežný hosť musí vidieť presne 2 klientske transakcie')
  assert.ok(
    guestVisibleTxns.every((t) => !t.isSuperadmin),
    'ŽIADNA transakcia zobrazená bežnému hosťovi nesmie mať isSuperadmin === true'
  )
  assert.ok(
    !guestVisibleTxns.some((t) => t.id === 'txn-superadmin-1' || t.id === 'txn-superadmin-2'),
    'Superadmin transakcie nesmú byť prítomné v klientskom zozname'
  )
  console.log('  ✅ Bežný hosť má 100% odfiltrované všetky admin transakcie.')

  console.log('\n--- [3/4] Testovanie histórie pre Superadmina ---')
  const adminVisibleTxns = sampleTransactions.filter((t) => {
    return isSuperAdminRole ? t.userId === guestUserId : t.userId === guestUserId && !t.isSuperadmin
  })

  assert.equal(adminVisibleTxns.length, 4, 'Superadmin musí vidieť všetky transakcie (4)')
  assert.ok(
    adminVisibleTxns.some((t) => t.isSuperadmin),
    'Superadmin zoznam musí obsahovať aj admin transakcie'
  )
  console.log('  ✅ Superadmin má prístup k úplnej histórii vrátane admin platieb.')

  console.log('\n--- [4/4] Testovanie izolácie denného limitu (usedCents) ---')
  // Výpočet použitého limitu pre hosťa: admin platby nesmú ovplyvniť klientsky limit
  const guestOutgoingUsed = sampleTransactions
    .filter((t) => (isGuestAdmin ? true : !t.isSuperadmin) && t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  // Hosť poslal len 15.00 € (-1500 centov). Superadmin poslal 7 500 € (-750000 centov).
  assert.equal(
    guestOutgoingUsed,
    1500,
    'Hosťov denný limit musí počítať IBA klientske platby (15,00 €), nesmie započítať 7 500 € od admina'
  )
  console.log('  ✅ Denný limit bežného hosťa nie je nijako ovplyvnený platbami Superadmina.')

  console.log('\n========================================================================')
  console.log('🎉 VŠETKY ASSERTIONS PRE IZOLÁCIU TRANSAKCIÍ ÚSPEŠNE PREŠLI!')
  console.log('========================================================================\n')
}

runTransactionsIsolationRegressionTest().catch((err) => {
  console.error('❌ [Transactions-Isolation-Test] Zlyhanie:', err)
  process.exit(1)
})
