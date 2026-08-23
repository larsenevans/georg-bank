/**
 * Payment Draft Type
 * 
 * Normalized payment data from QR code scanning or manual entry.
 * This is the single source of truth for payment information before submission.
 */

/**
 * Supported QR code formats
 */
export type QrFormat = 'pay-by-square' | 'epc-sepa' | 'unknown';

/**
 * Supported currencies
 * SKK for legacy support, EUR as default
 */
export type Currency = 'EUR' | 'SKK' | string;

/**
 * Payment Draft Interface
 * Contains all normalized payment information from a QR code or manual entry
 */
export interface PaymentDraft {
  // QR Format identification
  qrFormat: QrFormat;
  
  // Recipient information
  recipientName: string;
  iban: string; // Normalized: uppercase, no spaces
  bic: string | null;
  
  // Amount information
  amount: number | null; // null if not specified in QR
  currency: Currency | null; // null if not specified, defaults to EUR
  
  // Payment symbols (Variable, Constant, Specific)
  variableSymbol: string | null;
  constantSymbol: string | null;
  specificSymbol: string | null;
  
  // Additional payment information
  note: string | null; // Max 140 characters
  paymentReference: string | null; // Reference from QR code
  dueDate: Date | null; // Due date for the payment
  
  // Source data for debugging and validation
  rawQrData: string | null; // Original QR data string
}

/**
 * Recipient Contact Interface
 * Represents a saved recipient contact in the database
 */
export interface RecipientContact {
  id: string;
  userId: string; // Owner of the contact
  name: string; // Recipient name
  iban: string; // Normalized IBAN
  bic: string | null; // BIC/SWIFT code
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create Recipient Contact DTO
 * Data transfer object for creating/updating a contact
 */
export interface CreateRecipientContactDto {
  name: string;
  iban: string;
  bic?: string | null;
}

/**
 * QR Decoding Result
 * Result of decoding a QR code, may contain multiple options
 */
export interface QrDecodingResult {
  success: boolean;
  format: QrFormat | null;
  drafts: PaymentDraft[]; // Multiple drafts if QR contains multiple payment options
  error?: string | null;
  warnings?: string[]; // Non-critical issues (e.g., missing amount)
}

/**
 * Payment Option
 * When a QR code contains multiple payment options (e.g., multiple accounts),
 * the user must select which one to use
 */
export interface PaymentOption {
  id: string;
  label: string; // Display name for the option
  draft: PaymentDraft;
}

/**
 * QR Decoding Error Types
 */
export class QrDecodingError extends Error {
  constructor(
    message: string,
    public readonly errorType: QrErrorType,
    public readonly rawData?: string
  ) {
    super(message);
    this.name = 'QrDecodingError';
  }
}

/**
 * Types of QR decoding errors
 */
export type QrErrorType =
  | 'INVALID_QR_FORMAT'
  | 'UNSUPPORTED_QR_TYPE'
  | 'INVALID_IBAN'
  | 'INVALID_BIC'
  | 'UNSUPPORTED_CURRENCY'
  | 'INVALID_AMOUNT'
  | 'PAYLOAD_TOO_LARGE'
  | 'MALFORMED_DATA'
  | 'CHECKSUM_FAILED'
  | 'SECURITY_VIOLATION';

/**
 * Validation Result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Individual validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  type: 'error' | 'warning';
}

/**
 * IBAN Normalization Options
 */
export interface NormalizeIbanOptions {
  removeSpaces?: boolean;
  toUpperCase?: boolean;
  validateChecksum?: boolean;
}

/**
 * Default normalization options
 */
export const DEFAULT_NORMALIZE_IBAN_OPTIONS: NormalizeIbanOptions = {
  removeSpaces: true,
  toUpperCase: true,
  validateChecksum: true,
};
