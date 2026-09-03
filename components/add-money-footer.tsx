'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, WalletCards } from 'lucide-react'
import { depositFunds } from '@/app/actions/banking'

interface AddMoneyFooterProps {
  accountId: string
  accountNumber?: string
  balance?: string | number
  currency?: string
}

const quickAmounts = ['0,10', '1,00', '10,00', '100,00']

function formatBalance(value: string | number | undefined) {
  if (value === undefined) return '0,00'
  return (Number(value) / 100).toFixed(2).replace('.', ',')
}

function normalizeAmount(value: string) {
  return value.trim().replace(/\s/g, '').replace(',', '.')
}

export function AddMoneyFooter({
  accountId,
  accountNumber,
  balance,
  currency = 'EUR',
}: AddMoneyFooterProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^\d,.]/g, '')
    const normalized = cleaned.replace(',', '.')
    const parts = normalized.split('.')
    const next = parts.length > 2
      ? `${parts[0]}.${parts.slice(1).join('')}`
      : normalized

    setAmount(next.replace('.', ','))
  }

  const handleSubmit = async () => {
    setError(null)
    setMessage(null)

    const normalized = normalizeAmount(amount)
    const parsed = Number(normalized)

    if (!accountId) {
      setError('Účet ešte nie je pripravený.')
      return
    }

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Zadajte sumu väčšiu ako 0,00.')
      return
    }

    setLoading(true)
    try {
      await depositFunds(
        accountId,
        parsed.toFixed(2),
        'Pridanie peňazí|Dobitie cez spodné menu|Ostatné nepravidelné príjmy'
      )
      setAmount('')
      setMessage(`Pridané ${parsed.toFixed(2).replace('.', ',')} ${currency}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Peniaze sa nepodarilo pridať.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <div className="w-full">
        {open && (
          <div className="mb-3 rounded-2xl border border-slate-800/40 bg-[#1b1b26]/95 p-4 shadow-2xl backdrop-blur-md">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Pridať peniaze
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  SPACE účet | {formatBalance(balance)} {currency}
                </p>
                {accountNumber && (
                  <p className="mt-0.5 text-[11px] text-slate-400">{accountNumber}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Zavrieť pridanie peňazí"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                value={amount}
                onChange={(event) => handleAmountChange(event.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-800 bg-[#0a0a10] px-4 text-[17px] font-bold text-white placeholder-slate-500 outline-none transition-colors focus:border-[#327bf5]"
              />
              <div className="flex h-11 items-center rounded-xl border border-slate-800 bg-[#0a0a10] px-3 text-sm font-bold text-white">
                {currency}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {quickAmounts.map((quickAmount) => (
                <button
                  key={quickAmount}
                  type="button"
                  onClick={() => setAmount(quickAmount)}
                  className="h-9 rounded-xl border border-slate-800 bg-[#1b1b26] text-xs font-bold text-slate-300 transition-colors hover:bg-[#1b1b26]/50 hover:border-[#327bf5] hover:text-white"
                >
                  +{quickAmount}
                </button>
              ))}
            </div>

            {error && (
              <p className="mt-3 text-center text-xs font-semibold text-red-400">{error}</p>
            )}
            {message && (
              <p className="mt-3 text-center text-xs font-semibold text-[#179f42]">{message}</p>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#327bf5] text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-[#1b1b26] disabled:text-slate-600 shadow-lg shadow-blue-900/30"
            >
              <Plus className="h-4 w-4" />
              {loading ? 'Pridávam...' : 'Pridať na účet'}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setOpen((current) => !current)
            setError(null)
          }}
          className="ml-auto flex h-12 items-center gap-3 rounded-xl border border-slate-800 bg-[#327bf5] px-4 text-sm font-bold text-white shadow-[0_12px_32px_rgba(0,0,0,0.45)] transition-transform hover:bg-blue-600 active:scale-[0.98]"
          aria-expanded={open}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
            <WalletCards className="h-4 w-4" />
          </span>
          + Peniaze
        </button>
      </div>
    </div>
  )
}
