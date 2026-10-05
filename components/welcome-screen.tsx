'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

const CODE_LENGTH = 16
const POLL_INTERVAL_MS = 5000

type Phase = 'input' | 'submitting' | 'pending' | 'error'

export function WelcomeScreen() {
  const router = useRouter()
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [phase, setPhase] = useState<Phase>('input')
  const [errorMessage, setErrorMessage] = useState('')
  const [remainingRequests, setRemainingRequests] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const filledCount = digits.filter((d) => d !== '').length
  const code = digits.join('')

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => clearPolling, [clearPolling])

  const startPolling = useCallback(
    (id: string) => {
      clearPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/access/status?requestId=${encodeURIComponent(id)}`, {
            cache: 'no-store',
          })
          if (!res.ok) return
          const data = (await res.json()) as { status?: string }
          if (data.status === 'approved') {
            clearPolling()
            router.push('/dashboard2')
          } else if (data.status === 'rejected') {
            clearPolling()
            setPhase('error')
            setErrorMessage('Kód zamietnutý. Skúste to znova s novým kódom.')
            setDigits(Array(CODE_LENGTH).fill(''))
          }
        } catch {
          // keep polling
        }
      }, POLL_INTERVAL_MS)
    },
    [clearPolling, router],
  )

  const pressDigit = (digit: string) => {
    if (phase === 'submitting' || phase === 'pending') return
    setPhase('input')
    setErrorMessage('')
    setDigits((prev) => {
      const idx = prev.findIndex((d) => d === '')
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = digit
      return next
    })
  }

  const backspace = () => {
    if (phase === 'submitting' || phase === 'pending') return
    setDigits((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i] !== '') {
          next[i] = ''
          break
        }
      }
      return next
    })
  }

  const submit = async () => {
    if (filledCount !== CODE_LENGTH || phase === 'submitting' || phase === 'pending') return
    setPhase('submitting')
    setErrorMessage('')
    try {
      const res = await fetch('/api/access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        requestId?: string
        remainingRequests?: number
        message?: string
      }
      if (res.ok && data.requestId) {
        setRemainingRequests(data.remainingRequests ?? null)
        setPhase('pending')
        startPolling(data.requestId)
      } else if (res.status === 429) {
        setPhase('error')
        setErrorMessage(data.message ?? 'Príliš veľa pokusov. Skúste to neskôr.')
      } else {
        setPhase('error')
        setErrorMessage(data.message ?? 'Neplatný kód. Zadajte presne 16 číslic.')
      }
    } catch {
      setPhase('error')
      setErrorMessage('Chyba spojenia. Skúste to znova.')
    }
  }

  const groups = [0, 1, 2, 3].map((g) => digits.slice(g * 4, g * 4 + 4))

  return (
    <div className="min-h-dvh bg-[#030305] text-white flex flex-col items-center px-4 py-8 select-none">
      <div className="w-full max-w-sm flex-1 flex flex-col">
        <div className="text-center mt-4 mb-6">
          <p className="text-xs text-slate-500 tracking-widest mb-2">GEORGE</p>
          <h1 className="text-xl font-semibold text-white mb-2">Vitajte</h1>
          <p className="text-sm text-slate-400">
            Zadajte 16-miestny prístupový kód. Prístup schvaľuje administrátor.
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-8 flex-wrap" data-testid="code-display">
          {groups.map((group, gi) => (
            <div
              key={gi}
              className="flex gap-1.5 bg-[#171821] rounded-xl px-3 py-2.5"
              data-testid={`code-group-${gi}`}
            >
              {group.map((d, di) => (
                <div
                  key={di}
                  className={`w-2.5 h-2.5 rounded-full border-2 transition-all duration-150 ${
                    d !== '' ? 'bg-[#327bf5] border-[#327bf5] scale-110' : 'border-slate-700'
                  }`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="text-center mb-6 min-h-10">
          {phase === 'pending' && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-300" data-testid="pending-state">
              <Loader2 className="w-4 h-4 animate-spin" />
              Žiadosť odoslaná, čaká na schválenie…
            </div>
          )}
          {phase === 'error' && errorMessage && (
            <p className="text-sm text-red-400" data-testid="error-state">
              {errorMessage}
            </p>
          )}
          {phase !== 'pending' && remainingRequests !== null && (
            <p className="text-xs text-slate-600">Zostávajúce pokusy: {remainingRequests}</p>
          )}
        </div>

        {phase !== 'pending' && (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3 max-w-65 w-full mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => pressDigit(num)}
                data-testid={`key-${num}`}
                className="w-14 h-14 mx-auto rounded-full text-lg font-bold flex items-center justify-center bg-[#171821] hover:bg-[#1d1e2b] active:scale-90 transition-all cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              onClick={submit}
              disabled={filledCount !== CODE_LENGTH || phase === 'submitting'}
              data-testid="submit-code"
              className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center text-2xl transition-all ${
                filledCount === CODE_LENGTH
                  ? 'bg-[#327bf5] text-white cursor-pointer active:scale-90'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              aria-label="Odoslať kód"
            >
              ➤
            </button>
            <button
              onClick={() => pressDigit('0')}
              data-testid="key-0"
              className="w-14 h-14 mx-auto rounded-full text-lg font-bold flex items-center justify-center bg-[#171821] hover:bg-[#1d1e2b] active:scale-90 transition-all cursor-pointer"
            >
              0
            </button>
            <button
              onClick={backspace}
              data-testid="key-backspace"
              className="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 active:scale-90 transition-all cursor-pointer"
              aria-label="Zmazať"
            >
              ⌫
            </button>
          </div>
        )}

        {phase === 'pending' && (
          <button
            onClick={() => {
              clearPolling()
              setDigits(Array(CODE_LENGTH).fill(''))
              setPhase('input')
            }}
            className="mt-4 mx-auto block text-sm text-slate-400 hover:text-slate-200 underline cursor-pointer"
            data-testid="cancel-request"
          >
            Zrušiť a zadať nový kód
          </button>
        )}
      </div>
    </div>
  )
}
