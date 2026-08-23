import { describe, it, expect } from 'vitest';
import { decodeQrCode, QrDecodingError } from '../utils/qr/decoder';
import { validatePaymentDraft } from '../utils/qr/validator';
import { normalizeAmount, normalizeDate, validateIbanChecksum } from '../utils/qr/normalizer';

describe('QR Payment Scanner — 50 Testovacích Scenárov', () => {

  // ==========================================
  // A. HAPPY PATH
  // ==========================================
  describe('A. HAPPY PATH', () => {
    it('01. Základná CZK platba — validný SPAYD, IBAN + suma + CZK', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:500.00*CC:CZK*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].iban).toBe('CZ5508000000001234567890');
      expect(result.drafts[0].amount).toBe(500.00);
      expect(result.drafts[0].currency).toBe('CZK');
    });

    it('02. Platba s VS — X-VS sa načíta bez straty núl', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:0012345678*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].variableSymbol).toBe('0012345678');
    });

    it('03. Platba s KS — X-KS sa správne zobrazí', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-KS:0308*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].constantSymbol).toBe('0308');
    });

    it('04. Platba so SS — X-SS sa správne zobrazí', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-SS:123456*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].specificSymbol).toBe('123456');
    });

    it('05. VS + KS + SS súčasne — všetky symboly namapované', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:0001234567*X-KS:0308*X-SS:987654*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].variableSymbol).toBe('0001234567');
      expect(result.drafts[0].constantSymbol).toBe('0308');
      expect(result.drafts[0].specificSymbol).toBe('987654');
    });

    it('06. Platba so správou — MSG sa správne dekóduje', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Faktura za konzultaciu*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].note).toBe('Faktura za konzultaciu');
    });

    it('07. Platba s názvom príjemcu — RN sa zobrazí ako recipientName', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RN:Jan Novak*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].recipientName).toBe('Jan Novak');
    });

    it('08. Platba s dátumom splatnosti — DT:YYYYMMDD sa správne skonvertuje', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*DT:20260915*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].dueDate).toBeInstanceOf(Date);
      expect(result.drafts[0].dueDate?.getFullYear()).toBe(2026);
      expect(result.drafts[0].dueDate?.getMonth()).toBe(8); // 0-indexed September
      expect(result.drafts[0].dueDate?.getDate()).toBe(15);
    });

    it('09. Platba bez sumy — chýbajúce AM', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RN:Alza.cz*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].amount).toBeNull();
    });

    it('10. Platba 0,01 CZK — minimálna suma sa nestratí', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:0.01*CC:CZK*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].amount).toBe(0.01);
    });

    it('11. Platba 1,00 CZK — spracovanie celého čísla', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:1.00*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].amount).toBe(1.00);
    });

    it('12. Platba 1234,56 CZK — desatinná suma presná', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:1234.56*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].amount).toBe(1234.56);
    });

    it('13. Vysoká suma — 999999.99 bez overflow', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:999999.99*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].amount).toBe(999999.99);
    });

    it('14. CZ IBAN — validný český IBAN sa akceptuje', async () => {
      const payload = 'SPD*1.0*ACC:CZ6508000000192000145399*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].iban).toBe('CZ6508000000192000145399');
    });

    it('15. IBAN s BIC v ACC — správne rozdelenie', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890+GIBACZPX*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].iban).toBe('CZ5508000000001234567890');
      expect(result.drafts[0].bic).toBe('GIBACZPX');
    });

    it('16. EUR cez SPAYD — CC:EUR sa nesmie zmeniť na CZK', async () => {
      const payload = 'SPD*1.0*ACC:SK3109000000005012345678*AM:120.00*CC:EUR*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].currency).toBe('EUR');
    });

    it('17. EPC/GiroCode EUR — SEPA QR sa rozpozná', async () => {
      const payload = 'BCD\n002\n1\nSCT\n\nJan Novak\nSK8975000000000012345678\nEUR150.00\n\n\n\n';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.format).toBe('epc-sepa');
      expect(result.drafts[0].iban).toBe('SK8975000000000012345678');
      expect(result.drafts[0].amount).toBe(150.00);
      expect(result.drafts[0].recipientName).toBe('Jan Novak');
    });

    it('18. EPC s BIC — IBAN + BIC sa správne načítajú', async () => {
      const payload = 'BCD\n002\n1\nSCT\nGIBASKSX\nJan Novak\nSK8975000000000012345678\nEUR100.00\n\n\n\n';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].bic).toBe('GIBASKSX');
    });

    it('19. EPC bez BIC — funguje bez optional BIC', async () => {
      const payload = 'BCD\n002\n1\nSCT\n\nJan Novak\nSK8975000000000012345678\nEUR100.00\n\n\n\n';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].bic).toBeNull();
    });

    it('20. EPC s payment reference', async () => {
      const payload = 'BCD\n002\n1\nSCT\n\nJan Novak\nSK8975000000000012345678\nEUR100.00\n\nRF18539007547034\n\n';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].paymentReference).toBe('RF18539007547034');
    });
  });

  // ==========================================
  // B. TEXT / ENCODING / PARSER
  // ==========================================
  describe('B. TEXT / ENCODING / PARSER', () => {
    it('21. Česká diakritika', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Příliš žluťoučký kůň úpěl ďábelské ódy*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].note).toBe('Příliš žluťoučký kůň úpěl ďábelské ódy');
    });

    it('22. Slovenská diakritika', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RN:Ľuboš Šťastný*MSG:úhrada č. 1*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].recipientName).toBe('Ľuboš Šťastný');
      expect(result.drafts[0].note).toBe('úhrada č. 1');
    });

    it('23. Unicode recipient', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*RN:Müller & Söhne GmbH*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].recipientName).toBe('Müller & Söhne GmbH');
    });

    it('24. Medzery v správe', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Viacslovna sprava pre prijemcu platby*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].note).toBe('Viacslovna sprava pre prijemcu platby');
    });

    it('25. Špeciálne znaky', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Platba #123 & / + : %*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].note).toContain('#123');
    });

    it('26. Percent-encoded obsah', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:Platba%20za%20sluzby%20s.r.o.*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].note).toBe('Platba za sluzby s.r.o.');
    });

    it('27. Maximálne dlhý MSG (140 znakov)', async () => {
      const longMsg = 'A'.repeat(140);
      const payload = `SPD*1.0*ACC:CZ5508000000001234567890*MSG:${longMsg}*`;
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].note?.length).toBe(140);
    });

    it('28. Maximálne dlhý recipient (70 znakov)', async () => {
      const longName = 'B'.repeat(70);
      const payload = `SPD*1.0*ACC:CZ5508000000001234567890*RN:${longName}*`;
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].recipientName.length).toBe(70);
    });

    it('29. VS začínajúci nulami — 0000123456', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:0000123456*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].variableSymbol).toBe('0000123456');
    });

    it('30. Maximálna dĺžka VS (10 číslic)', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:1234567890*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].variableSymbol).toBe('1234567890');
    });
  });

  // ==========================================
  // C. INVALID / SECURITY / NEGATIVE
  // ==========================================
  describe('C. INVALID / SECURITY / NEGATIVE TESTY', () => {
    it('31. Úplne neplatný QR — HELLO WORLD', async () => {
      const result = await decodeQrCode('HELLO WORLD');
      expect(result.success).toBe(false);
    });

    it('32. URL QR — odmietnuté ako bezpečnostné riziko', async () => {
      await expect(decodeQrCode('https://example.com')).rejects.toThrow(QrDecodingError);
    });

    it('33. Wi-Fi QR — nesmie vytvoriť platbu', async () => {
      const result = await decodeQrCode('WIFI:T:WPA;S:MyNet;P:Secret;;');
      expect(result.success).toBe(false);
    });

    it('34. Prázdny QR payload', async () => {
      await expect(decodeQrCode('')).rejects.toThrow(QrDecodingError);
    });

    it('35. Poškodený SPAYD header', async () => {
      const result = await decodeQrCode('SPX*1.0*ACC:CZ5508000000001234567890*');
      expect(result.success).toBe(false);
    });

    it('36. Unsupported SPAYD verzia', async () => {
      const result = await decodeQrCode('SPD*9.9*ACC:CZ5508000000001234567890*');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported SPAYD version');
    });

    it('37. Chýbajúci účet/IBAN', async () => {
      const result = await decodeQrCode('SPD*1.0*AM:100.00*CC:CZK*');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No valid IBAN/account found');
    });

    it('38. Neplatný IBAN checksum', () => {
      expect(validateIbanChecksum('SK0000000000000000000000')).toBe(false);
    });

    it('39. Neexistujúci currency code', () => {
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
      };
      const validation = validatePaymentDraft(draft);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.field === 'currency')).toBe(true);
    });

    it('40. Záporná suma', () => {
      expect(normalizeAmount('-100.00')).toBeNull();
    });

    it('41. Nečíselná suma', () => {
      expect(normalizeAmount('ABC')).toBeNull();
    });

    it('42. Príliš veľa desatinných miest — normalizácia na 2 miesta', () => {
      expect(normalizeAmount('10.999999')).toBe(11);
    });

    it('43. Neplatný VS (písmená) — orezané na číslice', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:ABC123DEF*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].variableSymbol).toBe('123');
    });

    it('44. VS dlhší než limit (10 číslic) — orezané na 10', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*X-VS:123456789012345*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].variableSymbol).toBe('1234567890');
    });

    it('45. Neplatný dátum — graceful fallback', () => {
      expect(normalizeDate('20261345')).toBeNull();
    });

    it('46. Duplicate fields — deterministické spracovanie', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*AM:100.00*AM:200.00*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].amount).toBe(100.00);
    });

    it('47. Spracovanie PAY by square a EPC checksum integrity', () => {
      expect(validateIbanChecksum('SK6609000000005012345678')).toBe(true);
    });

    it('48. Extrémne dlhý payload — PAYLOAD_TOO_LARGE', async () => {
      const hugePayload = 'SPD*1.0*' + 'A'.repeat(2500);
      await expect(decodeQrCode(hugePayload)).rejects.toThrow(/too large/i);
    });

    it('49. Injection payload — XSS sanitization', async () => {
      const payload = 'SPD*1.0*ACC:CZ5508000000001234567890*MSG:<script>alert(1)</script>Platba*';
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].note).not.toContain('<script>');
      expect(result.drafts[0].note).toBe('alert(1)Platba');
    });

    it('50. SQL-like payload — text zostane iba textom', async () => {
      const payload = "SPD*1.0*ACC:CZ5508000000001234567890*MSG:' OR 1=1 -- *";
      const result = await decodeQrCode(payload);
      expect(result.success).toBe(true);
      expect(result.drafts[0].note).toBe("' OR 1=1 --");
    });
  });

  // ==========================================
  // D. INTEGRATION & 5-FIELD MAPPING
  // ==========================================
  describe('D. QR → FORM 5-FIELD MAPPING VERIFICATION', () => {
    it('PAY by square → 5 polí naraz (Meno, IBAN, Suma, VS, Poznámka)', async () => {
      const pbs = 'Ver=1.2;Typ=PAY;Name=Miroslav Polacek;UC=SK6609000000005012345678;Mena=EUR;Sum=125.50;VS=0000123456;Popis=Uhrada faktury 2026';
      const result = await decodeQrCode(pbs);
      expect(result.success).toBe(true);
      const draft = result.drafts[0];

      // Assert 5 key fields
      expect(draft.recipientName).toBe('Miroslav Polacek');
      expect(draft.iban).toBe('SK6609000000005012345678');
      expect(draft.amount).toBe(125.50);
      expect(draft.variableSymbol).toBe('0000123456');
      expect(draft.note).toBe('Uhrada faktury 2026');
    });

    it('SPAYD → 5 polí naraz (Meno, IBAN, Suma, VS, Poznámka)', async () => {
      const spayd = 'SPD*1.0*ACC:SK6609000000005012345678*AM:1234.56*CC:EUR*RN:Peter Ziak*X-VS:0098765432*MSG:Platba za material 1234*';
      const result = await decodeQrCode(spayd);
      expect(result.success).toBe(true);
      const draft = result.drafts[0];

      expect(draft.recipientName).toBe('Peter Ziak');
      expect(draft.iban).toBe('SK6609000000005012345678');
      expect(draft.amount).toBe(1234.56);
      expect(draft.variableSymbol).toBe('0098765432');
      expect(draft.note).toBe('Platba za material 1234');
    });
  });
});
