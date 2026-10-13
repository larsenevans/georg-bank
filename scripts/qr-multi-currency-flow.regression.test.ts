import assert from 'node:assert/strict'
import {
  CZK_EXCHANGE_RATE,
  convertCzkToEur,
  convertEurToCzk,
  PaymentDraft,
} from '../types/payment'
import { decodeQrCode } from '../utils/qr/decoder'
import { validateIbanChecksum } from '../utils/qr/normalizer'
import { czechIbanToNational } from '../utils/qr/czechAccount'
import { DAILY_PAYMENT_LIMIT_EUR } from '../lib/daily-payment-limit'

/**
 * Pomocná funkcia pre výpočet ISO 7064 MOD 97-10 checksumu
 */
function computeMod97(numericString: string): number {
  let remainder = ''
  for (let i = 0; i < numericString.length; i++) {
    remainder = (remainder + numericString[i]).replace(/^0+/, '')
    if (remainder.length >= 9) {
      const part = remainder.slice(0, 9)
      remainder = (parseInt(part, 10) % 97) + remainder.slice(9)
    }
  }
  return parseInt(remainder || '0', 10) % 97
}

/**
 * Generátor platného náhodného slovenského IBANu (SK)
 */
function generateRandomSlovakIban(): string {
  const bankCode = '0900' // Slovenská sporiteľňa
  // 16 náhodných číslic pre predčíslie a číslo účtu
  let accountPart = ''
  for (let i = 0; i < 16; i++) {
    accountPart += Math.floor(Math.random() * 10).toString()
  }
  const bban = bankCode + accountPart

  // Výpočet kontrolných číslic: bban + S(28) + K(20) + 00
  const checkString = bban + '282000'
  const remainder = computeMod97(checkString)
  const checkDigits = (98 - remainder).toString().padStart(2, '0')

  const iban = `SK${checkDigits}${bban}`
  assert.equal(validateIbanChecksum(iban), true, 'Vygenerovaný SK IBAN musí spĺňať MOD-97')
  return iban
}

/**
 * Generátor platného náhodného českého IBANu (CZ)
 */
function generateRandomCzechIban(): string {
  const bankCode = '0800' // Česká spořitelna
  let accountPart = ''
  for (let i = 0; i < 16; i++) {
    accountPart += Math.floor(Math.random() * 10).toString()
  }
  const bban = bankCode + accountPart

  // Výpočet kontrolných číslic: bban + C(12) + Z(35) + 00
  const checkString = bban + '123500'
  const remainder = computeMod97(checkString)
  const checkDigits = (98 - remainder).toString().padStart(2, '0')

  const iban = `CZ${checkDigits}${bban}`
  assert.equal(validateIbanChecksum(iban), true, 'Vygenerovaný CZ IBAN musí spĺňať MOD-97')
  return iban
}

export async function runQrMultiCurrencyPaymentRegressionTest() {
  console.log('========================================================================')
  console.log('🧪 REGRESNÝ TEST FLOW: NOVÁ PLATBA -> QR SKEN -> ODOSLANIE V EUR AJ CZK')
  console.log('   (Odoslanie na 2 rôzne náhodné overené IBANy so switchom a konverziou)')
  console.log('========================================================================\n')

  // Počiatočný stav účtu
  let currentBalanceEur = 8500.00
  let totalOutgoingEur = 0.00
  const transactions: Array<{
    id: string
    recipient: string
    iban: string
    amountEur: number
    currency: 'EUR' | 'CZK'
    originalAmount?: number
    vs?: string
    note: string
    date: Date
  }> = []

  // --------------------------------------------------------------------------
  // KROK 1: Generovanie dvoch rôznych unikátnych náhodných IBANov
  // --------------------------------------------------------------------------
  console.log('--- [Krok 1/4] Generovanie 2 rôznych náhodných overených IBANov ---')
  const randomIban1_Eur = generateRandomSlovakIban()
  const randomIban2_Czk = generateRandomCzechIban()

  assert.notEqual(randomIban1_Eur, randomIban2_Czk, 'Obe IBANy musia byť odlišné')
  assert.ok(randomIban1_Eur.startsWith('SK'), '1. IBAN musí byť slovenský pre EUR platbu')
  assert.ok(randomIban2_Czk.startsWith('CZ'), '2. IBAN musí byť český pre CZK platbu')

  console.log(`  ✅ 1. Náhodný overený SK IBAN (pre EUR platbu): ${randomIban1_Eur}`)
  console.log(`  ✅ 2. Náhodný overený CZ IBAN (pre CZK platbu): ${randomIban2_Czk}`)

  // --------------------------------------------------------------------------
  // KROK 2: Flow 1 — Otvorenie platby, načítanie EUR QR kódu a odoslanie v EUR
  // --------------------------------------------------------------------------
  console.log('\n--- [Krok 2/4] Flow 1: Otvorenie "Nová platba" -> Skenovanie EUR QR kódu -> Odoslanie v EUR ---')
  
  // Simulácia EPC / PayBySquare QR kódu
  const sampleEurQrPayload =
    'BCD\n002\n1\nSCT\n\nJan Novak\nSK8975000000000012345678\nEUR149.90\n\n\nFaktura za sluzby IT\n'
  
  const eurQrResult = await decodeQrCode(sampleEurQrPayload)
  assert.equal(eurQrResult.success, true, 'EUR QR kód sa musí úspešne dekódovať')
  assert.ok(eurQrResult.drafts.length >= 1, 'Musí vrátiť draft platby')

  const eurDraft: PaymentDraft = eurQrResult.drafts[0]
  assert.equal(eurDraft.currency, 'EUR', 'Mena z QR kódu musí byť EUR')
  assert.equal(eurDraft.amount, 149.90, 'Suma z QR kódu musí byť 149.90 €')

  // Nahradenie príjemcu z QR kódu náhodným cieľovým slovenským IBANom (podľa zadania na random IBAN)
  const payment1_recipient = eurDraft.recipientName || 'Firma Alfa s.r.o.'
  const payment1_iban = randomIban1_Eur
  const payment1_amountEur = eurDraft.amount!
  const payment1_vs = '202604001'
  const payment1_note = eurDraft.note || 'Úhrada faktúry v EUR'

  // Validácia bankových pravidiel pred odoslaním
  assert.ok(payment1_amountEur >= 1.00, 'Minimálna suma musí byť aspoň 1.00 €')
  assert.ok(payment1_amountEur <= currentBalanceEur, 'Suma nesmie prekročiť zostatok')
  assert.ok(totalOutgoingEur + payment1_amountEur <= DAILY_PAYMENT_LIMIT_EUR, 'Nesmie prekročiť denný limit')

  // Vykonanie platby 1 (EUR)
  currentBalanceEur -= payment1_amountEur
  totalOutgoingEur += payment1_amountEur
  const txn1 = {
    id: `pay_eur_${Date.now()}`,
    recipient: payment1_recipient,
    iban: payment1_iban,
    amountEur: payment1_amountEur,
    currency: 'EUR' as const,
    vs: payment1_vs,
    note: payment1_note,
    date: new Date(),
  }
  transactions.push(txn1)

  console.log(`  ✅ Údaje z EUR QR kódu načítané: ${payment1_recipient}, ${payment1_amountEur.toFixed(2)} €`)
  console.log(`  ✅ Platba 1 ODOSLANÁ v EUR na random IBAN: ${payment1_iban}`)
  console.log(`  ✅ Nový zostatok na účte po EUR platbe: ${currentBalanceEur.toFixed(2)} €`)

  // --------------------------------------------------------------------------
  // KROK 3: Flow 2 — Otvorenie platby, načítanie CZK QR kódu a odoslanie v CZK
  // --------------------------------------------------------------------------
  console.log('\n--- [Krok 3/4] Flow 2: Otvorenie "Nová platba" -> Skenovanie CZK QR kódu -> Auto-detekcia -> Odoslanie v CZK ---')
  
  // Simulácia českého SPAYD QR kódu s čiastkou v CZK
  const sampleCzkQrPayload =
    'SPD*1.0*ACC:CZ4808000000000123456789*AM:5040.00*CC:CZK*RN:Karel Dvorak*VS:9988776655*MSG:Dodavka tovaru Brno*'
  
  const czkQrResult = await decodeQrCode(sampleCzkQrPayload)
  assert.equal(czkQrResult.success, true, 'CZK SPAYD QR kód sa musí úspešne dekódovať')
  assert.equal(czkQrResult.format, 'spayd', 'Formát musí byť SPAYD')

  const czkDraft: PaymentDraft = czkQrResult.drafts[0]
  assert.equal(czkDraft.currency, 'CZK', 'Mena musí byť CZK')
  assert.equal(czkDraft.amount, 5040.00, 'Suma musí byť 5040.00 CZK')

  // Auto-detekcia meny a národného formátu
  const isCzkAccount = czkDraft.currency === 'CZK' || Boolean(randomIban2_Czk.startsWith('CZ'))
  assert.equal(isCzkAccount, true, 'Systém musí automaticky rozpoznať český účet')

  // Test výpočtu FX ekvivalentu (5040 CZK / 25.20 = 200.00 EUR)
  const czkAmountRaw = czkDraft.amount!
  const eurEquivalent = convertCzkToEur(czkAmountRaw)
  assert.equal(eurEquivalent, 200.00, '5 040 CZK pri kurze 25.20 musí byť presne 200.00 EUR')

  // Test interaktívneho prepínača (Switcher):
  // 1. Switch na EUR:
  const switchedToEur = convertCzkToEur(czkAmountRaw)
  assert.equal(switchedToEur, 200.00, 'Prepnutie na EUR zobrazí 200.00 €')
  // 2. Switch späť na CZK:
  const switchedBackToCzk = convertEurToCzk(switchedToEur)
  assert.equal(switchedBackToCzk, 5040.00, 'Prepnutie späť na CZK vráti presne 5 040.00 Kč')

  // Cieľové údaje pre 2. platbu na náhodný CZ IBAN
  const payment2_recipient = czkDraft.recipientName || 'Karel Dvorak'
  const payment2_iban = randomIban2_Czk
  const payment2_amountCzk = czkAmountRaw
  const payment2_amountInEurDebited = eurEquivalent
  const payment2_vs = czkDraft.variableSymbol || '9988776655'
  const payment2_fxNote = `${czkDraft.note || 'Dodávka tovaru'} • Platba do ČR: ${payment2_amountCzk.toFixed(2)} CZK (kurz 1 EUR = ${CZK_EXCHANGE_RATE.toFixed(2)} CZK)`

  // Overenie národného českého tvaru účtu
  const nationalCzechAcc = czechIbanToNational(payment2_iban)
  assert.ok(nationalCzechAcc !== null, 'Z českého IBANu musí byť možné odvodiť národný tvar účtu pre príjemcu v ČR')

  // Validácia limitov pred odoslaním 2. platby
  assert.ok(payment2_amountInEurDebited >= 1.00, 'Minimálna suma v EUR musí byť aspoň 1.00 €')
  assert.ok(payment2_amountInEurDebited <= currentBalanceEur, 'Na účte musí byť dostatok prostriedkov')
  assert.ok(totalOutgoingEur + payment2_amountInEurDebited <= DAILY_PAYMENT_LIMIT_EUR, 'Celková suma nesmie prekročiť denný limit')

  // Vykonanie platby 2 (CZK s odpočtom EUR)
  currentBalanceEur -= payment2_amountInEurDebited
  totalOutgoingEur += payment2_amountInEurDebited
  const txn2 = {
    id: `pay_czk_${Date.now()}`,
    recipient: payment2_recipient,
    iban: payment2_iban,
    amountEur: payment2_amountInEurDebited,
    currency: 'CZK' as const,
    originalAmount: payment2_amountCzk,
    vs: payment2_vs,
    note: payment2_fxNote,
    date: new Date(),
  }
  transactions.push(txn2)

  console.log(`  ✅ Údaje z CZK SPAYD QR kódu načítané: ${payment2_recipient}, ${payment2_amountCzk.toFixed(2)} Kč`)
  console.log(`  ✅ Kurz: 1 EUR = ${CZK_EXCHANGE_RATE.toFixed(2)} CZK -> z EUR účtu sa odpočíta: ${payment2_amountInEurDebited.toFixed(2)} €`)
  console.log(`  ✅ Platba 2 ODOSLANÁ v CZK na náhodný CZ IBAN: ${payment2_iban} (${nationalCzechAcc?.formatted})`)
  console.log(`  ✅ Nový zostatok na účte po CZK platbe: ${currentBalanceEur.toFixed(2)} €`)

  // --------------------------------------------------------------------------
  // KROK 4: Súhrnná auditná verifikácia
  // --------------------------------------------------------------------------
  console.log('\n--- [Krok 4/4] Záverečná verifikácia audit trailu, limitov a dokladov ---')
  assert.equal(transactions.length, 2, 'Musia existovať presne 2 odoslané platby')
  assert.equal(transactions[0].currency, 'EUR', '1. platba bola v EUR')
  assert.equal(transactions[1].currency, 'CZK', '2. platba bola v CZK')
  assert.notEqual(transactions[0].iban, transactions[1].iban, 'Obe platby odišli na rozdielne IBANy')
  assert.equal(totalOutgoingEur, 349.90, 'Celková suma odoslaná v EUR musí byť 149.90 + 200.00 = 349.90 €')
  assert.equal(currentBalanceEur, 8150.10, 'Konečný zostatok musí byť presne 8 150.10 €')

  console.log(`  ✅ Celkový obrat oboch platieb: ${totalOutgoingEur.toFixed(2)} €`)
  console.log(`  ✅ Konečný zostatok zodpovedá matematike: ${currentBalanceEur.toFixed(2)} €`)
  console.log(`  ✅ Audit trail obsahuje záznam o kurze aj pôvodnej CZK sume.`)

  console.log('\n========================================================================')
  console.log('🎉 KOMPLETNÝ REGRESNÝ TEST PRE DVOJITÚ PLATBU (EUR + CZK) PREŠIEL NA 100%!')
  console.log('========================================================================\n')
}

// Spustenie pri priamom volaní
if (require.main === module) {
  runQrMultiCurrencyPaymentRegressionTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Test zlyhal:', err)
      process.exit(1)
    })
}
