/**
 * Czech National Bank Account Utilities (ČNB Standard)
 *
 * Implements:
 * 1. Modulo 11 weighted checksum validation for Czech domestic bank accounts
 * 2. Bidirectional conversion: Czech IBAN <-> National account format ([prefix-]account/bankCode)
 * 3. Mapping of Czech bank codes to BIC and bank names
 */

/** Known Czech Bank Codes to Bank Name and SWIFT/BIC */
export const CZECH_BANKS: Record<string, { name: string; bic: string }> = {
  '0100': { name: 'Komerční banka', bic: 'KOMBMCZP' },
  '0300': { name: 'Československá obchodní banka (ČSOB)', bic: 'CEKOCZPP' },
  '0600': { name: 'MONETA Money Bank', bic: 'AGBACZPP' },
  '0710': { name: 'ČESKÁ NÁRODNÍ BANKA (ČNB)', bic: 'CNBACZPP' },
  '0800': { name: 'Česká spořitelna', bic: 'GIBACZPX' },
  '2010': { name: 'Fio banka', bic: 'FIOBCZPP' },
  '2060': { name: 'Citifinfin', bic: 'CITICZPX' },
  '2070': { name: 'Moravský Peněžní Ústav', bic: 'MPUBCZPP' },
  '2100': { name: 'Hypoteční banka', bic: 'HYPOCZPP' },
  '2200': { name: 'Peněžní dům, spořitelní družstvo', bic: 'PDUMCZPP' },
  '2220': { name: 'Artesa, spořitelní družstvo', bic: 'ARTECZPP' },
  '2250': { name: 'Banka CREDITAS', bic: 'CREDACZ2' },
  '2600': { name: 'Citibank Europe', bic: 'CITICZPX' },
  '2700': { name: 'UniCredit Bank Czech Republic and Slovakia', bic: 'BACXCZPP' },
  '3030': { name: 'Air Bank', bic: 'AIRACZPP' },
  '3050': { name: 'BNP Paribas Personal Finance (Hello bank!)', bic: 'BNPACZPP' },
  '3060': { name: 'PKO BP S.A., pobočka Česká republika', bic: 'BPKOCZ22' },
  '3500': { name: 'ING Bank N.V.', bic: 'INGBCZPP' },
  '4000': { name: 'Expobank CZ (Max banka)', bic: 'EXPNCZPP' },
  '4300': { name: 'Národní rozvojová banka', bic: 'CMZRCZPP' },
  '5500': { name: 'Raiffeisenbank', bic: 'RZBCCZPP' },
  '5800': { name: 'J&T BANKA', bic: 'JTACZPP' },
  '6000': { name: 'PPF banka', bic: 'PMBCCZPP' },
  '6200': { name: 'COMMERZBANK Aktiengesellschaft', bic: 'COBACZPX' },
  '6210': { name: 'mBank S.A.', bic: 'BREXCZ22' },
  '6300': { name: 'BNP Paribas Fortis', bic: 'GEBACZPP' },
  '6700': { name: 'Všeobecná úverová banka (VÚB)', bic: 'SUBAČZPP' },
  '6800': { name: 'Sberbank CZ (v likvidaci)', bic: 'POBNCZ2X' },
  '7910': { name: 'Deutsche Bank A.G.', bic: 'DEUTCZPX' },
  '8030': { name: 'Raiffeisen stavební spořitelna', bic: 'RZBCCZPP' },
  '8040': { name: 'Českomoravská stavební spořitelna', bic: 'CEKOCZPP' },
  '8060': { name: 'Stavební spořitelna České spořitelny', bic: 'GIBACZPX' },
  '8090': { name: 'Modrá pyramida stavební spořitelna', bic: 'KOMBMCZP' },
  '8150': { name: 'HSBC Continental Europe', bic: 'MIDLCZPP' },
};

/** Weights for account prefix (up to 6 digits) */
const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];

/** Weights for main account number (up to 10 digits) */
const ACCOUNT_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

/**
 * Calculates modulo 11 with custom weights according to Czech National Bank decree
 */
function checkWeightedMod11(digitsStr: string, weights: number[]): boolean {
  if (!digitsStr || digitsStr.length === 0) return true;
  // Pad with leading zeros to match weights array length
  const padded = digitsStr.padStart(weights.length, '0');
  if (padded.length > weights.length) return false;

  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    const digit = parseInt(padded[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * weights[i];
  }

  return sum % 11 === 0;
}

/**
 * Validates Czech domestic account number components (ČNB Modulo 11)
 *
 * @param accountNumber - Main account number (up to 10 digits)
 * @param bankCode - 4-digit bank code
 * @param prefix - Optional prefix (up to 6 digits)
 */
export function validateCzechDomesticAccount(
  accountNumber: string,
  bankCode: string,
  prefix?: string | null
): boolean {
  // Validate bank code
  const cleanBank = (bankCode || '').trim();
  if (!/^\d{4}$/.test(cleanBank)) return false;

  // Validate main account number
  const cleanAccount = (accountNumber || '').trim();
  if (!/^\d{1,10}$/.test(cleanAccount) || cleanAccount === '0') return false;
  if (!checkWeightedMod11(cleanAccount, ACCOUNT_WEIGHTS)) return false;

  // Validate prefix if present
  const cleanPrefix = (prefix || '').trim();
  if (cleanPrefix) {
    if (!/^\d{1,6}$/.test(cleanPrefix) || cleanPrefix === '0') return false;
    if (!checkWeightedMod11(cleanPrefix, PREFIX_WEIGHTS)) return false;
  }

  return true;
}

/**
 * Parse a Czech national account string into components
 * Supports formats:
 * - "1200361016/3030"
 * - "19-2000145399/0800"
 * - "1200361016 / 3030"
 */
export function parseCzechNationalAccount(accountStr: string): {
  prefix: string;
  accountNumber: string;
  bankCode: string;
  formatted: string;
} | null {
  if (!accountStr || typeof accountStr !== 'string') return null;

  const trimmed = accountStr.trim().replace(/\s+/g, '');
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx === -1) return null;

  const leftPart = trimmed.substring(0, slashIdx);
  const bankCode = trimmed.substring(slashIdx + 1);

  if (!/^\d{4}$/.test(bankCode)) return null;

  let prefix = '';
  let accountNumber = '';

  const dashIdx = leftPart.indexOf('-');
  if (dashIdx !== -1) {
    prefix = leftPart.substring(0, dashIdx);
    accountNumber = leftPart.substring(dashIdx + 1);
  } else {
    accountNumber = leftPart;
  }

  if (!/^\d{1,10}$/.test(accountNumber)) return null;
  if (prefix && !/^\d{1,6}$/.test(prefix)) return null;

  const formatted = prefix ? `${prefix}-${accountNumber}/${bankCode}` : `${accountNumber}/${bankCode}`;

  return {
    prefix,
    accountNumber,
    bankCode,
    formatted,
  };
}

/**
 * Converts a Czech IBAN into the national format ([prefix-]accountNumber/bankCode)
 *
 * Czech IBAN format (24 characters):
 * CZkk bbbb pppppp cccccccccc
 * CZ (2) + kk (2) + bank (4) + prefix (6) + account (10)
 */
export function czechIbanToNational(iban: string): {
  prefix: string;
  accountNumber: string;
  bankCode: string;
  formatted: string;
  bankName?: string;
  bic?: string;
} | null {
  if (!iban || typeof iban !== 'string') return null;
  const cleanIban = iban.replace(/\s+/g, '').toUpperCase();

  if (!cleanIban.startsWith('CZ') || cleanIban.length !== 24) {
    return null;
  }

  const bankCode = cleanIban.substring(4, 8);
  const rawPrefix = cleanIban.substring(8, 14);
  const rawAccount = cleanIban.substring(14, 24);

  // Remove leading zeros for domestic display
  const prefix = rawPrefix.replace(/^0+/, '');
  const accountNumber = rawAccount.replace(/^0+/, '');

  if (!accountNumber) return null;

  const formatted = prefix ? `${prefix}-${accountNumber}/${bankCode}` : `${accountNumber}/${bankCode}`;
  const bankInfo = CZECH_BANKS[bankCode];

  return {
    prefix,
    accountNumber,
    bankCode,
    formatted,
    bankName: bankInfo?.name,
    bic: bankInfo?.bic,
  };
}

/**
 * Mod-97 checksum calculation for BigInt string
 */
function mod97(numericString: string): number {
  let remainder = 0;
  for (let i = 0; i < numericString.length; i += 7) {
    const chunk = remainder.toString() + numericString.substring(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  return remainder;
}

/**
 * Converts Czech national account number into standard Czech IBAN
 *
 * @param accountNumber - Main account number (up to 10 digits)
 * @param bankCode - 4-digit bank code
 * @param prefix - Optional prefix (up to 6 digits)
 */
export function czechNationalToIban(
  accountNumber: string,
  bankCode: string,
  prefix: string = ''
): string | null {
  const cleanBank = (bankCode || '').trim();
  const cleanAccount = (accountNumber || '').trim();
  const cleanPrefix = (prefix || '').trim();

  if (!/^\d{4}$/.test(cleanBank)) return null;
  if (!/^\d{1,10}$/.test(cleanAccount)) return null;
  if (cleanPrefix && !/^\d{1,6}$/.test(cleanPrefix)) return null;

  // Format to BBAN components with leading zeros
  const paddedPrefix = cleanPrefix.padStart(6, '0');
  const paddedAccount = cleanAccount.padStart(10, '0');
  const bban = `${cleanBank}${paddedPrefix}${paddedAccount}`;

  // For Czech Republic: CZ -> C=12, Z=35. Appended: 123500
  // IBAN checksum: 98 - ( (BBAN * 1000000 + 123500) mod 97 )
  const checkString = `${bban}123500`;
  const remainder = mod97(checkString);
  const checkDigits = (98 - remainder).toString().padStart(2, '0');

  return `CZ${checkDigits}${bban}`;
}
