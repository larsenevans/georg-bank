import assert from 'node:assert/strict'
import {
  CZK_EXCHANGE_RATE,
  convertCzkToEur,
  convertEurToCzk,
} from '../types/payment'

console.log('🇨🇿 [FX-TEST] Spúšťam testy pre menový prepočet EUR ⇄ CZK...')

// 1. Overenie referenčného kurzu
assert.equal(CZK_EXCHANGE_RATE, 25.20, 'Referenčný kurz musí byť 25.20 CZK za 1 EUR')
console.log('  ✅ 1. Referenčný kurz ČNB/ECB 1 EUR = 25.20 CZK overený')

// 2. Prepočet 1 000 CZK -> EUR
const eur1000 = convertCzkToEur(1000)
// 1000 / 25.2 = 39.6825... -> 39.68 EUR
assert.equal(eur1000, 39.68, '1000 CZK musí byť 39.68 EUR')
console.log(`  ✅ 2. 1 000 CZK -> ${eur1000} EUR PASS`)

// 3. Prepočet z reálneho českého QR (23 990 CZK)
const eurReal = convertCzkToEur(23990)
// 23990 / 25.2 = 951.9841... -> 951.98 EUR
assert.equal(eurReal, 951.98, '23 990 CZK musí byť 951.98 EUR')
console.log(`  ✅ 3. Reálna platba 23 990 CZK -> ${eurReal} EUR PASS`)

// 4. Obojsmerný prepočet EUR -> CZK
const czkFromEur = convertEurToCzk(39.68)
// 39.68 * 25.2 = 999.936 -> 999.94 CZK
assert.equal(czkFromEur, 999.94, '39.68 EUR musí byť ~999.94 CZK')
console.log(`  ✅ 4. Obojsmerný prepočet 39.68 EUR -> ${czkFromEur} CZK PASS`)

// 5. Presnosť zaokrúhľovania malých aj veľkých súm
const smallEur = convertCzkToEur(25.20)
assert.equal(smallEur, 1.00, '25.20 CZK musí byť presne 1.00 EUR')
const roundEur = convertCzkToEur(100)
assert.equal(roundEur, 3.97, '100 CZK musí byť 3.97 EUR (zaokrúhlenie 3.968)')
console.log('  ✅ 5. Matematická presnosť a zaokrúhľovanie PASS')

console.log('\n🎉 [FX-TEST] VŠETKY TESTY PREPOČTU EUR ⇄ CZK PREŠLI NA 100%!')
