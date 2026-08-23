import {
  PaymentDraft,
  ValidationResult,
  ValidationError,
} from '@/types/payment';
import {
  validateIbanChecksum,
  isValidIbanFormat,
} from './normalizer';

/**
 * Maximum lengths for text fields
 */
const FIELD_MAX_LENGTHS: Record<string, number> = {
  recipientName: 70,
  iban: 34,
  bic: 11,
  variableSymbol: 10,
  constantSymbol: 10,
  specificSymbol: 10,
  note: 140,
  paymentReference: 35,
  currency: 3,
};

/**
 * Supported currencies
 */
const SUPPORTED_CURRENCIES = new Set(['EUR', 'SKK', 'USD', 'GBP', 'CZK', 'PLN', 'HUF']);

/**
 * Validates a PaymentDraft object
 * 
 * @param draft - The payment draft to validate
 * @param strict - If true, null values for required fields will be errors
 * @returns ValidationResult with errors and warnings
 */
export function validatePaymentDraft(
  draft: PaymentDraft,
  strict: boolean = false
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate recipient name
  if (!draft.recipientName || draft.recipientName.trim() === '') {
    if (strict) {
      errors.push({
        field: 'recipientName',
        message: 'Recipient name is required',
        type: 'error',
      });
    } else {
      warnings.push({
        field: 'recipientName',
        message: 'Recipient name is recommended',
        type: 'warning',
      });
    }
  } else if (draft.recipientName.length > FIELD_MAX_LENGTHS.recipientName) {
    errors.push({
      field: 'recipientName',
      message: `Recipient name exceeds maximum length of ${FIELD_MAX_LENGTHS.recipientName} characters`,
      type: 'error',
    });
  }

  // Validate IBAN
  if (!draft.iban || draft.iban.trim() === '') {
    errors.push({
      field: 'iban',
      message: 'IBAN is required',
      type: 'error',
    });
  } else {
    // Check IBAN format
    if (!isValidIbanFormat(draft.iban)) {
      errors.push({
        field: 'iban',
        message: 'IBAN has invalid format',
        type: 'error',
      });
    } else {
      // Check IBAN checksum
      if (!validateIbanChecksum(draft.iban)) {
        errors.push({
          field: 'iban',
          message: 'IBAN checksum is invalid',
          type: 'error',
        });
      }
    }

    // Check IBAN length
    if (draft.iban.length > FIELD_MAX_LENGTHS.iban) {
      errors.push({
        field: 'iban',
        message: `IBAN exceeds maximum length of ${FIELD_MAX_LENGTHS.iban} characters`,
        type: 'error',
      });
    }
  }

  // Validate BIC (optional but recommended)
  if (draft.bic && draft.bic.trim() !== '') {
    if (!/^[A-Z0-9]{8,11}$/.test(draft.bic)) {
      errors.push({
        field: 'bic',
        message: 'BIC must be 8-11 alphanumeric characters',
        type: 'error',
      });
    }

    if (draft.bic.length > FIELD_MAX_LENGTHS.bic) {
      errors.push({
        field: 'bic',
        message: `BIC exceeds maximum length of ${FIELD_MAX_LENGTHS.bic} characters`,
        type: 'error',
      });
    }
  } else if (strict) {
    warnings.push({
      field: 'bic',
      message: 'BIC is recommended for international payments',
      type: 'warning',
    });
  }

  // Validate amount
  if (draft.amount !== null) {
    if (draft.amount <= 0) {
      errors.push({
        field: 'amount',
        message: 'Amount must be positive',
        type: 'error',
      });
    }

    if (draft.amount > 10000000) {
      errors.push({
        field: 'amount',
        message: 'Amount exceeds maximum allowed value',
        type: 'error',
      });
    }
  } else if (strict) {
    warnings.push({
      field: 'amount',
      message: 'Amount is recommended',
      type: 'warning',
    });
  }

  // Validate currency
  if (draft.currency !== null) {
    const upperCurrency = draft.currency.toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(upperCurrency)) {
      if (/^[A-Z]{3}$/.test(upperCurrency)) {
        warnings.push({
          field: 'currency',
          message: `Currency ${upperCurrency} is not commonly supported`,
          type: 'warning',
        });
      } else {
        errors.push({
          field: 'currency',
          message: 'Currency must be a 3-letter ISO code',
          type: 'error',
        });
      }
    }
  } else {
    // Default to EUR
    draft.currency = 'EUR';
  }

  // Validate variable symbol
  if (draft.variableSymbol !== null) {
    if (draft.variableSymbol.length > FIELD_MAX_LENGTHS.variableSymbol) {
      errors.push({
        field: 'variableSymbol',
        message: `Variable symbol exceeds maximum length of ${FIELD_MAX_LENGTHS.variableSymbol} characters`,
        type: 'error',
      });
    }
    
    // Must be numeric if provided
    if (draft.variableSymbol && !/^\d*$/.test(draft.variableSymbol)) {
      warnings.push({
        field: 'variableSymbol',
        message: 'Variable symbol should be numeric',
        type: 'warning',
      });
    }
  }

  // Validate constant symbol
  if (draft.constantSymbol !== null) {
    if (draft.constantSymbol.length > FIELD_MAX_LENGTHS.constantSymbol) {
      errors.push({
        field: 'constantSymbol',
        message: `Constant symbol exceeds maximum length of ${FIELD_MAX_LENGTHS.constantSymbol} characters`,
        type: 'error',
      });
    }
    
    // Must be numeric if provided
    if (draft.constantSymbol && !/^\d*$/.test(draft.constantSymbol)) {
      warnings.push({
        field: 'constantSymbol',
        message: 'Constant symbol should be numeric',
        type: 'warning',
      });
    }
  }

  // Validate specific symbol
  if (draft.specificSymbol !== null) {
    if (draft.specificSymbol.length > FIELD_MAX_LENGTHS.specificSymbol) {
      errors.push({
        field: 'specificSymbol',
        message: `Specific symbol exceeds maximum length of ${FIELD_MAX_LENGTHS.specificSymbol} characters`,
        type: 'error',
      });
    }
    
    // Must be numeric if provided
    if (draft.specificSymbol && !/^\d*$/.test(draft.specificSymbol)) {
      warnings.push({
        field: 'specificSymbol',
        message: 'Specific symbol should be numeric',
        type: 'warning',
      });
    }
  }

  // Validate note
  if (draft.note !== null) {
    if (draft.note.length > FIELD_MAX_LENGTHS.note) {
      errors.push({
        field: 'note',
        message: `Note exceeds maximum length of ${FIELD_MAX_LENGTHS.note} characters`,
        type: 'error',
      });
    }
  }

  // Validate payment reference
  if (draft.paymentReference !== null) {
    if (draft.paymentReference.length > FIELD_MAX_LENGTHS.paymentReference) {
      errors.push({
        field: 'paymentReference',
        message: `Payment reference exceeds maximum length of ${FIELD_MAX_LENGTHS.paymentReference} characters`,
        type: 'error',
      });
    }
  }

  // Validate due date
  if (draft.dueDate !== null) {
    if (isNaN(draft.dueDate.getTime())) {
      errors.push({
        field: 'dueDate',
        message: 'Due date is invalid',
        type: 'error',
      });
    }

    // Check if due date is in the past
    if (draft.dueDate < new Date()) {
      warnings.push({
        field: 'dueDate',
        message: 'Due date is in the past',
        type: 'warning',
      });
    }
  }

  // Check if QR format is valid
  if (!['pay-by-square', 'epc-sepa', 'unknown'].includes(draft.qrFormat)) {
    errors.push({
      field: 'qrFormat',
      message: 'Invalid QR format',
      type: 'error',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates an IBAN string
 * 
 * @param iban - The IBAN to validate
 * @returns ValidationResult
 */
export function validateIban(iban: string | null): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!iban || iban.trim() === '') {
    errors.push({
      field: 'iban',
      message: 'IBAN is required',
      type: 'error',
    });
    return { valid: false, errors, warnings };
  }

  const normalized = iban.replace(/\s+/g, '').toUpperCase();

  // Check format
  if (!isValidIbanFormat(normalized)) {
    errors.push({
      field: 'iban',
      message: 'IBAN has invalid format. Expected: 2 letter country code + 2 digit checksum + BBAN',
      type: 'error',
    });
  }

  // Check checksum
  if (isValidIbanFormat(normalized) && !validateIbanChecksum(normalized)) {
    errors.push({
      field: 'iban',
      message: 'IBAN checksum is invalid',
      type: 'error',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a BIC string
 * 
 * @param bic - The BIC to validate
 * @returns ValidationResult
 */
export function validateBic(bic: string | null): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!bic || bic.trim() === '') {
    warnings.push({
      field: 'bic',
      message: 'BIC is recommended for international payments',
      type: 'warning',
    });
    return { valid: true, errors, warnings };
  }

  const normalized = bic.replace(/\s+/g, '').toUpperCase();

  if (!/^[A-Z0-9]{8,11}$/.test(normalized)) {
    errors.push({
      field: 'bic',
      message: 'BIC must be 8-11 alphanumeric characters',
      type: 'error',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a currency code
 * 
 * @param currency - The currency to validate
 * @returns ValidationResult
 */
export function validateCurrency(currency: string | null): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!currency || currency.trim() === '') {
    warnings.push({
      field: 'currency',
      message: 'Currency will default to EUR',
      type: 'warning',
    });
    return { valid: true, errors, warnings };
  }

  const normalized = currency.toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    errors.push({
      field: 'currency',
      message: 'Currency must be a 3-letter ISO code',
      type: 'error',
    });
  } else if (!SUPPORTED_CURRENCIES.has(normalized)) {
    warnings.push({
      field: 'currency',
      message: `Currency ${normalized} may not be fully supported`,
      type: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates an amount
 * 
 * @param amount - The amount to validate
 * @returns ValidationResult
 */
export function validateAmount(amount: number | null): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (amount === null) {
    warnings.push({
      field: 'amount',
      message: 'Amount is recommended',
      type: 'warning',
    });
    return { valid: true, errors, warnings };
  }

  if (isNaN(amount) || !isFinite(amount)) {
    errors.push({
      field: 'amount',
      message: 'Amount must be a valid number',
      type: 'error',
    });
  } else if (amount <= 0) {
    errors.push({
      field: 'amount',
      message: 'Amount must be positive',
      type: 'error',
    });
  } else if (amount > 10000000) {
    errors.push({
      field: 'amount',
      message: 'Amount exceeds maximum allowed value',
      type: 'error',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates QR payload size
 * 
 * @param qrData - The QR data to validate
 * @param maxSize - Maximum allowed size in bytes
 * @returns ValidationResult
 */
export function validateQrPayloadSize(
  qrData: string,
  maxSize: number = 2048
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!qrData) {
    errors.push({
      field: 'qrData',
      message: 'QR data is required',
      type: 'error',
    });
    return { valid: false, errors, warnings };
  }

  if (qrData.length > maxSize) {
    errors.push({
      field: 'qrData',
      message: `QR payload exceeds maximum size of ${maxSize} bytes`,
      type: 'error',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Checks if a string contains potentially dangerous content (XSS)
 * 
 * @param str - The string to check
 * @returns true if potentially dangerous
 */
export function containsDangerousContent(str: string | null): boolean {
  if (!str) {
    return false;
  }

  // Check for HTML/JavaScript patterns
  const dangerousPatterns = [
    /<script\b/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i,
    /<svg\b.*<script/i,
    /data:\s*text\/html/i,
  ];

  return dangerousPatterns.some(pattern => pattern.test(str));
}
