'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { PaymentDraft, PaymentOption, RecipientContact } from '@/types/payment';
import { validatePaymentDraft, normalizeIban, normalizeText, normalizeAmount } from '@/utils/qr';
import PaymentQrScanner from './PaymentQrScanner';
import QrPaymentPreview from './QrPaymentPreview';

/**
 * Props for the TransferForm component
 */
export interface TransferFormProps {
  /**
   * User's saved contacts
   */
  contacts?: RecipientContact[];
  
  /**
   * User's accounts
   */
  accounts?: Array<{
    id: string;
    name: string;
    accountNumber: string;
    iban: string;
    balance: number;
    currency: string;
  }>;
  
  /**
   * Selected account ID (for source account)
   */
  selectedAccountId?: string;
  
  /**
   * Called when a transaction is submitted
   */
  onSubmit: (data: PaymentDraft & { accountId: string }) => Promise<void>;
  
  /**
   * Called when a contact should be saved
   */
  onSaveContact?: (draft: PaymentDraft) => Promise<RecipientContact | void>;
  
  /**
   * Called when form is cancelled
   */
  onCancel?: () => void;
  
  /**
   * Whether to show QR scan button
   * @default true
   */
  showQrScan?: boolean;
}

/**
 * TransferForm Component
 * 
 * Form for creating a new payment transaction.
 * Supports:
 * - Manual entry of payment details
 * - QR code scanning
 * - Contact selection
 * - Form validation
 */
export function TransferForm({
  contacts = [],
  accounts = [],
  selectedAccountId,
  onSubmit,
  onSaveContact,
  onCancel,
  showQrScan = true,
}: TransferFormProps) {
  const [formData, setFormData] = useState<PaymentDraft & { accountId: string }>({
    qrFormat: 'unknown',
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
    rawQrData: null,
    accountId: selectedAccountId || accounts[0]?.id || '',
  });

  const [validation, setValidation] = useState({
    valid: false,
    errors: [] as Array<{ field: string; message: string; type: string }>,
    warnings: [] as Array<{ field: string; message: string; type: string }>,
  });

  const [state, setState] = useState<'form' | 'scanning' | 'preview' | 'submitting'>('form');
  const [scannerError, setScannerError] = useState<Error | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Update form when selectedAccountId changes
  useEffect(() => {
    if (selectedAccountId && selectedAccountId !== formData.accountId) {
      setFormData(prev => ({ ...prev, accountId: selectedAccountId }));
    }
  }, [selectedAccountId]);

  /**
   * Validate form data
   */
  const validateForm = useCallback(() => {
    const result = validatePaymentDraft(formData, true);
    
    // Add account validation
    const errors = [...result.errors];
    const warnings = [...result.warnings];

    if (!formData.accountId) {
      errors.push({ field: 'accountId', message: 'Source account is required', type: 'error' });
    }

    // Check if amount is provided (required for submission)
    if (formData.amount === null) {
      errors.push({ field: 'amount', message: 'Amount is required', type: 'error' });
    }

    setValidation({
      valid: errors.length === 0,
      errors,
      warnings,
    });

    return errors.length === 0;
  }, [formData]);

  /**
   * Handle form field change
   */
  const handleChange = useCallback((
    field: keyof (PaymentDraft & { accountId: string }),
    value: string | number | null | Date
  ) => {
    let processedValue: string | number | null | Date = value;

    // Process value based on field type
    switch (field) {
      case 'iban':
        processedValue = normalizeIban(value as string, { validateChecksum: false });
        break;
      case 'bic':
        if (value) {
          processedValue = (value as string).replace(/\s+/g, '').toUpperCase();
        } else {
          processedValue = null;
        }
        break;
      case 'amount':
        processedValue = normalizeAmount(typeof value === 'string' || typeof value === 'number' ? value : null);
        break;
      case 'currency':
        processedValue = (value as string).toUpperCase();
        break;
      case 'note':
        processedValue = normalizeText(value as string, 140);
        break;
      case 'variableSymbol':
      case 'constantSymbol':
      case 'specificSymbol':
        processedValue = normalizeText(value as string, 10);
        break;
      case 'recipientName':
      case 'paymentReference':
        processedValue = normalizeText(value as string);
        break;
      default:
        processedValue = value;
    }

    setFormData(prev => ({ ...prev, [field]: processedValue }));
  }, []);

  /**
   * Handle QR scan success
   */
  const handleScanSuccess = useCallback((draft: PaymentDraft) => {
    setFormData(prev => ({
      ...prev,
      ...draft,
      // Keep existing account selection
      accountId: prev.accountId,
    }));
    setState('preview');
  }, []);

  /**
   * Handle multiple payment options
   */
  const handleMultipleOptions = useCallback((options: PaymentOption[]) => {
    setPaymentOptions(options);
    // Select first option by default
    setFormData(prev => ({
      ...prev,
      ...options[0].draft,
      accountId: prev.accountId,
    }));
    setState('preview');
  }, []);

  /**
   * Handle scanner error
   */
  const handleScannerError = useCallback((error: Error) => {
    setScannerError(error);
  }, []);

  /**
   * Handle scanner close
   */
  const handleScannerClose = useCallback(() => {
    setState('form');
    setScannerError(null);
  }, []);

  /**
   * Handle preview close
   */
  const handlePreviewClose = useCallback(() => {
    setState('form');
    setPaymentOptions([]);
  }, []);

  /**
   * Handle preview scan again
   */
  const handleScanAgain = useCallback(() => {
    setState('scanning');
    setScannerError(null);
    setPaymentOptions([]);
  }, []);

  /**
   * Handle save contact from preview
   */
  const handleSaveContactFromPreview = useCallback(async (draft: PaymentDraft) => {
    if (onSaveContact) {
      try {
        await onSaveContact(draft);
        // Close preview and show success message
        setState('form');
        setPaymentOptions([]);
        // Could show a toast here
      } catch (error) {
        console.error('Failed to save contact:', error);
      }
    }
  }, [onSaveContact]);

  /**
   * Handle send money from preview
   */
  const handleSendMoneyFromPreview = useCallback((draft: PaymentDraft) => {
    // Pre-fill form with draft data
    setFormData(prev => ({
      ...prev,
      ...draft,
      accountId: prev.accountId,
    }));
    setState('form');
    setPaymentOptions([]);
  }, []);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!validateForm()) {
      return;
    }

    // Check if amount is provided
    if (formData.amount === null) {
      setValidation(prev => ({
        ...prev,
        errors: [...prev.errors, { field: 'amount', message: 'Amount is required', type: 'error' }],
      }));
      return;
    }

    // Check if account is selected
    if (!formData.accountId) {
      setValidation(prev => ({
        ...prev,
        errors: [...prev.errors, { field: 'accountId', message: 'Source account is required', type: 'error' }],
      }));
      return;
    }

    setState('submitting');

    try {
      await onSubmit(formData);
      
      // Reset form on success (optional)
      setFormData(prev => ({
        ...prev,
        recipientName: '',
        iban: '',
        bic: null,
        amount: null,
        variableSymbol: null,
        constantSymbol: null,
        specificSymbol: null,
        note: null,
        paymentReference: null,
        dueDate: null,
        rawQrData: null,
      }));
    } catch (error) {
      console.error('Transaction submission failed:', error);
    } finally {
      setState('form');
    }
  }, [formData, onSubmit, validateForm]);

  /**
   * Format IBAN for display
   */
  const formatIban = (iban: string | null) => {
    if (!iban) return '';
    return iban.replace(/(\w{4})(?=\w)/g, '$1 ');
  };

  /**
   * Format amount for display
   */
  const formatAmount = (amount: number | null) => {
    if (amount === null) return '';
    return new Intl.NumberFormat('sk-SK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  /**
   * Get source account info
   */
  const getSourceAccount = () => {
    return accounts.find(a => a.id === formData.accountId);
  };

  // Validate form on change
  useEffect(() => {
    validateForm();
  }, [formData, validateForm]);

  // Render different states
  if (state === 'scanning') {
    return (
      <PaymentQrScanner
        onScanSuccess={handleScanSuccess}
        onError={handleScannerError}
        onClose={handleScannerClose}
        onMultipleOptions={handleMultipleOptions}
        title="Scan Payment QR"
        description="Point your camera at a PAY by square or EPC/SEPA QR code"
      />
    );
  }

  if (state === 'preview') {
    // Create draft from form data
    const draft: PaymentDraft = formData;
    
    return (
      <QrPaymentPreview
        draft={draft}
        options={paymentOptions}
        onOptionSelect={(selectedDraft) => {
          setFormData(prev => ({ ...prev, ...selectedDraft }));
        }}
        onSaveContact={handleSaveContactFromPreview}
        onSendMoney={handleSendMoneyFromPreview}
        onClose={handlePreviewClose}
        onScanAgain={handleScanAgain}
      />
    );
  }

  // Main form
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Send Money</h2>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* QR Scan Button */}
      {showQrScan && (
        <button
          type="button"
          onClick={() => setState('scanning')}
          className="w-full py-4 px-6 border-2 border-dashed border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors flex items-center justify-center gap-3"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="font-medium">Scan QR Code</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Source Account Selection */}
      <div>
        <label htmlFor="accountId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          From Account
        </label>
        {accounts.length > 0 ? (
          <select
            id="accountId"
            value={formData.accountId}
            onChange={(e) => handleChange('accountId', e.target.value)}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} - {formatIban(account.iban)} ({account.currency} {formatAmount(account.balance)})
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No accounts available</p>
        )}
        {validation.errors.some(e => e.field === 'accountId') && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {validation.errors.find(e => e.field === 'accountId')?.message}
          </p>
        )}
      </div>

      {/* Recipient Information */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Recipient
        </h3>

        <div>
          <label htmlFor="recipientName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Recipient Name
          </label>
          <input
            type="text"
            id="recipientName"
            value={formData.recipientName || ''}
            onChange={(e) => handleChange('recipientName', e.target.value)}
            placeholder="Enter recipient name"
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="iban" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            IBAN *
          </label>
          <input
            type="text"
            id="iban"
            value={formatIban(formData.iban) || ''}
            onChange={(e) => handleChange('iban', e.target.value)}
            placeholder="Enter IBAN"
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
          />
          {validation.errors.some(e => e.field === 'iban') && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {validation.errors.find(e => e.field === 'iban')?.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="bic" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            BIC / SWIFT
          </label>
          <input
            type="text"
            id="bic"
            value={formData.bic || ''}
            onChange={(e) => handleChange('bic', e.target.value)}
            placeholder="Enter BIC (optional)"
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
          />
          {validation.errors.some(e => e.field === 'bic') && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {validation.errors.find(e => e.field === 'bic')?.message}
            </p>
          )}
        </div>
      </div>

      {/* Amount and Currency */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Amount
        </h3>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                {formData.currency}
              </span>
              <input
                type="number"
                id="amount"
                value={formData.amount ?? ''}
                onChange={(e) => handleChange('amount', e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full p-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {validation.errors.some(e => e.field === 'amount') && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {validation.errors.find(e => e.field === 'amount')?.message}
              </p>
            )}
          </div>

          <div className="flex-shrink-0">
            <label htmlFor="currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Currency
            </label>
            <select
              id="currency"
              value={formData.currency || ''}
              onChange={(e) => handleChange('currency', e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="EUR">EUR - Euro</option>
              <option value="SKK">SKK - Slovak Koruna (legacy)</option>
              <option value="USD">USD - US Dollar</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="CZK">CZK - Czech Koruna</option>
              <option value="PLN">PLN - Polish Zloty</option>
              <option value="HUF">HUF - Hungarian Forint</option>
            </select>
          </div>
        </div>

        {/* Balance info */}
        {formData.accountId && getSourceAccount() && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Available balance: 
            <span className="font-medium text-green-600 dark:text-green-400">
              {formatAmount(getSourceAccount()!.balance)} {getSourceAccount()!.currency}
            </span>
          </div>
        )}
      </div>

      {/* Payment Details (collapsible) */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
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
            className={`w-5 h-5 text-gray-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="p-4 pt-0 space-y-4">
            {/* Variable Symbol */}
            <div>
              <label htmlFor="variableSymbol" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Variable Symbol (VS)
              </label>
              <input
                type="text"
                id="variableSymbol"
                value={formData.variableSymbol || ''}
                onChange={(e) => handleChange('variableSymbol', e.target.value)}
                placeholder="0-10 characters"
                maxLength={10}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {validation.errors.some(e => e.field === 'variableSymbol') && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validation.errors.find(e => e.field === 'variableSymbol')?.message}
                </p>
              )}
            </div>

            {/* Constant Symbol */}
            <div>
              <label htmlFor="constantSymbol" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Constant Symbol (KS)
              </label>
              <input
                type="text"
                id="constantSymbol"
                value={formData.constantSymbol || ''}
                onChange={(e) => handleChange('constantSymbol', e.target.value)}
                placeholder="0-10 characters"
                maxLength={10}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Specific Symbol */}
            <div>
              <label htmlFor="specificSymbol" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Specific Symbol (ŠS)
              </label>
              <input
                type="text"
                id="specificSymbol"
                value={formData.specificSymbol || ''}
                onChange={(e) => handleChange('specificSymbol', e.target.value)}
                placeholder="0-10 characters"
                maxLength={10}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Payment Reference */}
            <div>
              <label htmlFor="paymentReference" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Payment Reference
              </label>
              <input
                type="text"
                id="paymentReference"
                value={formData.paymentReference || ''}
                onChange={(e) => handleChange('paymentReference', e.target.value)}
                placeholder="Enter payment reference"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Note */}
            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Note (max 140 characters)
              </label>
              <textarea
                id="note"
                value={formData.note || ''}
                onChange={(e) => handleChange('note', e.target.value)}
                placeholder="Enter note"
                maxLength={140}
                rows={3}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.note?.length || 0}/140 characters
              </p>
              {validation.errors.some(e => e.field === 'note') && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validation.errors.find(e => e.field === 'note')?.message}
                </p>
              )}
            </div>

            {/* Due Date */}
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Due Date
              </label>
              <input
                type="date"
                id="dueDate"
                value={formData.dueDate ? formData.dueDate.toString().split('T')[0] : ''}
                onChange={(e) => handleChange('dueDate', e.target.value ? new Date(e.target.value) : null)}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {validation.errors.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            Please fix the following errors:
          </p>
          <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
            {validation.errors.map((error, index) => (
              <li key={index} className="flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error.field}: {error.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Validation Warnings */}
      {validation.warnings.length > 0 && validation.errors.length === 0 && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
            Warnings:
          </p>
          <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
            {validation.warnings.map((warning, index) => (
              <li key={index} className="flex items-start gap-2">
                <svg className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{warning.field}: {warning.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={!validation.valid || state === 'submitting'}
          className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {state === 'submitting' ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span>Send Money</span>
            </>
          )}
        </button>
        
        {/* Demo notice */}
        <p className="mt-2 text-xs text-center text-gray-400 dark:text-gray-500">
          This is a demo. No real money will be transferred.
        </p>
      </div>
    </form>
  );
}

export default TransferForm;
