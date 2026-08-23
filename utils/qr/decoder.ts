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

/**
 * Attempts to decode a SPAYD (Short Payment Descriptor) QR code
 * Czech banking standard (SPD*1.0*...)
 * 
 * Spec:
 * SPD*1.0*ACC:CZ5508000000001234567890*AM:500.00*CC:CZK*RN:Jan Novak*X-VS:0012345678*MSG:Poznamka*
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

    // Version check (segments[1])
    const version = segments[1];
    if (version !== '1.0') {
      return {
        success: false,
        format: 'spayd',
        drafts: [],
        error: `Unsupported SPAYD version: ${version}`,
      };
    }

    const pairs: Record<string, string> = {};
    for (let i = 2; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      const colonIdx = seg.indexOf(':');
      if (colonIdx === -1) continue;
      const key = seg.substring(0, colonIdx).trim().toUpperCase();
      let rawVal = seg.substring(colonIdx + 1);
      // Safe percent decoding
      try {
        rawVal = decodeURIComponent(rawVal);
      } catch {
        // Keep as is if decodeURIComponent fails
      }
      // First occurrence wins or deterministic assignment
      if (!pairs[key]) {
        pairs[key] = rawVal;
      }
    }

    let iban = '';
    let bic: string | null = null;

    if (pairs['ACC']) {
      // ACC format: IBAN or IBAN+BIC or prefix-number/bank
      const accVal = pairs['ACC'].trim();
      const parts = accVal.split('+');
      iban = parts[0]?.replace(/\s+/g, '').toUpperCase() || '';
      if (parts[1]) {
        bic = normalizeBic(parts[1]);
      }
    }

    if (!iban && pairs['IBAN']) {
      iban = pairs['IBAN'].replace(/\s+/g, '').toUpperCase();
    }

    if (!bic && pairs['BIC']) {
      bic = normalizeBic(pairs['BIC']);
    }

    if (!iban || !isValidIbanFormat(iban)) {
      return {
        success: false,
        format: 'spayd',
        drafts: [],
        error: 'No valid IBAN/account found in SPAYD QR',
      };
    }

    // Parse amount
    let amount: number | null = null;
    if (pairs['AM'] !== undefined) {
      amount = normalizeAmount(pairs['AM']);
    }

    // Currency
    const currency = pairs['CC'] ? normalizeCurrency(pairs['CC']) || pairs['CC'].toUpperCase() : 'CZK';

    // VS, KS, SS (preserve leading zeros as strings!)
    const variableSymbol = pairs['X-VS']
      ? pairs['X-VS'].replace(/\D/g, '').substring(0, 10) || null
      : pairs['VS']
      ? pairs['VS'].replace(/\D/g, '').substring(0, 10) || null
      : null;

    const constantSymbol = pairs['X-KS']
      ? pairs['X-KS'].replace(/\D/g, '').substring(0, 10) || null
      : pairs['KS']
      ? pairs['KS'].replace(/\D/g, '').substring(0, 10) || null
      : null;

    const specificSymbol = pairs['X-SS']
      ? pairs['X-SS'].replace(/\D/g, '').substring(0, 10) || null
      : pairs['SS']
      ? pairs['SS'].replace(/\D/g, '').substring(0, 10) || null
      : null;

    // Recipient Name
    const recipientName = normalizeText(pairs['RN'] || pairs['NAME'] || '', 70) || '';

    // Message / Note
    const note = normalizeText(pairs['MSG'] || pairs['NOTE'] || null, 140);

    // Due Date: DT:YYYYMMDD
    let dueDate: Date | null = null;
    if (pairs['DT']) {
      dueDate = normalizeDate(pairs['DT']);
    }

    // Payment reference: RF
    const paymentReference = normalizeText(pairs['RF'] || null, 35);

    const draft: PaymentDraft = {
      qrFormat: 'spayd',
      recipientName,
      iban: normalizeIban(iban, { ...DEFAULT_NORMALIZE_IBAN_OPTIONS, validateChecksum: false }) || iban,
      bic,
      amount,
      currency,
      variableSymbol,
      constantSymbol,
      specificSymbol,
      note,
      paymentReference,
      dueDate,
      rawQrData: qrData,
    };

    return {
      success: true,
      format: 'spayd',
      drafts: [draft],
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
