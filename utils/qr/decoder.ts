import {
  PaymentDraft,
  QrDecodingResult,
  QrErrorType,
  QrDecodingError,
} from '@/types/payment';

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
    if (payBySquareResult.success) {
      return payBySquareResult;
    }

    // Try EPC/SEPA QR format
    const epcResult = tryDecodeEpcSepa(qrData);
    if (epcResult.success) {
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
        recipientName: normalizeText(pairs['Nazov'] || pairs['Name'] || pairs['Meno'] || '') || '',
        iban: normalizeIban(account.iban, { ...DEFAULT_NORMALIZE_IBAN_OPTIONS, validateChecksum: false }) || '',
        bic: normalizeBic(account.bic || pairs['Kod'] || null),
        amount: normalizeAmount(pairs['Sum'] || pairs['Summa'] || pairs['Amount'] || null),
        currency: normalizeCurrency(pairs['Mena'] || pairs['Currency'] || null) || 'EUR',
        variableSymbol: normalizeText(pairs['VS'] || pairs['VarSym'] || null, 10),
        constantSymbol: normalizeText(pairs['KS'] || pairs['KonstSym'] || null, 10),
        specificSymbol: normalizeText(pairs['SS'] || pairs['SpecSym'] || null, 10),
        note: normalizeText(pairs['Popis'] || pairs['Message'] || pairs[' Pozn'] || null),
        paymentReference: normalizeText(pairs['Ref'] || pairs['Reference'] || null),
        dueDate: normalizeDate(pairs['Datum'] || pairs['Date'] || pairs['Splatnost'] || null),
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
    // EPC/SEPA QR codes typically start with "BCD"
    // and contain service tags like "01", "53", "60", etc.
    if (!qrData.includes('BCD') && !qrData.includes('01') && !qrData.includes('60')) {
      return { success: false, format: null, drafts: [] };
    }

    // Parse the BCD data
    // BCD format: Each service tag is followed by its length and data
    // Example: BCD\n001\n01\n16\nDE89370400440532013000\n002\n53\n... 
    
    // For simplicity, we'll try to extract known fields
    // This is a simplified parser - a full implementation would need to handle BCD encoding properly
    
    const draft: PaymentDraft = {
      qrFormat: 'epc-sepa',
      recipientName: '',
      iban: '',
      bic: null,
      amount: null,
      currency: 'EUR', // EPC always uses EUR
      variableSymbol: null,
      constantSymbol: null,
      specificSymbol: null,
      note: null,
      paymentReference: null,
      dueDate: null,
      rawQrData: qrData,
    };

    // Try to extract fields using regex patterns
    // IBAN pattern (country code + checksum + BBAN)
    const ibanMatch = qrData.match(/([A-Z]{2})([0-9]{2})([A-Z0-9]{11,34})/i);
    if (ibanMatch) {
      const fullIban = ibanMatch[1] + ibanMatch[2] + ibanMatch[3];
      draft.iban = normalizeIban(fullIban, { ...DEFAULT_NORMALIZE_IBAN_OPTIONS, validateChecksum: false }) || '';
    }

    // BIC pattern (4-11 alphanumeric characters)
    const bicMatch = qrData.match(/([A-Z0-9]{8,11})/i);
    if (bicMatch && isValidBicPosition(qrData, bicMatch.index || 0)) {
      draft.bic = normalizeBic(bicMatch[1]) || null;
    }

    // Amount pattern (e.g., EUR100.00 or 100.00EUR)
    const amountMatch = qrData.match(/(EUR|USD|GBP|SKK|[0-9])(\d*[.,]?\d{0,2})/i);
    if (amountMatch) {
      // Try to find amount with currency
      const currencyAmountMatch = qrData.match(/(EUR|USD|GBP|SKK)(\d+[.,]?\d{0,2})/i);
      if (currencyAmountMatch) {
        draft.currency = normalizeCurrency(currencyAmountMatch[1]) || 'EUR';
        draft.amount = normalizeAmount(currencyAmountMatch[2]);
      } else {
        // Try without currency
        const simpleAmountMatch = qrData.match(/(\d+[.,]?\d{0,2})/);
        if (simpleAmountMatch) {
          draft.amount = normalizeAmount(simpleAmountMatch[1]);
        }
      }
    }

    // Name extraction (look for text after account info)
    const nameMatch = qrData.match(/[A-Z]{2,}\s+[A-Z\s]+/i);
    if (nameMatch) {
      draft.recipientName = normalizeText(nameMatch[0]) || '';
    }

    // Reference/payment reference
    const refMatch = qrData.match(/(RF[0-9]{2})[A-Z0-9]{1,35}/i);
    if (refMatch) {
      draft.paymentReference = normalizeText(refMatch[0]) || null;
    }

    // Remittance information (note)
    const remittanceMatch = qrData.match(/5[34]\d{2}([^\n]{0,140})/);
    if (remittanceMatch) {
      draft.note = normalizeText(remittanceMatch[1]) || null;
    }

    // Due date (look for date pattern)
    const dateMatch = qrData.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      draft.dueDate = normalizeDate(dateMatch[1]) || null;
    }

    // Validate that we have at least IBAN
    if (!draft.iban || !isValidIbanFormat(draft.iban)) {
      return {
        success: false,
        format: null,
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
 * Checks if BIC is in a valid position within the QR data
 * (Not part of the IBAN or another field)
 */
function isValidBicPosition(qrData: string, bicIndex: number): boolean {
  // Simple check: BIC should not be immediately after country code + checksum
  // This is a heuristic to avoid false positives
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
