'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createTransaction, internalTransferByEmail } from '@/app/actions/banking'
import { AlertCircle, X, Calendar, Download } from 'lucide-react'
import {
  downloadPaymentConfirmationByFormat,
  openPaymentConfirmationHtml,
  generateMaskedSenderIban,
  type PaymentConfirmationPdfData,
} from '@/lib/payment-confirmation-pdf'
import { getReceiptFormat, type ReceiptFormat } from '@/lib/receipt-format'
import { encodeTransactionDescription } from '@/lib/payment-confirmation-from-transaction'
import { CATEGORIES, categorizeTransaction } from '@/lib/categories'

interface BankAccount {
  id: string
  accountNumber: string
  accountType: string
  balance: string | number
  currency: string
  isActive: boolean
}

interface TransferFormProps {
  accountId: string
  accounts: BankAccount[]
  onClose?: () => void
}

export function TransferForm({ accountId, accounts, onClose }: TransferFormProps) {
  const router = useRouter()
  const [recipientName, setRecipientName] = useState('')
  const [iban, setIban] = useState('')
  const [amount, setAmount] = useState('')
  const [vs, setVs] = useState('') // Variabilný symbol
  const [ks, setKs] = useState('') // Konštantný symbol
  const [ss, setSs] = useState('') // Špecifický symbol
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [dueDate, setDueDate] = useState('21.06.2026')
  const [repeatDays, setRepeatDays] = useState('0')
  const [createTemplate, setCreateTemplate] = useState(false)
  const [emailConfirmation, setEmailConfirmation] = useState(false)
  const [category, setCategory] = useState(CATEGORIES.other_expenses.name)
  const [hasManuallyChangedCategory, setHasManuallyChangedCategory] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [paymentConfirmation, setPaymentConfirmation] = useState<PaymentConfirmationPdfData | null>(null)
  const [receiptFormat] = useState<ReceiptFormat>(() => getReceiptFormat())

  useEffect(() => {
    if (!hasManuallyChangedCategory) {
      const autoCategory = categorizeTransaction(recipientName, note, 'withdrawal')
      setCategory(autoCategory)
    }
  }, [recipientName, note, hasManuallyChangedCategory])

  const activeAccount = accounts.find(acc => acc.id === accountId)
  const currentBalance = activeAccount ? (activeAccount.balance as number) : 0

  const formatBalance = (val: number | string) => {
    return (Number(val) / 100).toFixed(2).replace('.', ',')
  }

  // Calculate new balance preview
  const parsedAmount = parseFloat(amount) || 0
  const enteredAmountCents = Math.round(parsedAmount * 100)
  const newBalance = currentBalance - enteredAmountCents

  const buildPaymentConfirmation = (
    transactionId: string,
    transferType: PaymentConfirmationPdfData['transferType']
  ): PaymentConfirmationPdfData => ({
    transactionId,
    createdAt: new Date().toLocaleString('sk-SK'),
    status: 'Štandardný platobný príkaz',
    transferType,
    fromAccountNumber: generateMaskedSenderIban(),
    recipientName,
    recipientAccountOrEmail: iban.trim(),
    amount,
    currency: activeAccount?.currency ?? 'EUR',
    variableSymbol: vs,
    constantSymbol: ks,
    specificSymbol: ss,
    note,
    payerReference: reference,
    dueDate,
    repeatDays,
    createTemplate,
    emailConfirmation,
    balanceBefore: (currentBalance / 100).toFixed(2),
    balanceAfter: (newBalance / 100).toFixed(2),
  })

  const handleDownloadPaymentConfirmation = async (confirmation = paymentConfirmation) => {
    if (!confirmation) return
    setPdfError(null)
    try {
      await downloadPaymentConfirmationByFormat(confirmation, receiptFormat)
    } catch {
      setPdfError('Doklad sa nepodarilo pripraviť. Skúste to znova.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPdfError(null)
    setSuccess(false)
    setLoading(true)

    if (enteredAmountCents <= 0) {
      setError('Suma musí byť väčšia ako nula.')
      setLoading(false)
      return
    }

    if (enteredAmountCents > currentBalance) {
      setError('Nedostatok finančných prostriedkov na účte.')
      setLoading(false)
      return
    }

    try {
      // Check if the IBAN input is actually an email address
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(iban.trim())
      let result: Awaited<ReturnType<typeof internalTransferByEmail>>
      let transferType: PaymentConfirmationPdfData['transferType'] = 'external'

      if (isEmail) {
        transferType = 'email'
        result = await internalTransferByEmail(
          accountId,
          iban.trim(),
          amount,
          note
        )
      } else {
        // Encode structured transaction information into description: Name | Note | Category
        result = await createTransaction(
          accountId,
          null,
          amount,
          'withdrawal',
          encodeTransactionDescription({
            recipientName: recipientName || 'Prevod',
            note: note || 'Platba',
            category: category,
            recipientAccountOrEmail: iban.trim(),
            variableSymbol: vs,
            constantSymbol: ks,
            specificSymbol: ss,
            payerReference: reference,
          })
        )
      }

      const confirmation = buildPaymentConfirmation(result.id, transferType)
      setPaymentConfirmation(confirmation)
      setSuccess(true)
      void handleDownloadPaymentConfirmation(confirmation)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Niekde nastala chyba pri odosielaní platby.')
    } finally {
      setLoading(false)
    }
  }

  /* ---- Shared input classes ---- */
  const inputCls = 'w-full h-11 px-4 bg-[#1b1b26] border border-slate-800 rounded-xl text-[14px] text-white placeholder-slate-400 focus:outline-none focus:border-[#327bf5] transition-colors'

  if (success) {
    return (
      <div className="flex-1 bg-[#030305] text-white flex flex-col font-sans select-none h-full absolute inset-0 z-100 animate-fade-in">
        <header className="bg-transparent text-white px-4 pt-4 pb-4 sticky top-0 z-50 flex items-center justify-between">
          <div className="flex-1"></div>
          <div className="text-center flex-3">
            <h1 className="font-bold text-[17px] text-white tracking-wide">
              Podpisovanie
            </h1>
          </div>
          <div className="flex-1 flex justify-end">
            {onClose && (
              <button 
                onClick={onClose}
                type="button" 
                className="text-slate-400 hover:text-white focus:outline-none p-1"
                aria-label="Zatvoriť"
              >
                <X className="w-5 h-5 stroke-2" />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 p-4 flex flex-col items-center justify-center">
          <div className="w-full max-w-md george-card glow-purple rounded-3xl flex flex-col items-center shadow-xl border border-slate-800/40 overflow-hidden">
            
            <div className="pt-12 pb-8 px-6 flex flex-col items-center">
              {/* 3D Green checkmark icon */}
              <div className="w-22 h-22 rounded-full bg-linear-to-br from-[#5cf07c] via-[#35cc59] to-[#1c9c38] flex items-center justify-center mb-8 shadow-[inset_-4px_-8px_16px_rgba(0,0,0,0.2),inset_4px_8px_16px_rgba(255,255,255,0.4),0_8px_24px_rgba(53,204,89,0.3)] animate-scale-in">
                <svg className="w-12 h-12 text-white drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>

              <h2 className="text-[20px] font-bold text-white text-center mb-2 leading-tight tracking-wide">
                Ďakujem, bolo to úspešné a naozaj rýchle.
              </h2>
              
              <p className="text-[14px] text-slate-200 text-center px-4 leading-relaxed">
                Stav príkazu si môžete skontrolovať v zozname platieb.
              </p>
              <p className="text-[12px] text-slate-400 text-center px-4 leading-relaxed mt-3">
                Potvrdenie o platbe je pripravené na stiahnutie.
              </p>
            </div>

            <div className="w-full border-t border-slate-800/40 px-5 py-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => paymentConfirmation && openPaymentConfirmationHtml(paymentConfirmation)}
                className="w-full h-11 bg-[#1b1b26] hover:bg-[#1b1b26]/85 text-white font-bold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 text-[14px] border border-slate-800"
              >
                Zobraziť doklad
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPaymentConfirmation()}
                className="w-full h-11 bg-[#327bf5] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 text-[14px] shadow-lg shadow-blue-900/30"
              >
                <Download className="w-4 h-4" />
                Stiahnuť doklad ({receiptFormat.toUpperCase()})
              </button>
              {pdfError && (
                <p className="text-[12px] text-red-400 text-center font-medium">
                  {pdfError}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setSuccess(false)
                  if (onClose) onClose()
                }}
                className="w-full h-11 bg-[#327bf5] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center text-[14px]"
              >
                Hotovo
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuccess(false)
                  if (onClose) onClose()
                  router.push(`/dashboard/accounts/${accountId}`)
                }}
                className="w-full h-11 bg-transparent border-[1.5px] border-slate-800 text-[#327bf5] hover:bg-[#1b1b26]/50 font-bold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center text-[14px]"
              >
                Zobraziť zoznam platieb
              </button>
            </div>

          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-[#030305] text-white flex flex-col font-sans select-none pb-8 relative">

      {/* Header matching left image (no background gradient) */}
      <header className="bg-[#0a0a10]/95 backdrop-blur-md text-white px-6 py-4 sticky top-0 z-50 border-b border-slate-900/40 flex items-center justify-between">
        <div className="flex-1">
          <button
            type="button"
            onClick={() => {
              setRecipientName('Odoslana platba')
              setIban('SK99 0900 0000 0000 1234 5678')
              setAmount('120.50')
              setVs('20260601')
              setKs('0308')
              setSs('123')
              setNote('Uhrada faktury')
              setReference('FAK-2026-06')
            }}
            className="text-[14px] bg-[#1b1b26] border border-slate-800 text-[#327bf5] hover:bg-[#1b1b26]/80 w-8 h-8 rounded-full transition-colors flex items-center justify-center focus:outline-none shadow-sm"
            title="Vyplniť testovacie dáta"
          >
            🪄
          </button>
        </div>
        <div className="text-center flex-3">
          <p className="text-[11px] text-slate-400 font-semibold tracking-wider">
            Business účet | € {formatBalance(currentBalance)}
          </p>
          <h1 className="font-bold text-[18px] text-white tracking-wide mt-0.5">
            Nová platba
          </h1>
        </div>
        <div className="flex-1 flex justify-end">
          {onClose && (
            <button 
              onClick={onClose}
              type="button" 
              className="text-slate-405 hover:text-white focus:outline-none p-1"
              aria-label="Zatvoriť"
            >
              <X className="w-5 h-5 stroke-2" />
            </button>
          )}
        </div>
      </header>

      {/* ===== Form Container ===== */}
      <form onSubmit={handleSubmit} className="px-5 py-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        
        {/* QR Code link */}
        <button
          type="button"
          className="mx-auto px-5 py-2 mb-2 bg-transparent border border-slate-800 rounded-xl text-[13px] text-[#327bf5] font-bold flex items-center justify-center gap-2 hover:bg-[#1b1b26]/50 transition-colors focus:outline-none"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h2v2h-2zm4 0h3v3h-3zm-4 4h3v3h-3zm4 0h3v3h-3z" />
          </svg>
          QR kód
        </button>

        {/* Príjemca */}
        <div className="flex flex-col gap-1">
          <label htmlFor="recipient" className="text-[14px] font-bold text-white tracking-wide">
            Príjemca
          </label>
          <div className="relative flex items-center">
            <input
              id="recipient"
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Zadajte názov príjemcu"
              required
              className={inputCls + ' pr-12'}
            />
            <button 
              type="button" 
              className="absolute right-4 text-[#327bf5] focus:outline-none"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <circle cx="12" cy="10" r="3" />
                <path d="M7 20v-1a5 5 0 0 1 10 0v1" />
                <line x1="1" y1="8" x2="4" y2="8" />
                <line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            </button>
          </div>
          <p className="text-[11px] text-[#676a7c] mt-0.5">
            Prosím, zadajte názov alebo vyberte jeden zo svojich kontaktov.
          </p>
        </div>

        {/* IBAN */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="iban" className="text-[14px] font-bold text-white tracking-wide">
            IBAN alebo číslo účtu
          </label>
          <input
            id="iban"
            type="text"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="SK00 0000 0000 0000 0000 0000"
            required
            className={inputCls + ' uppercase tracking-wider'}
          />
          <p className="text-[11px] text-[#676a7c] mt-0.5">
            Prosím, zadajte číslo účtu alebo IBAN.
          </p>
        </div>

        {/* Suma */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="amount" className="text-[14px] font-bold text-white tracking-wide">
            Suma
          </label>
          <div className="flex items-center gap-2">
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              required
              className={'flex-1 h-11 px-4 bg-[#1b1c24] border border-[#3a3d52] rounded-[14px] text-[14px] text-white placeholder-[#474959] focus:outline-none focus:border-[#1d63ed] transition-colors'}
            />
            <div className="h-11 px-3 bg-[#1b1b26] border border-[#327bf5] rounded-xl flex items-center gap-1.5 text-[14px] font-bold text-[#327bf5] shrink-0 cursor-pointer">
              <span className="w-5 h-5 rounded-full bg-[#327bf5] flex items-center justify-center text-white text-[14px] leading-none">+</span>
              EUR <span className="text-[10px] text-[#327bf5] ml-0.5">▼</span>
            </div>
          </div>
          <p className="text-[11px] mt-0.5 text-[#179f42] font-bold">
            Nový disponibilný zostatok € {formatBalance(newBalance)}
          </p>
        </div>

        {/* Variabilný symbol */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="vs" className="text-[14px] font-bold text-white tracking-wide">
            Variabilný symbol <span className="text-[11px] text-[#676a7c] font-normal ml-1">Voliteľné</span>
          </label>
          <input
            id="vs"
            type="text"
            maxLength={10}
            value={vs}
            onChange={(e) => setVs(e.target.value.replace(/\D/g, ''))}
            className={inputCls}
          />
        </div>

        {/* Konštantný symbol so Zoznam symbolov na rovnakej úrovni */}
        <div className="flex flex-col gap-1 mt-1">
          <div className="flex items-center justify-between">
            <label htmlFor="ks" className="text-[14px] font-bold text-white tracking-wide">
              Konštantný symbol <span className="text-[11px] text-[#676a7c] font-normal ml-1">Voliteľné</span>
            </label>
            <button type="button" className="text-[#327bf5] text-[12px] font-bold hover:text-blue-400 transition-colors focus:outline-none">
              Zoznam symbolov
            </button>
          </div>
          <input
            id="ks"
            type="text"
            maxLength={4}
            value={ks}
            onChange={(e) => setKs(e.target.value.replace(/\D/g, ''))}
            className={inputCls}
          />
        </div>

        {/* Špecifický symbol */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="ss" className="text-[14px] font-bold text-white tracking-wide">
            Špecifický symbol <span className="text-[11px] text-[#676a7c] font-normal ml-1">Voliteľné</span>
          </label>
          <input
            id="ss"
            type="text"
            maxLength={10}
            value={ss}
            onChange={(e) => setSs(e.target.value.replace(/\D/g, ''))}
            className={inputCls}
          />
        </div>

        {/* Poznámka pre príjemcu */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="note" className="text-[14px] font-bold text-white tracking-wide">
            Poznámka pre príjemcu <span className="text-[11px] text-[#676a7c] font-normal ml-1">Voliteľné</span>
          </label>
          <input
            id="note"
            type="text"
            maxLength={140}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Referencia platiteľa */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="reference" className="text-[14px] font-bold text-white tracking-wide">
            Referencia platiteľa <span className="text-[11px] text-[#676a7c] font-normal ml-1">Voliteľné</span>
          </label>
          <input
            id="reference"
            type="text"
            maxLength={35}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Kategória platby */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="category" className="text-[14px] font-bold text-white tracking-wide">
            Kategória platby
          </label>
          <div className="relative">
            <select
              id="category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setHasManuallyChangedCategory(true)
              }}
              className={inputCls + ' appearance-none cursor-pointer pr-10'}
            >
              {Object.values(CATEGORIES).map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
            <svg className="w-4 h-4 text-[#474959] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Dátum splatnosti */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="dueDate" className="text-[14px] font-bold text-white tracking-wide">
            Dátum splatnosti
          </label>
          <div className="relative flex items-center">
            <input
              id="dueDate"
              type="text"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className={inputCls + ' pr-12'}
            />
            <div className="absolute right-4 text-[#1d63ed] pointer-events-none">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Počet dní opakovania */}
        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="repeatDays" className="text-[14px] font-bold text-white tracking-wide">
            Počet dní opakovania <span className="text-[11px] text-[#676a7c] font-normal ml-1">Voliteľné</span>
          </label>
          <div className="relative">
            <select
              id="repeatDays"
              value={repeatDays}
              onChange={(e) => setRepeatDays(e.target.value)}
              className={inputCls + ' appearance-none cursor-pointer pr-10'}
            >
              <option value="0">0</option>
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="90">90</option>
            </select>
            <svg className="w-4 h-4 text-[#474959] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        {/* Šablóna */}
        <div className="flex flex-col gap-2 mt-1">
          <label className="text-[14px] font-bold text-white tracking-wide">
            Šablóna <span className="text-[11px] text-[#676a7c] font-normal ml-1">Voliteľné</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={createTemplate}
                onChange={(e) => setCreateTemplate(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-5 h-5 rounded border-2 border-slate-800 bg-[#1b1b26] peer-checked:bg-[#327bf5] peer-checked:border-[#327bf5] flex items-center justify-center transition-colors">
                {createTemplate && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-[14px] text-[#c5cde0] group-hover:text-white transition-colors">Vytvoriť šablónu</span>
          </label>
        </div>

        {/* Potvrdenie o vykonaní platby */}
        <div className="flex flex-col gap-2 mt-1">
          <label className="text-[14px] font-bold text-white tracking-wide">
            Potvrdenie o vykonaní platby (na e-mail) <span className="text-[11px] text-[#676a7c] font-normal ml-1">Voliteľné</span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={emailConfirmation}
                onChange={(e) => setEmailConfirmation(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-5 h-5 rounded border-2 border-slate-800 bg-[#1b1b26] peer-checked:bg-[#327bf5] peer-checked:border-[#327bf5] flex items-center justify-center transition-colors">
                {emailConfirmation && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#676a7c]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span className="text-[14px] font-bold text-[#c5cde0] group-hover:text-white transition-colors">E-mailové potvrdenie</span>
              </div>
              <p className="text-[11px] text-[#676a7c] mt-1 leading-relaxed">
                Zaslanie potvrdenia o vykonaní platby e-mailom je spoplatnené v zmysle platného <span className="text-[#327bf5] font-semibold">Sadzobníka</span>.
              </p>
            </div>
          </label>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="flex gap-2 p-3 bg-red-950/20 border border-red-500/20 rounded-[14px] mt-1">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-red-400 font-medium">{error}</p>
          </div>
        )}

        {/* ===== Action Buttons ===== */}
        <div className="flex flex-col gap-3 mt-4">
          <button
            type="button"
            onClick={() => {
              setRecipientName('Odoslana platba')
              setIban('SK99 0900 0000 0000 1234 5678')
              setAmount('120.50')
              setVs('20260601')
              setKs('0308')
              setSs('123')
              setNote('Uhrada faktury')
              setReference('FAK-2026-06')
            }}
            className="w-full h-11 bg-transparent border-2 border-dashed border-purple-500/30 hover:bg-[#a13fe7]/10 text-slate-300 hover:text-white font-bold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 text-[14px]"
          >
            <span className="text-[18px]">🪄</span>
            Vyplniť testovacie údaje
          </button>

          <button
            type="submit"
            disabled={loading || !amount || !iban}
            className="w-full h-11 bg-[#327bf5] hover:bg-blue-600 disabled:bg-[#1b1b26] disabled:text-slate-600 text-white font-bold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center text-[14px] shadow-lg shadow-blue-900/30"
          >
            {loading ? 'Spracováva sa...' : 'Podpísať platbu'}
          </button>

          <button
            type="button"
            className="w-full h-11 bg-transparent border border-slate-800 text-[#327bf5] hover:bg-[#1b1b26]/50 font-bold rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center text-[14px]"
          >
            Uložiť na neskôr
          </button>
        </div>

      </form>

      {/* Floating icon */}
      <div className="fixed bottom-6 left-5 z-70 w-10 h-10 rounded-full bg-[#1b1b26] border border-slate-850 flex items-center justify-center shadow-lg">
        <span className="text-[#327bf5] font-black text-[14px] leading-none">N</span>
      </div>
    </div>
  )
}
