'use client';

import React, { useState, useCallback } from 'react';
import { PaymentDraft, PaymentOption } from '@/types/payment';
import { validatePaymentDraft } from '@/utils/qr';

/**
 * Props for the QrPaymentPreview component
 */
export interface QrPaymentPreviewProps {
  /**
   * The payment draft to display
   */
  draft: PaymentDraft;
  
  /**
   * All payment options (if multiple accounts were found)
   */
  options?: PaymentOption[];
  
  /**
   * Called when the user selects a different payment option
   */
  onOptionSelect?: (draft: PaymentDraft) => void;
  
  /**
   * Called when the user clicks "Save Contact"
   */
  onSaveContact: (draft: PaymentDraft) => void;
  
  /**
   * Called when the user clicks "Send Money"
   */
  onSendMoney: (draft: PaymentDraft) => void;
  
  /**
   * Called when the user closes the preview
   */
  onClose: () => void;
  
  /**
   * Called when the user wants to scan again
   */
  onScanAgain?: () => void;
}

/**
 * QrPaymentPreview Component
 * 
 * Displays the decoded QR payment information and provides actions
 * for saving as contact or sending money.
 */
export function QrPaymentPreview({
  draft,
  options,
  onOptionSelect,
  onSaveContact,
  onSendMoney,
  onClose,
  onScanAgain,
}: QrPaymentPreviewProps) {
  const [validation] = useState(() => validatePaymentDraft(draft));
  const [expanded, setExpanded] = useState(false);

  /**
   * Format amount for display
   */
  const formatAmount = useCallback((amount: number | null, currency: string | null) => {
    if (amount === null) return 'Not specified';
    return new Intl.NumberFormat('sk-SK', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }, []);

  /**
   * Format date for display
   */
  const formatDate = useCallback((date: Date | null) => {
    if (!date) return null;
    return new Intl.DateTimeFormat('sk-SK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }, []);

  /**
   * Format IBAN for display (add spaces every 4 characters)
   */
  const formatIban = useCallback((iban: string) => {
    if (!iban) return '';
    return iban.replace(/(\w{4})(?=\w)/g, '$1 ');
  }, []);

  /**
   * Handle option selection
   */
  const handleOptionSelect = useCallback((
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const selectedId = event.target.value;
    const selectedOption = options?.find(opt => opt.id === selectedId);
    if (selectedOption && onOptionSelect) {
      onOptionSelect(selectedOption.draft);
    }
  }, [options, onOptionSelect]);

  /**
   * Render validation warnings/errors
   */
  const renderValidationMessages = () => {
    if (validation.valid && validation.warnings.length === 0) {
      return null;
    }

    return (
      <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
          {validation.valid ? 'Warnings:' : 'Validation Errors:'}
        </p>
        <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
          {validation.errors.map((error, index) => (
            <li key={`error-${index}`} className="flex items-start gap-2">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error.field}: {error.message}</span>
            </li>
          ))}
          {validation.warnings.map((warning, index) => (
            <li key={`warning-${index}`} className="flex items-start gap-2">
              <svg className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{warning.field}: {warning.message}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Payment Information
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {draft.qrFormat === 'pay-by-square' ? 'PAY by square' : 
               draft.qrFormat === 'epc-sepa' ? 'EPC/SEPA QR' : 'QR Code'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Validation Messages */}
          {renderValidationMessages()}

          {/* Multiple Options Selector */}
          {options && options.length > 1 && onOptionSelect && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <label htmlFor="option-select" className="block text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                Multiple payment options found:
              </label>
              <select
                id="option-select"
                onChange={handleOptionSelect}
                className="w-full p-2 border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-blue-900/20 text-gray-900 dark:text-white"
                defaultValue={options.find(opt => opt.draft === draft)?.id}
              >
                {options.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label} - {formatIban(option.draft.iban)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recipient Information */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Recipient
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {draft.recipientName || 'Unknown recipient'}
                    </p>
                    {validation.errors.some(e => e.field === 'recipientName') && (
                      <span className="text-red-500 text-xs px-2 py-0.5 bg-red-50 dark:bg-red-900/20 rounded-full">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {formatIban(draft.iban)}
                  </p>
                  {draft.bic && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      BIC: {draft.bic}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Amount Information */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Amount
              </h3>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatAmount(draft.amount, draft.currency)}
            </p>
            {draft.amount === null && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Amount not specified in QR code
              </p>
            )}
          </div>

          {/* Payment Details (collapsible) */}
          <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg">
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full p-4 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Payment Details
                </h3>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expanded && (
              <div className="p-4 pt-0 space-y-3">
                {/* Variable Symbol */}
                {draft.variableSymbol && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Variable Symbol (VS)</span>
                    <span className="text-sm font-mono text-gray-900 dark:text-white">{draft.variableSymbol}</span>
                  </div>
                )}

                {/* Constant Symbol */}
                {draft.constantSymbol && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Constant Symbol (KS)</span>
                    <span className="text-sm font-mono text-gray-900 dark:text-white">{draft.constantSymbol}</span>
                  </div>
                )}

                {/* Specific Symbol */}
                {draft.specificSymbol && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Specific Symbol (ŠS)</span>
                    <span className="text-sm font-mono text-gray-900 dark:text-white">{draft.specificSymbol}</span>
                  </div>
                )}

                {/* Payment Reference */}
                {draft.paymentReference && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Reference</span>
                    <span className="text-sm font-mono text-gray-900 dark:text-white">{draft.paymentReference}</span>
                  </div>
                )}

                {/* Due Date */}
                {draft.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Due Date</span>
                    <span className="text-sm text-gray-900 dark:text-white">{formatDate(draft.dueDate)}</span>
                  </div>
                )}

                {/* Note */}
                {draft.note && (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-500 dark:text-gray-400 block mb-1">Note</span>
                    <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{draft.note}</p>
                  </div>
                )}

                {/* Raw QR Data (for debugging) */}
                {draft.rawQrData && (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <details className="text-sm">
                      <summary className="text-gray-500 dark:text-gray-400 cursor-pointer">
                        Raw QR Data
                      </summary>
                      <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
                        {draft.rawQrData}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onScanAgain}
              className="flex-1 py-3 px-4 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors hover:border-gray-400 dark:hover:border-gray-500 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Scan Again
            </button>

            <button
              onClick={() => onSaveContact(draft)}
              disabled={!validation.valid || !draft.iban}
              className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Save Contact
            </button>

            <button
              onClick={() => onSendMoney(draft)}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Send Money
            </button>
          </div>

          {/* Disclaimer */}
          <p className="mt-4 text-xs text-center text-gray-400 dark:text-gray-500">
            Scanning a QR code will only pre-fill the payment form. 
            You must confirm to complete the payment.
          </p>
        </div>
      </div>
    </div>
  );
}

export default QrPaymentPreview;
