import assert from 'node:assert/strict'
import { decodeQrCode, QrDecodingError } from '../utils/qr/decoder'
import { validatePaymentDraft } from '../utils/qr/validator'
import { normalizeAmount, normalizeDate, validateIbanChecksum } from '../utils/qr/normalizer'

export async function runQr50ScenariosTest() {
  // A. HAPPY PATH
  // 01. Základná CZK platba — validný SPAYD, IBAN + suma + CZK
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:500.00*CC:CZK*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true, '01. success should be true')
    assert.strictEqual(result.drafts[0].iban, 'CZ5508000000001234567890')
    assert.strictEqual(result.drafts[0].amount, 500.0)
    assert.strictEqual(result.drafts[0].currency, 'CZK')
  }

  // 02. Platba s VS — X-VS sa načíta bez straty núl
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:0012345678*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].variableSymbol, '0012345678')
  }

  // 03. Platba s KS — X-KS sa správne zobrazí
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-KS:0308*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].constantSymbol, '0308')
  }

  // 04. Platba so SS — X-SS sa správne zobrazí
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-SS:123456*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].specificSymbol, '123456')
  }

  // 05. VS + KS + SS súčasne
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:0001234567*X-KS:0308*X-SS:987654*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].variableSymbol, '0001234567')
    assert.strictEqual(result.drafts[0].constantSymbol, '0308')
    assert.strictEqual(result.drafts[0].specificSymbol, '987654')
  }

  // 06. Platba so správou
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Faktura za konzultaciu*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].note, 'Faktura za konzultaciu')
  }

  // 07. Platba s názvom príjemcu
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RN:Jan Novak*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].recipientName, 'Jan Novak')
  }

  // 08. Platba s dátumom splatnosti
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*DT:20260915*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.ok(result.drafts[0].dueDate instanceof Date)
    assert.strictEqual(result.drafts[0].dueDate?.getFullYear(), 2026)
    assert.strictEqual(result.drafts[0].dueDate?.getMonth(), 8)
    assert.strictEqual(result.drafts[0].dueDate?.getDate(), 15)
  }

  // 09. Platba bez sumy
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RN:Alza.cz*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].amount, null)
  }

  // 10. Platba 0,01 CZK
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:0.01*CC:CZK*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].amount, 0.01)
  }

  // 11. Platba 1,00 CZK
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:1.00*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].amount, 1.0)
  }

  // 12. Platba 1234,56 CZK
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:1234.56*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].amount, 1234.56)
  }

  // 13. Vysoká suma
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:999999.99*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].amount, 999999.99)
  }

  // 14. CZ IBAN
  {
    const payload = 'SPD*1.0*ACC:CZ6508000000192000145399*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].iban, 'CZ6508000000192000145399')
  }

  // 15. IBAN s BIC v ACC
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890+GIBACZPX*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].iban, 'CZ5508000000001234567890')
    assert.strictEqual(result.drafts[0].bic, 'GIBACZPX')
  }

  // 16. EUR cez SPAYD
  {
    const payload = 'SPD*1.0*ACC:SK3109000000005012345678*AM:120.00*CC:EUR*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].currency, 'EUR')
  }

  // 17. EPC/GiroCode EUR
  {
    const payload = 'BCD\n002\n1\nSCT\n\nJan Novak\nSK8975000000000012345678\nEUR150.00\n\n\n\n'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.format, 'epc-sepa')
    assert.strictEqual(result.drafts[0].iban, 'SK8975000000000012345678')
    assert.strictEqual(result.drafts[0].amount, 150.0)
    assert.strictEqual(result.drafts[0].recipientName, 'Jan Novak')
  }

  // 18. EPC s BIC
  {
    const payload = 'BCD\n002\n1\nSCT\nGIBASKSX\nJan Novak\nSK8975000000000012345678\nEUR100.00\n\n\n\n'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].bic, 'GIBASKSX')
  }

  // 19. EPC bez BIC
  {
    const payload = 'BCD\n002\n1\nSCT\n\nJan Novak\nSK8975000000000012345678\nEUR100.00\n\n\n\n'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].bic, null)
  }

  // 20. EPC s payment reference
  {
    const payload = 'BCD\n002\n1\nSCT\n\nJan Novak\nSK8975000000000012345678\nEUR100.00\n\nRF18539007547034\n\n'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].paymentReference, 'RF18539007547034')
  }

  // B. TEXT / ENCODING / PARSER
  // 21. Česká diakritika
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Příliš žluťoučký kůň úpěl ďábelské ódy*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].note, 'Příliš žluťoučký kůň úpěl ďábelské ódy')
  }

  // 22. Slovenská diakritika
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RN:Ľuboš Šťastný*MSG:úhrada č. 1*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].recipientName, 'Ľuboš Šťastný')
    assert.strictEqual(result.drafts[0].note, 'úhrada č. 1')
  }

  // 23. Unicode recipient
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RN:Müller & Söhne GmbH*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].recipientName, 'Müller & Söhne GmbH')
  }

  // 24. Medzery v správe
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Viacslovna sprava pre prijemcu platby*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].note, 'Viacslovna sprava pre prijemcu platby')
  }

  // 25. Špeciálne znaky
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Platba #123 & / + : %*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.ok(result.drafts[0].note?.includes('#123'))
  }

  // 26. Percent-encoded obsah
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Platba%20za%20sluzby%20s.r.o.*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].note, 'Platba za sluzby s.r.o.')
  }

  // 27. Maximálne dlhý MSG (60 znakov podľa SPAYD spec)
  {
    const longMsg = 'A'.repeat(60)
    const payload = `SPD*1.0*ACC:CZ5508000000001234567890*MSG:${longMsg}*`
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].note?.length, 60)
  }

  // 28. Maximálne dlhý recipient (35 znakov)
  {
    const longName = 'B'.repeat(35)
    const payload = `SPD*1.0*ACC:CZ5508000000001234567890*RN:${longName}*`
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].recipientName.length, 35)
  }

  // 29. VS začínajúci nulami — 0000123456
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:0000123456*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].variableSymbol, '0000123456')
  }

  // 30. Maximálna dĺžka VS (10 číslic)
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:1234567890*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].variableSymbol, '1234567890')
  }

  // C. INVALID / SECURITY / NEGATIVE
  // 31. Úplne neplatný QR
  {
    const result = await decodeQrCode('HELLO WORLD')
    assert.strictEqual(result.success, false)
  }

  // 32. URL QR — odmietnuté
  {
    let threw = false
    try {
      await decodeQrCode('https://example.com')
    } catch (e) {
      if (e instanceof QrDecodingError) threw = true
    }
    assert.strictEqual(threw, true, 'URL payload should throw QrDecodingError')
  }

  // 33. Wi-Fi QR
  {
    const result = await decodeQrCode('WIFI:T:WPA;S:MyNet;P:Secret;;')
    assert.strictEqual(result.success, false)
  }

  // 34. Prázdny QR payload
  {
    let threw = false
    try {
      await decodeQrCode('')
    } catch (e) {
      if (e instanceof QrDecodingError) threw = true
    }
    assert.strictEqual(threw, true, 'Empty payload should throw QrDecodingError')
  }

  // 35. Poškodený SPAYD header
  {
    const result = await decodeQrCode('SPX*1.0*ACC:CZ5508000000001234567890*')
    assert.strictEqual(result.success, false)
  }

  // 36. Unsupported SPAYD verzia
  {
    const result = await decodeQrCode('SPD*9.9*ACC:CZ5508000000001234567890*')
    assert.strictEqual(result.success, false)
    assert.ok(result.error?.includes('Unsupported SPAYD version'))
  }

  // 37. Chýbajúci účet/IBAN
  {
    const result = await decodeQrCode('SPD*1.0*AM:100.00*CC:CZK*')
    assert.strictEqual(result.success, false)
    assert.ok(result.error?.includes('No valid IBAN/account found'))
  }

  // 38. Neplatný IBAN checksum
  {
    assert.strictEqual(validateIbanChecksum('SK0000000000000000000000'), false)
  }

  // 39. Neexistujúci currency code
  {
    const draft = {
      qrFormat: 'spayd' as const,
      recipientName: 'Test',
      iban: 'SK6609000000005012345678',
      bic: null,
      amount: 100,
      currency: 'XYZ123',
      variableSymbol: null,
      constantSymbol: null,
      specificSymbol: null,
      note: null,
      paymentReference: null,
      dueDate: null,
      rawQrData: null,
    }
    const validation = validatePaymentDraft(draft)
    assert.strictEqual(validation.valid, false)
    assert.ok(validation.errors.some((e) => e.field === 'currency'))
  }

  // 40. Záporná suma
  {
    assert.strictEqual(normalizeAmount('-100.00'), null)
  }

  // 41. Nečíselná suma
  {
    assert.strictEqual(normalizeAmount('ABC'), null)
  }

  // 42. Príliš veľa desatinných miest
  {
    assert.strictEqual(normalizeAmount('10.999999'), 11)
  }

  // 43. Neplatný VS (písmená) — orezané na číslice
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:ABC123DEF*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].variableSymbol, '123')
  }

  // 44. VS dlhší než limit (10 číslic)
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:123456789012345*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].variableSymbol, '1234567890')
  }

  // 45. Neplatný dátum
  {
    assert.strictEqual(normalizeDate('20261345'), null)
  }

  // 46. Duplicate fields
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:100.00*AM:200.00*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].amount, 100.0)
  }

  // 47. Spracovanie PAY by square a EPC checksum integrity
  {
    assert.strictEqual(validateIbanChecksum('SK6609000000005012345678'), true)
  }

  // 48. Extrémne dlhý payload
  {
    const hugePayload = 'SPD*1.0*' + 'A'.repeat(2500)
    let threw = false
    try {
      await decodeQrCode(hugePayload)
    } catch (e: unknown) {
      if (e instanceof Error && /too large/i.test(e.message)) {
        threw = true
      }
    }
    assert.strictEqual(threw, true, 'Huge payload should throw too large error')
  }

  // 49. Injection payload — XSS sanitization
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:<script>alert(1)</script>Platba*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].note?.includes('<script>'), false)
    assert.strictEqual(result.drafts[0].note, 'alert(1)Platba')
  }

  // 50. SQL-like payload
  {
    const payload = "SPD*1.0*ACC:CZ5508000000001234567890*MSG:' OR 1=1 -- *"
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].note, "' OR 1=1 --")
  }

  // E. CZ SPAYD EXTENSIONS (ALT-ACC, PT:IP, CRC32)
  // 51. SPAYD so všetkými poľami
  {
    const payload =
      'SPD*1.0*ACC:CZ5508000000001234567890+GIBACZPX*AM:480.55*CC:CZK*RN:PETR DVORAK*DT:20260915*MSG:PLATBA ZA ZBOZI*X-VS:0012345678*X-KS:0308*X-SS:123456*PT:IP*RF:9876543210*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.format, 'spayd')
    const d = result.drafts[0]
    assert.strictEqual(d.iban, 'CZ5508000000001234567890')
    assert.strictEqual(d.bic, 'GIBACZPX')
    assert.strictEqual(d.amount, 480.55)
    assert.strictEqual(d.currency, 'CZK')
    assert.strictEqual(d.recipientName, 'PETR DVORAK')
    assert.strictEqual(d.variableSymbol, '0012345678')
    assert.strictEqual(d.constantSymbol, '0308')
    assert.strictEqual(d.specificSymbol, '123456')
    assert.strictEqual(d.note, 'PLATBA ZA ZBOZI')
    assert.strictEqual(d.immediatePayment, true)
    assert.strictEqual(d.paymentReference, '9876543210')
    assert.strictEqual(d.dueDate?.getFullYear(), 2026)
  }

  // 52. ALT-ACC
  {
    const payload =
      'SPD*1.0*ACC:CZ5508000000001234567890*ALT-ACC:CZ6508000000192000145399+GIBACZPX,CZ5855000000001265098001*AM:100.00*CC:CZK*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts.length, 3)
    assert.strictEqual(result.drafts[0].iban, 'CZ5508000000001234567890')
    assert.strictEqual(result.drafts[1].iban, 'CZ6508000000192000145399')
    assert.strictEqual(result.drafts[1].bic, 'GIBACZPX')
    assert.strictEqual(result.drafts[2].iban, 'CZ5855000000001265098001')
    assert.ok((result.warnings?.length || 0) > 0)
  }

  // 53. PT:IP
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*PT:IP*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].immediatePayment, true)
  }

  // 54. CRC32 valid
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:500.00*CC:CZK*CRC32:C798A0B4*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].amount, 500)
  }

  // 55. CRC32 invalid
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:500.00*CC:CZK*CRC32:00000000*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, false)
    assert.ok(result.error?.includes('CRC32'))
  }

  // 56. RF bez VS
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RF:000012345678*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].variableSymbol, '0000123456')
    assert.strictEqual(result.drafts[0].paymentReference, '000012345678')
  }

  // 57. X-URL
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-URL:https://example.com/pay*RN:Test*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].recipientName, 'Test')
  }

  // 58. Percent-encoding (%2A)
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Ref%2A123*'
    const result = await decodeQrCode(payload)
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.drafts[0].note, 'Ref*123')
  }

  // D. INTEGRATION & 5-FIELD MAPPING
  // PAY by square
  {
    const pbs =
      'Ver=1.2;Typ=PAY;Name=Miroslav Polacek;UC=SK6609000000005012345678;Mena=EUR;Sum=125.50;VS=0000123456;Popis=Uhrada faktury 2026'
    const result = await decodeQrCode(pbs)
    assert.strictEqual(result.success, true)
    const draft = result.drafts[0]
    assert.strictEqual(draft.recipientName, 'Miroslav Polacek')
    assert.strictEqual(draft.iban, 'SK6609000000005012345678')
    assert.strictEqual(draft.amount, 125.5)
    assert.strictEqual(draft.variableSymbol, '0000123456')
    assert.strictEqual(draft.note, 'Uhrada faktury 2026')
  }

  // SPAYD
  {
    const spayd =
      'SPD*1.0*ACC:SK6609000000005012345678*AM:1234.56*CC:EUR*RN:Peter Ziak*X-VS:0098765432*MSG:Platba za material 1234*'
    const result = await decodeQrCode(spayd)
    assert.strictEqual(result.success, true)
    const draft = result.drafts[0]
    assert.strictEqual(draft.recipientName, 'Peter Ziak')
    assert.strictEqual(draft.iban, 'SK6609000000005012345678')
    assert.strictEqual(draft.amount, 1234.56)
    assert.strictEqual(draft.variableSymbol, '0098765432')
    assert.strictEqual(draft.note, 'Platba za material 1234')
  }

  return { success: true, count: 58 }
}

runQr50ScenariosTest()
  .then((res) => {
    console.log(`✅ [QR-50] Všetkých ${res.count} QR testovacích scenárov úspešne prešlo!`)
  })
  .catch((err) => {
    console.error('❌ [QR-50] Test zlyhal:', err)
    process.exit(1)
  })
