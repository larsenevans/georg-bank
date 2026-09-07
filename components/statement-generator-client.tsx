'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { zipSync, strToU8 } from 'fflate'
import { ChevronLeft, Download, FileText, Loader2 } from 'lucide-react'

interface AccountOption {
  id: string
  accountNumber: string
  displayName: string | null
  balance: number
  currency: string
}

interface GeneratedStatement {
  month: string
  html: string
  filename: string
}

interface StatementGeneratorClientProps {
  accounts: AccountOption[]
  defaultAccountName: string
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-')
  const date = new Date(Number(year), Number(monthNumber) - 1, 1)
  return new Intl.DateTimeFormat('sk-SK', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Bratislava',
  }).format(date)
}

export function StatementGeneratorClient({
  accounts,
  defaultAccountName,
}: StatementGeneratorClientProps) {
  const defaultAccount = accounts[0]
  const [accountId, setAccountId] = useState(defaultAccount?.id ?? '')
  const [accountDisplayName, setAccountDisplayName] = useState(
    defaultAccount?.displayName || defaultAccountName || 'Business účet',
  )
  const [transactionsPerMonth, setTransactionsPerMonth] = useState(20)
  const [averageMonthlyTurnover, setAverageMonthlyTurnover] = useState(3000)
  const [mixOutgoing, setMixOutgoing] = useState(true)
  const [mixIncoming, setMixIncoming] = useState(true)
  const [mixTopup, setMixTopup] = useState(true)
  const [persistToDatabase, setPersistToDatabase] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statements, setStatements] = useState<GeneratedStatement[]>([])

  const mix = useMemo(
    () => ({
      outgoing: mixOutgoing ? 70 : 0,
      incoming: mixIncoming ? 20 : 0,
      topup: mixTopup ? 10 : 0,
    }),
    [mixIncoming, mixOutgoing, mixTopup],
  )

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setStatements([])

    try {
      const response = await fetch('/api/statements/generate-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accountDisplayName,
          transactionsPerMonth,
          averageMonthlyTurnover,
          mix,
          persistToDatabase,
        }),
      })

      const payload = (await response.json()) as {
        statements?: GeneratedStatement[]
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Generovanie zlyhalo.')
      }

      setStatements(payload.statements ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generovanie zlyhalo.')
    } finally {
      setLoading(false)
    }
  }

  const openStatement = (statement: GeneratedStatement) => {
    const blob = new Blob([statement.html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const downloadZip = () => {
    if (statements.length === 0) return

    const files: Record<string, Uint8Array> = {}
    for (const statement of statements) {
      files[statement.filename] = strToU8(statement.html)
    }

    const zipped = zipSync(files)
    const blob = new Blob([zipped], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `vypisy-${accountDisplayName.replace(/\s+/g, '-').toLowerCase()}.zip`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-[100dvh] bg-[#030305] text-white">
      <header className="sticky top-0 z-20 border-b border-slate-900/40 bg-[#0a0a10]/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Späť na dashboard"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Výpisy</p>
            <h1 className="text-lg font-black text-white">Generátor výpisov</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="george-card glow-purple border border-slate-800/40 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-sm text-slate-400">
            Vygeneruj 3 mesačné HTML výpisy s vlastným názvom účtu, mixom platieb a priemerným obratom.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                Účet
              </label>
              <select
                value={accountId}
                onChange={(event) => {
                  const nextId = event.target.value
                  setAccountId(nextId)
                  const selected = accounts.find((account) => account.id === nextId)
                  if (selected?.displayName) {
                    setAccountDisplayName(selected.displayName)
                  }
                }}
                className="w-full rounded-xl border border-slate-800 bg-[#1b1b26] px-3 py-3 text-sm focus:border-[#327bf5] focus:outline-none focus:ring-4 focus:ring-[#327bf5]/15 text-white"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id} className="bg-[#1b1b26] text-white">
                    {account.displayName || account.accountNumber}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="account-display-name" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                Názov účtu
              </label>
              <input
                id="account-display-name"
                value={accountDisplayName}
                onChange={(event) => setAccountDisplayName(event.target.value)}
                maxLength={60}
                className="w-full rounded-xl border border-slate-800 bg-[#1b1b26] px-3 py-3 text-sm focus:border-[#327bf5] focus:outline-none focus:ring-4 focus:ring-[#327bf5]/15 text-white placeholder-slate-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                Počet platieb / mesiac: {transactionsPerMonth}
              </label>
              <input
                type="range"
                min={10}
                max={30}
                value={transactionsPerMonth}
                onChange={(event) => setTransactionsPerMonth(Number(event.target.value))}
                className="w-full accent-[#327bf5]"
              />
            </div>

            <div>
              <label htmlFor="average-monthly-turnover" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                Priemerný obrat / mesiac (EUR)
              </label>
              <input
                id="average-monthly-turnover"
                type="number"
                min={100}
                max={500000}
                step={100}
                value={averageMonthlyTurnover}
                onChange={(event) => setAverageMonthlyTurnover(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-800 bg-[#1b1b26] px-3 py-3 text-sm focus:border-[#327bf5] focus:outline-none focus:ring-4 focus:ring-[#327bf5]/15 text-white placeholder-slate-400"
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Mix platieb</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['mix-outgoing', 'Odhádzajúce (70%)', mixOutgoing, setMixOutgoing],
                  ['mix-incoming', 'Prichádzajúce (20%)', mixIncoming, setMixIncoming],
                  ['mix-topup', 'Dobitie (10%)', mixTopup, setMixTopup],
                ].map(([id, label, checked, setter]) => (
                  <label
                    key={id as string}
                    className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#1b1b26] px-3 py-2 text-sm text-slate-200 hover:bg-[#1b1b26]/50 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked as boolean}
                      onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                      className="accent-[#327bf5]"
                    />
                    {label as string}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-[#1b1b26] px-3 py-3 text-sm text-slate-200 cursor-pointer hover:bg-[#1b1b26]/55 transition-colors">
              <input
                type="checkbox"
                checked={persistToDatabase}
                onChange={(event) => setPersistToDatabase(event.target.checked)}
                className="mt-0.5 accent-[#327bf5]"
              />
              <span>
                Uložiť vygenerované transakcie do databázy
                <span className="mt-1 block text-xs text-slate-400">
                  Predvolene sa generuje iba náhľad bez zápisu do účtu.
                </span>
              </span>
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-900/20 border border-red-500/20 px-3 py-2 text-sm font-semibold text-red-400">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading || !accountId}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#327bf5] text-sm font-bold text-white transition-all hover:bg-blue-600 shadow-lg shadow-blue-900/30 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {loading ? 'Generujem výpisy…' : 'Vygenerovať 3 výpisy'}
          </button>
        </div>

        {statements.length > 0 && (
          <section className="mt-6 rounded-3xl border border-slate-800/40 bg-[#0a0a10]/50 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-white">Výsledky</h2>
              <button
                type="button"
                onClick={downloadZip}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-[#1b1b26] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#1b1b26]/70"
              >
                <Download className="h-4 w-4 text-[#327bf5]" />
                Stiahnuť ZIP
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {statements.map((statement) => (
                <button
                  key={statement.month}
                  type="button"
                  onClick={() => openStatement(statement)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#1b1b26] px-4 py-3 text-left transition-colors hover:bg-[#1b1b26]/60"
                >
                  <span className="text-sm font-semibold text-white">
                    Otvoriť výpis – {formatMonthLabel(statement.month)}
                  </span>
                  <FileText className="h-4 w-4 text-[#327bf5]" />
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}