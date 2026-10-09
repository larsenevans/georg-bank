import assert from 'node:assert/strict';
import { decodeQrCode } from '../utils/qr/decoder';
import {
  czechIbanToNational,
  czechNationalToIban,
  validateCzechDomesticAccount,
  parseCzechNationalAccount,
} from '../utils/qr/czechAccount';
import { validatePaymentDraft } from '../utils/qr/validator';

export async function runQrCzechRepublicTest() {
  console.log('🇨🇿 [QR-CZECH-TEST] Spúšťam testovaciu sadu pre české QR platby (SPAYD v1.0)...');

  // =========================================================================
  // 1. REÁLNY POUŽÍVATEĽSKÝ QR KÓD (Z NAHRANÉHO OBRÁZKA)
  // =========================================================================
  {
    const realUserPayload = 'SPD*1.0*ACC:CZ3330300000001200361016*AM:23990.00*CC:CZK*RN:ONDREJ SUCHAN';
    const result = await decodeQrCode(realUserPayload);

    assert.strictEqual(result.success, true, 'Real user QR scan must succeed');
    assert.strictEqual(result.format, 'spayd', 'Format must be spayd');
    assert.strictEqual(result.drafts.length, 1, 'Should have 1 draft');

    const draft = result.drafts[0];
    assert.strictEqual(draft.iban, 'CZ3330300000001200361016');
    assert.strictEqual(draft.amount, 23990.0);
    assert.strictEqual(draft.currency, 'CZK');
    assert.strictEqual(draft.recipientName, 'ONDREJ SUCHAN');
    assert.strictEqual(draft.czechNationalAccount, '1200361016/3030', 'Must map to domestic account format');
    assert.strictEqual(draft.bic, 'AIRACZPP', 'Air Bank BIC must be auto-assigned');
    assert.strictEqual(draft.paymentType, 'STANDARD');

    // Validation check
    const validation = validatePaymentDraft(draft);
    assert.strictEqual(validation.valid, true, 'Draft must be valid');
    console.log('  ✅ 1. Reálny používateľský SPAYD QR kód (Air Bank, 23 990 CZK, Ondřej Suchan) PASS');
  }

  // =========================================================================
  // 2. ŠTANDARDNÁ SPAYD PLATBA S VS, KS, SS A SPLATNOSŤOU
  // =========================================================================
  {
    const payload = 'SPD*1.0*ACC:CZ3330300000001200361016*AM:1500.50*CC:CZK*X-VS:0020261009*X-KS:0308*X-SS:123456*MSG:Platba za sluzby*DT:20261130*';
    const result = await decodeQrCode(payload);

    assert.strictEqual(result.success, true);
    const draft = result.drafts[0];
    assert.strictEqual(draft.variableSymbol, '0020261009', 'Preserves leading zeros in VS');
    assert.strictEqual(draft.constantSymbol, '0308');
    assert.strictEqual(draft.specificSymbol, '123456');
    assert.strictEqual(draft.note, 'Platba za sluzby');
    assert.strictEqual(draft.amount, 1500.5);
    assert.ok(draft.dueDate instanceof Date);
    assert.strictEqual(draft.dueDate?.getFullYear(), 2026);
    assert.strictEqual(draft.dueDate?.getMonth(), 10); // November (0-indexed = 10)
    assert.strictEqual(draft.dueDate?.getDate(), 30);
    console.log('  ✅ 2. Štandardná SPAYD platba s VS, KS, SS a splatnosťou PASS');
  }

  // =========================================================================
  // 3. OKAMŽITÁ PLATBA (PT:IP - Instant Payment)
  // =========================================================================
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:100.00*PT:IP*RN:Rychla Platba*MSG:Okamzity prevod';
    const result = await decodeQrCode(payload);

    assert.strictEqual(result.success, true);
    const draft = result.drafts[0];
    assert.strictEqual(draft.paymentType, 'INSTANT', 'PT:IP must map to INSTANT');
    assert.strictEqual(draft.immediatePayment, true, 'immediatePayment must be true');
    assert.strictEqual(draft.currency, 'CZK', 'Currency defaults to CZK in SPAYD');
    assert.strictEqual(draft.czechNationalAccount, '1234567890/0800', 'Česká spořitelna account mapping');
    assert.strictEqual(draft.bic, 'GIBACZPX', 'Česká spořitelna BIC auto-fill');
    console.log('  ✅ 3. Okamžitá platba (PT:IP - Instant Payment) PASS');
  }

  // =========================================================================
  // 4. TRVALÝ PRÍKAZ (PT:SO) S FREKVENCIOU A DŇOM V MESIACI
  // =========================================================================
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:3500.00*PT:SO*X-PER:M1*DT:20261115*RN:Najomne';
    const result = await decodeQrCode(payload);

    assert.strictEqual(result.success, true);
    const draft = result.drafts[0];
    assert.strictEqual(draft.paymentType, 'STANDING_ORDER', 'PT:SO must map to STANDING_ORDER');
    assert.strictEqual(draft.standingOrder?.frequency, 'M1', 'Monthly frequency');
    assert.strictEqual(draft.standingOrder?.dayOfMonth, 15, '15th day of month from due date');
    console.log('  ✅ 4. Trvalý príkaz (PT:SO) s frekvenciou M1 a dňom splatnosti PASS');
  }

  // =========================================================================
  // 5. INKASO (PT:DD - Direct Debit)
  // =========================================================================
  {
    const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:650.00*PT:DD*RN:Vodafone CZ*MSG:Inkaso za pausal';
    const result = await decodeQrCode(payload);

    assert.strictEqual(result.success, true);
    const draft = result.drafts[0];
    assert.strictEqual(draft.paymentType, 'DIRECT_DEBIT', 'PT:DD must map to DIRECT_DEBIT');
    assert.strictEqual(draft.recipientName, 'Vodafone CZ');
    console.log('  ✅ 5. Súhlas s inkasom (PT:DD - Direct Debit) PASS');
  }

  // =========================================================================
  // 6. VIACNÁSOBNÉ BANKOVÉ ÚČTY (ALT-ACC)
  // =========================================================================
  {
    const payload = 'SPD*1.0*ACC:CZ3330300000001200361016*ALT-ACC:CZ5508000000001234567890,CZ2701000000000001234567*AM:1200.00*CC:CZK*RN:Kombinovany Prijemca';
    const result = await decodeQrCode(payload);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.drafts.length, 3, 'Must produce 3 alternative account drafts');

    // Account 1: Air Bank
    assert.strictEqual(result.drafts[0].iban, 'CZ3330300000001200361016');
    assert.strictEqual(result.drafts[0].czechNationalAccount, '1200361016/3030');
    assert.strictEqual(result.drafts[0].bic, 'AIRACZPP');

    // Account 2: Česká spořitelna
    assert.strictEqual(result.drafts[1].iban, 'CZ5508000000001234567890');
    assert.strictEqual(result.drafts[1].czechNationalAccount, '1234567890/0800');
    assert.strictEqual(result.drafts[1].bic, 'GIBACZPX');

    // Account 3: Komerční banka
    assert.strictEqual(result.drafts[2].iban, 'CZ2701000000000001234567');
    assert.strictEqual(result.drafts[2].czechNationalAccount, '1234567/0100');
    assert.strictEqual(result.drafts[2].bic, 'KOMBMCZP');

    assert.ok(result.warnings && result.warnings.length > 0, 'Must include warning to select account');
    console.log('  ✅ 6. Viacnásobné účty (ALT-ACC: Air Bank, ČS, KB) PASS');
  }

  // =========================================================================
  // 7. QR FAKTÚRA (X-INV, X-VAT, X-ID)
  // =========================================================================
  {
    const payload = 'SPD*1.0*ACC:CZ3330300000001200361016*AM:4999.00*CC:CZK*X-INV:2026-VF-0045*X-VAT:CZ12345678*X-ID:87654321*RN:Fakturacna Firma s.r.o.';
    const result = await decodeQrCode(payload);

    assert.strictEqual(result.success, true);
    const draft = result.drafts[0];
    assert.strictEqual(draft.invoiceNumber, '2026-VF-0045', 'Invoice number parsed');
    assert.strictEqual(draft.taxId, 'CZ12345678', 'VAT / DIČ parsed');
    assert.strictEqual(draft.businessId, '87654321', 'IČO / ID parsed');
    console.log('  ✅ 7. Rozšírenie QR Faktúra (X-INV, X-VAT, X-ID) PASS');
  }

  // =========================================================================
  // 8. ČESKÁ DIAKRITIKA A PERCENT-ENCODING
  // =========================================================================
  {
    // URL-encoded Czech diacritics
    const payload = 'SPD*1.0*ACC:CZ3330300000001200361016*RN:Dvo%C5%99%C3%A1k%20%26%20Nov%C3%A1kov%C3%A1*MSG:%C3%9Ahrada%20za%20slu%C5%BEby%20s%20DPH';
    const result = await decodeQrCode(payload);

    assert.strictEqual(result.success, true);
    const draft = result.drafts[0];
    assert.strictEqual(draft.recipientName, 'Dvořák & Nováková', 'Decodes UTF-8 URL percent encoding');
    assert.strictEqual(draft.note, 'Úhrada za služby s DPH');
    console.log('  ✅ 8. Česká diakritika a URL percent-encoding (Dvořák & Nováková, Úhrada...) PASS');
  }

  // =========================================================================
  // 9. CRC32 KONTROLNÝ SÚČET (VALIDNÝ vs MANIPULOVANÝ)
  // =========================================================================
  {
    const resultValid = await decodeQrCode('SPD*1.0*ACC:CZ5508000000001234567890*AM:500.00*CC:CZK*');
    assert.strictEqual(resultValid.success, true);

    // Manipulated CRC32 must be rejected
    const tampered = 'SPD*1.0*ACC:CZ3330300000001200361016*AM:100.00*CC:CZK*CRC32:DEADBEEF*';
    const resultTampered = await decodeQrCode(tampered);
    assert.strictEqual(resultTampered.success, false, 'Tampered CRC32 must fail');
    assert.ok(resultTampered.error?.includes('CRC32'), 'Error should specify CRC32');
    console.log('  ✅ 9. SPAYD CRC32 integrita a detekcia manipulácie PASS');
  }

  // =========================================================================
  // 10. OBOJSMERNÁ KONVERZIA ÚČTOV ČNB A MODULO 11 VALIDÁCIA
  // =========================================================================
  {
    // 10a. Air Bank account from user image
    const national1 = czechIbanToNational('CZ3330300000001200361016');
    assert.ok(national1 !== null);
    assert.strictEqual(national1.bankCode, '3030');
    assert.strictEqual(national1.accountNumber, '1200361016');
    assert.strictEqual(national1.formatted, '1200361016/3030');
    assert.strictEqual(national1.bankName, 'Air Bank');
    assert.strictEqual(national1.bic, 'AIRACZPP');

    // 10b. Convert back from national format to IBAN
    const ibanBack1 = czechNationalToIban('1200361016', '3030');
    assert.strictEqual(ibanBack1, 'CZ3330300000001200361016', 'Roundtrip back to CZ IBAN');

    // 10c. Account with prefix: 19-2000145399/0800
    const ibanWithPrefix = czechNationalToIban('2000145399', '0800', '19');
    assert.ok(ibanWithPrefix?.startsWith('CZ'));
    const convertedBack = czechIbanToNational(ibanWithPrefix!);
    assert.strictEqual(convertedBack?.formatted, '19-2000145399/0800');
    assert.strictEqual(convertedBack?.bankName, 'Česká spořitelna');

    // 10d. Modulo 11 check on user account: 1200361016 (weights: 6,3,7,9,10,5,8,4,2,1)
    // 1*6 + 2*3 + 0*7 + 0*9 + 3*10 + 6*5 + 1*8 + 0*4 + 1*2 + 6*1 = 6 + 6 + 0 + 0 + 30 + 30 + 8 + 0 + 2 + 6 = 88. 88 % 11 === 0. PERFECT!
    const isValidAcc = validateCzechDomesticAccount('1200361016', '3030');
    assert.strictEqual(isValidAcc, true, 'User account passes ČNB Modulo 11 check');

    // 10e. Invalid typo account must fail Modulo 11
    const isInvalidAcc = validateCzechDomesticAccount('1200361017', '3030');
    assert.strictEqual(isInvalidAcc, false, 'Typo account must fail Modulo 11');

    // 10f. Parsing domestic account string
    const parsed = parseCzechNationalAccount('19-2000145399 / 0800');
    assert.ok(parsed !== null);
    assert.strictEqual(parsed.prefix, '19');
    assert.strictEqual(parsed.accountNumber, '2000145399');
    assert.strictEqual(parsed.bankCode, '0800');
    assert.strictEqual(parsed.formatted, '19-2000145399/0800');

    console.log('  ✅ 10. Obojsmerná konverzia CZ IBAN <-> Národný účet a ČNB Modulo 11 PASS');
  }

  // =========================================================================
  // 11. BEZPEČNOSŤ (SECURITY & SANITIZÁCIA)
  // =========================================================================
  {
    // Phishing URL field in SPAYD must be ignored
    const maliciousPayload = 'SPD*1.0*ACC:CZ3330300000001200361016*X-URL:https://evil-phishing-bank.cz*RN:Legit<script>alert(1)</script>';
    const result = await decodeQrCode(maliciousPayload);

    assert.strictEqual(result.success, true);
    const draft = result.drafts[0];
    assert.strictEqual(draft.recipientName, 'Legitalert(1)', 'HTML tags stripped');
    // Ensure raw URL wasn't accepted as payment draft
    assert.strictEqual(draft.iban, 'CZ3330300000001200361016');
    console.log('  ✅ 11. Bezpečnosť: XSS sanitizácia a eliminácia škodlivých URL odkazov PASS');
  }

  console.log('\n🎉 [QR-CZECH-TEST] VŠETKÝCH 11 KATEGÓRIÍ ČESKÝCH QR KÓDOV ÚSPEŠNE PREŠLO NA 100%!\n');
}

// Spustenie pri priamom volaní
if (process.argv[1]?.endsWith('qr-czech-republic.test.ts')) {
  runQrCzechRepublicTest().catch((err) => {
    console.error('❌ Chyba pri teste českých QR kódov:', err);
    process.exit(1);
  });
}
