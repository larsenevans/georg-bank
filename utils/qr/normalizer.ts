import {
  DEFAULT_NORMALIZE_IBAN_OPTIONS,
  NormalizeIbanOptions,
} from '@/types/payment';

/**
 * Normalizes an IBAN string
 * - Removes spaces
 * - Converts to uppercase
 * - Optionally validates checksum
 * 
 * @param iban - The IBAN to normalize
 * @param options - Normalization options
 * @returns Normalized IBAN or null if invalid
 */
export function normalizeIban(
  iban: string,
  options: NormalizeIbanOptions = DEFAULT_NORMALIZE_IBAN_OPTIONS
): string | null {
  if (!iban || typeof iban !== 'string') {
    return null;
  }

  let normalized = iban;

  // Remove spaces
  if (options.removeSpaces) {
    normalized = normalized.replace(/\s+/g, '');
  }

  // Convert to uppercase
  if (options.toUpperCase) {
    normalized = normalized.toUpperCase();
  }

  // Validate checksum if requested
  if (options.validateChecksum && !validateIbanChecksum(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Validates IBAN checksum using the MOD-97-10 algorithm
 * 
 * @param iban - The IBAN to validate (should be normalized)
 * @returns true if checksum is valid
 */
export function validateIbanChecksum(iban: string): boolean {
  if (!iban || iban.length < 4) {
    return false;
  }

  try {
    // Move first 4 characters to end
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    
    // Convert letters to numbers (A=10, B=11, ..., Z=35)
    const numeric = rearranged.split('').map(char => {
      if (/[0-9]/.test(char)) {
        return parseInt(char, 10);
      }
      if (/[A-Z]/.test(char)) {
        return char.charCodeAt(0) - 55;
      }
      return -1; // Invalid character
    });

    // Check for invalid characters
    if (numeric.some(n => n === -1)) {
      return false;
    }

    // Calculate MOD-97-10
    let remainder = '';
    for (const num of numeric) {
      remainder = (remainder + num.toString()).replace(/^0+/, '');
      while (remainder.length >= 9) {
        const part = remainder.slice(0, 9);
        remainder = (parseInt(part, 10) % 97) + remainder.slice(9);
      }
    }

    const finalRemainder = parseInt(remainder || '0', 10) % 97;
    return finalRemainder === 1;
  } catch {
    return false;
  }
}

/**
 * Normalizes a BIC/SWIFT code
 * - Removes spaces
 * - Converts to uppercase
 * - Validates format (8 or 11 characters, alphanumeric)
 * 
 * @param bic - The BIC to normalize
 * @returns Normalized BIC or null if invalid
 */
export function normalizeBic(bic: string | null | undefined): string | null {
  if (!bic) {
    return null;
  }

  const normalized = bic.replace(/\s+/g, '').toUpperCase();

  // BIC must be 8 or 11 characters, alphanumeric only
  if (!/^[A-Z0-9]{8,11}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Normalizes currency code
 * - Converts to uppercase
 * - Validates against supported currencies
 * 
 * @param currency - The currency code to normalize
 * @returns Normalized currency or null if unsupported
 */
export function normalizeCurrency(currency: string | null | undefined): string | null {
  if (!currency) {
    return null;
  }

  const normalized = currency.toUpperCase();

  // Supported currencies: EUR, SKK (for legacy)
  // Additional currencies can be added as needed
  const supportedCurrencies = new Set(['EUR', 'SKK', 'USD', 'GBP', 'CZK', 'PLN', 'HUF']);

  if (supportedCurrencies.has(normalized)) {
    return normalized;
  }

  // If not in supported list but looks like a valid ISO currency code (3 letters)
  if (/^[A-Z]{3}$/.test(normalized)) {
    return normalized;
  }

  return null;
}

/**
 * Normalizes a text field for storage
 * - Trims whitespace
 * - Limits length
 * - Sanitizes to prevent XSS
 * 
 * @param text - The text to normalize
 * @param maxLength - Maximum allowed length
 * @returns Normalized text
 */
export function normalizeText(text: string | null | undefined, maxLength: number = 140): string | null {
  if (!text) {
    return null;
  }

  let normalized = text.trim();

  // Limit length
  if (normalized.length > maxLength) {
    normalized = normalized.slice(0, maxLength);
  }

  // Basic XSS sanitization - remove HTML tags
  normalized = normalized.replace(/<[^>]*>/g, '');

  // Remove potentially dangerous characters
  normalized = normalized.replace(/[\x00-\x1F\x7F]/g, '');

  return normalized || null;
}

/**
 * Normalizes amount
 * - Parses string or number
 * - Rounds to 2 decimal places
 * - Validates positive value
 * 
 * @param amount - The amount to normalize
 * @returns Normalized amount or null if invalid
 */
export function normalizeAmount(amount: string | number | null | undefined): number | null {
  if (amount === null || amount === undefined) {
    return null;
  }

  let num: number;

  if (typeof amount === 'string') {
    // Replace comma with dot for decimal separator
    const normalizedStr = amount.replace(',', '.');
    num = parseFloat(normalizedStr);
  } else {
    num = amount;
  }

  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  // Round to 2 decimal places
  num = Math.round(num * 100) / 100;

  // Must be positive
  if (num < 0) {
    return null;
  }

  // Reasonable upper limit (1 million)
  if (num > 10000000) {
    return null;
  }

  return num;
}

/**
 * Normalizes a date string to Date object
 * 
 * @param date - Date string in various formats (YYYY-MM-DD, DD.MM.YYYY, etc.)
 * @returns Date object or null if invalid
 */
export function normalizeDate(date: string | Date | null | undefined): Date | null {
  if (!date) {
    return null;
  }

  if (date instanceof Date) {
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  // Try multiple date formats
  const formats = [
    // ISO format: YYYY-MM-DD
    (d: string) => {
      const match = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const dateObj = new Date(year, month, day);
        if (!isNaN(dateObj.getTime())) {
          return dateObj;
        }
      }
      return null;
    },
    // European format: DD.MM.YYYY
    (d: string) => {
      const match = d.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        const dateObj = new Date(year, month, day);
        if (!isNaN(dateObj.getTime())) {
          return dateObj;
        }
      }
      return null;
    },
    // YYYYMMDD format
    (d: string) => {
      const match = d.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const dateObj = new Date(year, month, day);
        if (!isNaN(dateObj.getTime())) {
          return dateObj;
        }
      }
      return null;
    },
    // ISO datetime: YYYY-MM-DDTHH:MM:SS
    (d: string) => {
      const dateObj = new Date(d);
      if (!isNaN(dateObj.getTime())) {
        return dateObj;
      }
      return null;
    },
  ];

  for (const formatFn of formats) {
    const result = formatFn(date);
    if (result) {
      return result;
    }
  }

  return null;
}

/**
 * Checks if a string looks like a valid IBAN (format only, not checksum)
 * 
 * @param iban - The string to check
 * @returns true if format is valid
 */
export function isValidIbanFormat(iban: string): boolean {
  if (!iban || typeof iban !== 'string') {
    return false;
  }

  const normalized = iban.replace(/\s+/g, '').toUpperCase();

  // IBAN must be at least 4 characters
  // First 2 characters: country code (letters)
  // Next 2 characters: checksum (digits)
  // Rest: BBAN (alphanumeric)
  if (normalized.length < 4) {
    return false;
  }

  // Check country code
  if (!/^[A-Z]{2}/.test(normalized)) {
    return false;
  }

  // Check checksum digits
  if (!/^[0-9]{2}/.test(normalized.slice(2, 4))) {
    return false;
  }

  // Check BBAN (alphanumeric only)
  if (!/^[A-Z0-9]+$/.test(normalized.slice(4))) {
    return false;
  }

  return true;
}

/**
 * Checks if a string looks like a URL (security check)
 * 
 * @param str - The string to check
 * @returns true if it looks like a URL
 */
export function isUrl(str: string): boolean {
  if (!str || typeof str !== 'string') {
    return false;
  }

  // Simple URL detection
  return /^https?:\/\//i.test(str) || /^www\./i.test(str);
}
