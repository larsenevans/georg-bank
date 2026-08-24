import {
  PaymentDraft,
  QrDecodingResult,
  QrErrorType,
  QrDecodingError,
} from '../../types/payment';

export { QrDecodingError };
import {
  normalizeIban,
  normalizeBic,
  normalizeCurrency,
  normalizeAmount,
  normalizeText,
  normalizeDate,
  isUrl,
} from './normalizer';

/**
 * Maximum allowed QR payload size in bytes
 */
const MAX_QR_PAYLOAD_SIZE = 2048; // 2KB

/**
 * Decodes a QR code string into a PaymentDraft
 * 
 * @param qrData - The raw QR code data string
 * @returns Promise resolving to QrDecodingResult
 */
export async function decodeQrCode(qrData: string): Promise<QrDecodingResult> {
  try {
    // Security checks
    if (!qrData || typeof qrData !== 'string') {
      throw new QrDecodingError(
        'Invalid QR data: empty or not a string',
        'INVALID_QR_FORMAT'
      );
    }

    // Check payload size
    if (qrData.length > MAX_QR_PAYLOAD_SIZE) {
      throw new QrDecodingError(
        `QR payload too large: ${qrData.length} bytes (max ${MAX_QR_PAYLOAD_SIZE})`,
        'PAYLOAD_TOO_LARGE'
      );
    }

    // Security: Never open QR content as URL
    if (isUrl(qrData)) {
      throw new QrDecodingError(
        'QR content appears to be a URL, which is not allowed for security reasons',
        'SECURITY_VIOLATION'
      );
    }

    // Try PAY by square format first (Slovak standard)
    const payBySquareResult = tryDecodePayBySquare(qrData);
    if (payBySquareResult.format === 'pay-by-square') {
      return payBySquareResult;
    }

    // Try SPAYD format (Czech standard: SPD*1.0*...)
    const spaydResult = tryDecodeSpayd(qrData);
    if (spaydResult.format === 'spayd') {
      return spaydResult;
    }

    // Try EPC/SEPA QR format
    const epcResult = tryDecodeEpcSepa(qrData);
    if (epcResult.format === 'epc-sepa') {
      return epcResult;
    }

    // If neither format matched, return unknown
    return {
      success: false,
      format: null,
      drafts: [],
      error: 'Unknown QR code format',
    };
  } catch (error) {
    if (error instanceof QrDecodingError) {
      throw error;
    }
    throw new QrDecodingError(
      `Failed to decode QR code: ${error instanceof Error ? error.message : String(error)}`,
      'MALFORMED_DATA'
    );
  }
}

/**
 * Attempts to decode a PAY by square QR code
 * 
 * PAY by square 1.2 specification:
 * https://portal.bysquare.com/files/bysquare-PAYspecifications-1.2.0.pdf
 * 
 * Format: Key=Value pairs separated by semicolons
 * Example: Ver=1.2;Typ=PAY;ID=123456789;Nazov=John Doe;UC=1234567890;Kod=0800;Mena=EUR;Sum=100.00
 * 
 * @param qrData - The QR code data
 * @returns QrDecodingResult
 */
function tryDecodePayBySquare(qrData: string): QrDecodingResult {
  try {
    // PAY by square uses semicolon-separated key=value pairs
    if (!qrData.includes(';') || !qrData.includes('=')) {
      return { success: false, format: null, drafts: [] };
    }

    // Parse key-value pairs
    const pairs: Record<string, string> = {};
    const parts = qrData.split(';');
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value !== undefined) {
        pairs[key.trim()] = value.trim();
      }
    }

    // Check for PAY by square identifier
    if (pairs['Typ']?.toUpperCase() !== 'PAY' && pairs['Typ']?.toUpperCase() !== 'PAYMENT') {
      return { success: false, format: null, drafts: [] };
    }

    // Validate version
    const version = pairs['Ver'] || pairs['Version'];
    if (version && !version.startsWith('1.')) {
      return {
        success: false,
        format: null,
        drafts: [],
        error: `Unsupported PAY by square version: ${version}`,
      };
    }

    // Extract payment information
    const drafts: PaymentDraft[] = [];
    
    // Handle multiple accounts (separated by | or multiple entries)
    const accountEntries = getPayBySquareAccounts(pairs);
    
    if (accountEntries.length === 0) {
      return {
        success: false,
        format: null,
        drafts: [],
        error: 'No valid account information found in PAY by square QR',
      };
    }

    // Create a draft for each account option
    for (const account of accountEntries) {
      const draft: PaymentDraft = {
        qrFormat: 'pay-by-square',
        recipientName: normalizeText(pairs['Nazov'] || pairs['Name'] || pairs['Meno'] || pairs['BeneficiaryName'] || '') || '',
        iban: normalizeIban(account.iban, { ...DEFAULT_NORMALIZE_IBAN_OPTIONS, validateChecksum: false }) || '',
        bic: normalizeBic(account.bic || pairs['Kod'] || pairs['BIC'] || null),
        amount: normalizeAmount(pairs['Sum'] || pairs['Summa'] || pairs['Amount'] || null),
        currency: normalizeCurrency(pairs['Mena'] || pairs['Currency'] || pairs['CurrencyCode'] || null) || 'EUR',
        variableSymbol: normalizeText(pairs['VS'] || pairs['VarSym'] || pairs['VariableSymbol'] || null, 10),
        constantSymbol: normalizeText(pairs['KS'] || pairs['KonstSym'] || pairs['ConstantSymbol'] || null, 10),
        specificSymbol: normalizeText(pairs['SS'] || pairs['SpecSym'] || pairs['SpecificSymbol'] || null, 10),
        note: normalizeText(pairs['Popis'] || pairs['Message'] || pairs['Pozn'] || pairs['PaymentNote'] || null),
        paymentReference: normalizeText(pairs['Ref'] || pairs['Reference'] || pairs['PaymentReference'] || null),
        dueDate: normalizeDate(pairs['Datum'] || pairs['Date'] || pairs['Splatnost'] || pairs['DueDate'] || null),
        rawQrData: qrData,
      };

      // Validate IBAN
      if (!draft.iban || !isValidIbanFormat(draft.iban)) {
        continue; // Skip invalid accounts
      }

      // Add to drafts
      drafts.push(draft);
    }

    if (drafts.length === 0) {
      return {
        success: false,
        format: 'pay-by-square',
        drafts: [],
        error: 'No valid accounts found in PAY by square QR',
      };
    }

    return {
      success: true,
      format: 'pay-by-square',
      drafts,
      warnings: drafts.length > 1 ? ['Multiple payment options found, user must select one'] : [],
    };
  } catch (error) {
    return {
      success: false,
      format: null,
      drafts: [],
      error: `PAY by square decoding failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Extracts account information from PAY by square data
 * Handles multiple accounts separated by |
 */
function getPayBySquareAccounts(pairs: Record<string, string>): Array<{ iban: string; bic?: string }> {
  const accounts: Array<{ iban: string; bic?: string }> = [];
  
  // Check for UC (account number) and Kod (BIC)
  const uc = pairs['UC'] || pairs['Ucet'] || pairs['Account'];
  const kod = pairs['Kod'] || pairs['BIC'] || pairs['SWIFT'];
  
  if (uc) {
    // Handle multiple accounts separated by |
    const ucParts = uc.split('|');
    const kodParts = kod ? kod.split('|') : [kod || ''];
    
    for (let i = 0; i < ucParts.length; i++) {
      const iban = ucParts[i];
      const bic = i < kodParts.length ? kodParts[i] : kodParts[0];
      
      if (iban && iban.trim()) {
        accounts.push({ iban: iban.trim(), bic: bic?.trim() });
      }
    }
  }
  
  // If no accounts found, try IBAN directly
  if (accounts.length === 0) {
    const iban = pairs['IBAN'] || pairs['Iban'];
    if (iban) {
      accounts.push({ iban: iban.trim(), bic: kod?.trim() });
    }
  }
  
  return accounts;
}

/**
 * Attempts to decode an EPC/SEPA QR code
 * 
 * EPC/SEPA QR v3.1 specification:
 * https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
 * 
 * Format: BCD (Binary Coded Decimal) with service tags
 * Service tags:
 * - 01: Account information (IBAN + BIC + name)
 * - 53: Remittance information (structured)
 * - 54: Remittance information (unstructured)
 * - 60: Amount
 * - 61: Transaction reference
 * - 62: Additional information (due date, etc.)
 * - 63: Additional information
 * 
 * @param qrData - The QR code data
 * @returns QrDecodingResult
 */
function tryDecodeEpcSepa(qrData: string): QrDecodingResult {
  try {
    const trimmed = qrData.trim();
    const isStandardEpc = trimmed.startsWith('BCD\n') || trimmed.startsWith('BCD\r\n') || trimmed === 'BCD' || /^BCD(?:\r?\n|$)/i.test(trimmed);
    
    if (!isStandardEpc) {
      return { success: false, format: null, drafts: [] };
    }

    const draft: PaymentDraft = {
      qrFormat: 'epc-sepa',
      recipientName: '',
      iban: '',
      bic: null,
      amount: null,
      currency: 'EUR',
      variableSymbol: null,
      constantSymbol: null,
      specificSymbol: null,
      note: null,
      paymentReference: null,
      dueDate: null,
      rawQrData: qrData,
    };

    // If standard line-separated EPC format:
    // Line 0: BCD
    // Line 1: Version (e.g. 001, 002)
    // Line 2: Character set (e.g. 1, 2)
    // Line 3: Identification / Service (SCT)
    // Line 4: BIC (optional)
    // Line 5: Beneficiary Name
    // Line 6: IBAN
    // Line 7: Amount (e.g. EUR100.00 or 100.00)
    // Line 8: Purpose code (optional)
    // Line 9: Structured Reference (RF... or SCOR)
    // Line 10: Unstructured Remittance text / note
    // Line 11: Beneficiary to originator information (optional)
    const lines = qrData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    if (lines[0]?.trim() === 'BCD' && lines.length >= 7) {
      const bic = lines[4]?.trim() || '';
      const name = lines[5]?.trim() || '';
      const iban = lines[6]?.replace(/\s+/g, '').toUpperCase() || '';
      const rawAmt = lines[7]?.trim() || '';
      const ref = lines[9]?.trim() || '';
      const note = lines[10]?.trim() || '';

      if (bic) draft.bic = normalizeBic(bic);
      if (name) draft.recipientName = normalizeText(name, 70) || '';
      if (iban) draft.iban = normalizeIban(iban, { ...DEFAULT_NORMALIZE_IBAN_OPTIONS, validateChecksum: false }) || iban;

      if (rawAmt) {
        const amtMatch = rawAmt.match(/(?:EUR)?([0-9]+(?:[.,][0-9]{1,2})?)/i);
        if (amtMatch) {
          draft.amount = normalizeAmount(amtMatch[1]);
        }
      }

      if (ref) {
        draft.paymentReference = normalizeText(ref, 35);
      }
      if (note) {
        draft.note = normalizeText(note, 140);
      }
    } else {
      // Regex fallback for non-standard or partial BCD payloads
      const ibanMatch = qrData.match(/([A-Z]{2})([0-9]{2})([A-Z0-9]{11,34})/i);
      if (ibanMatch) {
        const fullIban = ibanMatch[1] + ibanMatch[2] + ibanMatch[3];
        draft.iban = normalizeIban(fullIban, { ...DEFAULT_NORMALIZE_IBAN_OPTIONS, validateChecksum: false }) || '';
      }

      const bicMatch = qrData.match(/([A-Z0-9]{8,11})/i);
      if (bicMatch && isValidBicPosition(qrData, bicMatch.index || 0)) {
        draft.bic = normalizeBic(bicMatch[1]) || null;
      }

      const currencyAmountMatch = qrData.match(/(EUR)(\d+[.,]?\d{0,2})/i);
      if (currencyAmountMatch) {
        draft.amount = normalizeAmount(currencyAmountMatch[2]);
      } else {
        const simpleAmountMatch = qrData.match(/(\d+[.,]?\d{0,2})/);
        if (simpleAmountMatch) {
          draft.amount = normalizeAmount(simpleAmountMatch[1]);
        }
      }

      const nameMatch = qrData.match(/[A-Z]{2,}\s+[A-Z\s]+/i);
      if (nameMatch) {
        draft.recipientName = normalizeText(nameMatch[0], 70) || '';
      }

      const refMatch = qrData.match(/(RF[0-9]{2})[A-Z0-9]{1,35}/i);
      if (refMatch) {
        draft.paymentReference = normalizeText(refMatch[0], 35) || null;
      }

      const remittanceMatch = qrData.match(/5[34]\d{2}([^\n]{0,140})/);
      if (remittanceMatch) {
        draft.note = normalizeText(remittanceMatch[1], 140) || null;
      }
    }

    if (!draft.iban || !isValidIbanFormat(draft.iban)) {
      return {
        success: false,
        format: 'epc-sepa',
        drafts: [],
        error: 'No valid IBAN found in EPC/SEPA QR',
      };
    }

    return {
      success: true,
      format: 'epc-sepa',
      drafts: [draft],
    };
  } catch (error) {
    return {
      success: false,
      format: null,
      drafts: [],
      error: `EPC/SEPA decoding failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** SPAYD field length limits per qr-platba.cz spec */
const SPAYD_MAX_RN = 35;
const SPAYD_MAX_MSG = 60;
const SPAYD_MAX_RF = 16;

interface SpaydRawPair {
  key: string;
  rawValue: string;
}

/**
 * Safely URL-decode a SPAYD attribute value (%20, %2A, UTF-8, …)
 */
function decodeSpaydValue(rawValue: string): string {
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

/**
 * Parse SPAYD segments into key/rawValue pairs (first occurrence wins)
 */
function parseSpaydRawPairs(trimmed: string): SpaydRawPair[] {
  const segments = trimmed.split('*');
  const pairs: SpaydRawPair[] = [];
  const seen = new Set<string>();

  for (let i = 2; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const colonIdx = seg.indexOf(':');
    if (colonIdx === -1) continue;
    const key = seg.substring(0, colonIdx).trim().toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ key, rawValue: seg.substring(colonIdx + 1) });
  }

  return pairs;
}

/**
 * Build decoded SPAYD pairs map, ignoring URL-only fields (X-URL, URL)
 */
function buildSpaydPairs(rawPairs: SpaydRawPair[]): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const { key, rawValue } of rawPairs) {
    if (key === 'X-URL' || key === 'URL') continue;
    pairs[key] = decodeSpaydValue(rawValue);
  }
  return pairs;
}

/**
 * CRC-32 (IEEE / Ethernet polynomial) for SPAYD CRC32 attribute validation
 */
function computeCrc32(input: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i);
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build canonical SPAYD string for CRC32 verification (qr-platba.cz spec)
 */
function buildSpaydCrcBase(rawPairs: SpaydRawPair[]): string {
  const sorted = [...rawPairs]
    .filter((p) => p.key !== 'CRC32')
    .sort((a, b) => a.key.localeCompare(b.key) || a.rawValue.localeCompare(b.rawValue));

  let base = 'SPD*1.0*';
  for (const { key, rawValue } of sorted) {
    base += `${key}:${rawValue}*`;
  }
  return base;
}

function verifySpaydCrc32(rawPairs: SpaydRawPair[]): string | null {
  const crcPair = rawPairs.find((p) => p.key === 'CRC32');
  if (!crcPair) return null;

  const expected = crcPair.rawValue.trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(expected)) {
    return 'Invalid SPAYD CRC32 format';
  }

  const computed = computeCrc32(buildSpaydCrcBase(rawPairs)).toString(16).toUpperCase().padStart(8, '0');
  if (computed !== expected) {
    return 'SPAYD CRC32 checksum mismatch';
  }
  return null;
}

/**
 * Parse ACC / ALT-ACC account value: IBAN or IBAN+BIC
 */
function parseSpaydAccount(rawAcc: string): { iban: string; bic: string | null } | null {
  const accVal = decodeSpaydValue(rawAcc).trim();
  const parts = accVal.split('+');
  const iban = parts[0]?.replace(/\s+/g, '').toUpperCase() || '';
  if (!iban || !isValidIbanFormat(iban)) return null;
  const bic = parts[1] ? normalizeBic(parts[1]) : null;
  return { iban, bic };
}

/**
 * Collect all accounts from ACC (primary) and ALT-ACC (alternatives)
 */
function collectSpaydAccounts(rawPairs: SpaydRawPair[]): Array<{ iban: string; bic: string | null }> {
  const accounts: Array<{ iban: string; bic: string | null }> = [];
  const seenIbans = new Set<string>();

  const addAccount = (rawAcc: string) => {
    const parsed = parseSpaydAccount(rawAcc);
    if (!parsed || seenIbans.has(parsed.iban)) return;
    seenIbans.add(parsed.iban);
    accounts.push(parsed);
  };

  const accPair = rawPairs.find((p) => p.key === 'ACC');
  if (accPair) addAccount(accPair.rawValue);

  const altPair = rawPairs.find((p) => p.key === 'ALT-ACC');
  if (altPair) {
    const decoded = decodeSpaydValue(altPair.rawValue);
    for (const part of decoded.split(',')) {
      if (part.trim()) addAccount(part);
    }
  }

  return accounts;
}

function normalizeSpaydSymbol(value: string | undefined, maxLen = 10): string | null {
  if (value === undefined) return null;
  const digits = value.replace(/\D/g, '').substring(0, maxLen);
  return digits || null;
}

/**
 * Attempts to decode a SPAYD (Short Payment Descriptor) QR code
 * Czech banking standard (SPD*1.0*...)
 *
 * Spec: https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 */
function tryDecodeSpayd(qrData: string): QrDecodingResult {
  try {
    const trimmed = qrData.trim();
    if (!trimmed.startsWith('SPD*')) {
      return { success: false, format: null, drafts: [] };
    }

    const segments = trimmed.split('*');
    if (segments.length < 2) {
      return { success: false, format: null, drafts: [] };
    }

    const version = segments[1];
    if (version !== '1.0') {
      return {
        success: false,
        format: 'spayd',
        drafts: [],
        error: `Unsupported SPAYD version: ${version}`,
      };
    }

    const rawPairs = parseSpaydRawPairs(trimmed);
    const crcError = verifySpaydCrc32(rawPairs);
    if (crcError) {
      return {
        success: false,
        format: 'spayd',
        drafts: [],
        error: crcError,
      };
    }

    const pairs = buildSpaydPairs(rawPairs);
    const accounts = collectSpaydAccounts(rawPairs);

    if (accounts.length === 0) {
      // Legacy fallback keys
      let fallbackIban = pairs['IBAN']?.replace(/\s+/g, '').toUpperCase() || '';
      const fallbackBic = pairs['BIC'] ? normalizeBic(pairs['BIC']) : null;
      if (fallbackIban && isValidIbanFormat(fallbackIban)) {
        accounts.push({ iban: fallbackIban, bic: fallbackBic });
      }
    }

    if (accounts.length === 0) {
      return {
        success: false,
        format: 'spayd',
        drafts: [],
        error: 'No valid IBAN/account found in SPAYD QR',
      };
    }

    const amount = pairs['AM'] !== undefined ? normalizeAmount(pairs['AM']) : null;
    const currency = pairs['CC'] ? normalizeCurrency(pairs['CC']) || pairs['CC'].toUpperCase() : 'CZK';

    let variableSymbol =
      normalizeSpaydSymbol(pairs['X-VS']) ??
      normalizeSpaydSymbol(pairs['VS']);

    const constantSymbol =
      normalizeSpaydSymbol(pairs['X-KS']) ??
      normalizeSpaydSymbol(pairs['KS']);

    const specificSymbol =
      normalizeSpaydSymbol(pairs['X-SS']) ??
      normalizeSpaydSymbol(pairs['SS']);

    const rfValue = pairs['RF']?.replace(/\D/g, '').substring(0, SPAYD_MAX_RF) || null;
    const paymentReference = rfValue;

    // RF → VS when no explicit variable symbol (CZ domestic prefill)
    if (!variableSymbol && rfValue) {
      variableSymbol = rfValue.substring(0, 10) || null;
    }

    const recipientName = normalizeText(pairs['RN'] || pairs['NAME'] || '', SPAYD_MAX_RN) || '';
    const note = normalizeText(pairs['MSG'] || pairs['NOTE'] || null, SPAYD_MAX_MSG);
    const dueDate = pairs['DT'] ? normalizeDate(pairs['DT']) : null;
    const immediatePayment = pairs['PT']?.trim().toUpperCase() === 'IP';

    const sharedFields = {
      qrFormat: 'spayd' as const,
      recipientName,
      amount,
      currency,
      variableSymbol,
      constantSymbol,
      specificSymbol,
      note,
      paymentReference,
      dueDate,
      immediatePayment,
      rawQrData: qrData,
    };

    const drafts: PaymentDraft[] = [];
    for (const account of accounts) {
      drafts.push({
        ...sharedFields,
        iban: normalizeIban(account.iban, { ...DEFAULT_NORMALIZE_IBAN_OPTIONS, validateChecksum: false }) || account.iban,
        bic: account.bic,
      });
    }

    return {
      success: true,
      format: 'spayd',
      drafts,
      warnings:
        drafts.length > 1 ? ['Multiple payment account options found, user must select one'] : undefined,
    };
  } catch (error) {
    return {
      success: false,
      format: null,
      drafts: [],
      error: `SPAYD decoding failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Checks if BIC is in a valid position within the QR data
 * (Not part of the IBAN or another field)
 */
function isValidBicPosition(qrData: string, bicIndex: number): boolean {
  if (bicIndex > 0 && bicIndex < 4) {
    return false;
  }
  return true;
}

/**
 * Helper to check if IBAN format is valid
 */
function isValidIbanFormat(iban: string): boolean {
  if (!iban || typeof iban !== 'string') {
    return false;
  }
  const normalized = iban.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(normalized) && normalized.length >= 4;
}

// Default options for normalization
const DEFAULT_NORMALIZE_IBAN_OPTIONS = {
  removeSpaces: true,
  toUpperCase: true,
  validateChecksum: false, // Don't fail on checksum during initial decode
};
