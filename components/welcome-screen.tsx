'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const CODE_LENGTH = 16
const POLL_INTERVAL_MS = 2500

type Phase = 'input' | 'submitting' | 'pending'

export function WelcomeScreen() {
  const [digits, setDigits] = useState<string>('')
  const [phase, setPhase] = useState<Phase>('input')
  const [toast, setToast] = useState<{ visible: boolean; message: string; ok: boolean }>({
    visible: false,
    message: '',
    ok: true,
  })
  const [remainingRequests, setRemainingRequests] = useState<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isComplete = digits.length === CODE_LENGTH
  const canSubmit = isComplete && (phase === 'input' || phase === 'pending')

  const playTapTone = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(160, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.032)
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.032)
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.032)
    } catch {
      // audio restricted – silent fallback
    }
  }, [])

  const showToast = useCallback((message: string, ok: boolean) => {
    setToast({ visible: true, message, ok })
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2500)
  }, [])

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => clearPolling, [clearPolling])

  const checkStatusOnce = useCallback(
    async (requestId: string) => {
      try {
        const res = await fetch(`/api/access/status?requestId=${encodeURIComponent(requestId)}`, {
          cache: 'no-store',
        })
        if (!res.ok) return false
        const data = (await res.json()) as { status?: string }
        if (data.status === 'approved') {
          clearPolling()
          sessionStorage.removeItem('pending_access_request_id')
          showToast('Prístup schválený!', true)
          // Použijeme window.location.href pre spoľahlivé odoslanie HttpOnly cookie na mobiloch
          window.location.href = '/dashboard2'
          return true
        } else if (data.status === 'rejected') {
          clearPolling()
          sessionStorage.removeItem('pending_access_request_id')
          setPhase('input')
          setDigits('')
          showToast('Kód zamietnutý. Skúste to znova.', false)
          return true
        }
      } catch {
        // keep polling
      }
      return false
    },
    [clearPolling, showToast],
  )

  const startPolling = useCallback(
    (requestId: string) => {
      clearPolling()
      sessionStorage.setItem('pending_access_request_id', requestId)

      // Spustíme interval
      pollRef.current = setInterval(() => {
        checkStatusOnce(requestId)
      }, POLL_INTERVAL_MS)

      // Okamžitá kontrola pri návrate z aplikácie e-mailu na telefóne
      const onWake = () => {
        if (document.visibilityState === 'visible') {
          checkStatusOnce(requestId)
        }
      }
      document.addEventListener('visibilitychange', onWake)
      window.addEventListener('focus', onWake)
    },
    [clearPolling, checkStatusOnce],
  )

  // Obnovenie pollingu po načítaní stránky, ak čakáme na schválenie
  useEffect(() => {
    const savedReqId = sessionStorage.getItem('pending_access_request_id')
    if (savedReqId && phase === 'input') {
      setPhase('pending')
      startPolling(savedReqId)
      checkStatusOnce(savedReqId)
    }
  }, [phase, startPolling, checkStatusOnce])

  const pressDigit = (digit: string) => {
    if (phase === 'submitting' || phase === 'pending') return
    if (digits.length >= CODE_LENGTH) return
    playTapTone()
    setDigits((prev) => prev + digit)
  }

  const backspace = () => {
    if (phase === 'submitting' || phase === 'pending') return
    if (digits.length === 0) return
    playTapTone()
    setDigits((prev) => prev.slice(0, -1))
  }

  const clearInput = () => {
    if (phase === 'submitting' || phase === 'pending') return
    if (digits.length === 0) return
    playTapTone()
    setDigits('')
  }

  const submit = useCallback(async () => {
    if (digits.length !== CODE_LENGTH || phase === 'submitting' || phase === 'pending') return
    setPhase('submitting')
    try {
      const res = await fetch('/api/access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: digits }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        requestId?: string
        remainingRequests?: number
        message?: string
      }
      if (res.ok && data.requestId) {
        setRemainingRequests(data.remainingRequests ?? null)
        setPhase('pending')
        showToast('Žiadosť odoslaná, čaká na schválenie…', true)
        startPolling(data.requestId)
      } else if (res.status === 429) {
        setPhase('input')
        showToast(data.message ?? 'Príliš veľa pokusov. Skúste to neskôr.', false)
      } else {
        setPhase('input')
        showToast(data.message ?? 'Neplatný kód. Zadajte presne 16 číslic.', false)
      }
    } catch {
      setPhase('input')
      showToast('Chyba spojenia. Skúste to znova.', false)
    }
  }, [digits, phase, showToast, startPolling])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        pressDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        backspace()
      } else if (e.key === 'Enter' && digits.length === CODE_LENGTH) {
        e.preventDefault()
        submit()
      } else if (e.key === 'Escape') {
        clearInput()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const formattedDigits = (digits.match(/.{1,4}/g) || []).join(' ')

  const KEYS: Array<{ digit: string; letters?: string }> = [
    { digit: '1' },
    { digit: '2', letters: 'A B C' },
    { digit: '3', letters: 'D E F' },
    { digit: '4', letters: 'G H I' },
    { digit: '5', letters: 'J K L' },
    { digit: '6', letters: 'M N O' },
    { digit: '7', letters: 'P Q R S' },
    { digit: '8', letters: 'T U V' },
    { digit: '9', letters: 'W X Y Z' },
  ]

  return (
    <div
      className="flex justify-center items-center select-none bg-black"
      style={{ height: '100dvh', overflow: 'hidden', touchAction: 'manipulation' }}
    >
      <div className="relative w-full max-w-105 h-full flex flex-col justify-between bg-[#737373] overflow-hidden shadow-2xl">
        {/* Toast */}
        <div
          className={`absolute top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 w-[90%] max-w-85 ${
            toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-20 pointer-events-none'
          }`}
        >
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white ${
              toast.ok ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {toast.ok ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              )}
            </svg>
            <span data-testid="toast-message">{toast.message}</span>
          </div>
        </div>

        {/* Upper section */}
        <div className="px-5 pt-6 pb-2 flex-1 flex flex-col justify-between min-h-0 overflow-hidden antialiased">
          <div className="flex flex-col">
            <h1 className="text-[32px] font-bold text-black leading-tight tracking-[-0.03em]">
              Prístup
            </h1>
            <p className="text-[16px] font-semibold text-[#242528] mt-0.5">
              {phase === 'pending' ? 'Čaká sa na schválenie' : 'Zadaj 16-miestny kód'}
            </p>
            <p className="text-[16px] font-semibold text-[#111215] mt-2.5 tracking-tight">
              {phase === 'pending'
                ? 'Správca overuje váš prístupový kód'
                : 'Kód schvaľuje správca aplikácie'}
            </p>
            {remainingRequests !== null && (
              <p className="text-[12.5px] font-medium text-[#1c1d20] mt-1.5" data-testid="remaining-requests">
                Zostávajúce pokusy: {remainingRequests}
              </p>
            )}
          </div>

          {/* Maroon viewfinder (pixel-perfect 1:1 match) */}
          <div className="flex-1 min-h-0 flex items-center justify-center py-2">
            <div className="w-full max-w-47 aspect-square rounded-[24px] bg-[#5c0e0e] shadow-[0_8px_24px_rgba(0,0,0,0.25)] border border-black/10 pointer-events-none transition-all" />
          </div>
        </div>

        {/* Bottom container */}
        <div className="w-full shrink-0 flex flex-col z-20">
          {/* White bottom sheet */}
          <div className="w-full bg-white rounded-t-[26px] shadow-[0_-6px_25px_rgba(0,0,0,0.18)] px-5 pt-4 pb-3 flex flex-col antialiased">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-[21px] font-bold text-black tracking-[-0.02em]">
                {phase === 'pending' ? 'Žiadosť odoslaná' : 'Zadať kód ručne'}
              </h2>
              <button
                type="button"
                onClick={clearInput}
                aria-label="Vymazať zadaný kód"
                className="w-8 h-8 rounded-full flex items-center justify-center text-black active:opacity-40 transition-opacity cursor-pointer"
              >
                <svg className="w-5 h-5 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 16-digit input box */}
            <div
              className="relative w-full h-15 bg-white border border-[#bcbcc0] focus-within:border-black rounded-[14px] px-3.5 pt-1.5 pb-1 flex flex-col justify-center cursor-text transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              data-testid="code-input-box"
            >
              <span className="text-[12.5px] text-[#636366] font-medium leading-tight select-none">
                Zadaj 16-miestny kód
              </span>
              <div className="flex items-center h-6 mt-0.5 overflow-hidden">
                <span
                  className="text-[18px] font-semibold tracking-[0.09em] text-black select-none font-mono"
                  data-testid="digits-text"
                >
                  {formattedDigits}
                </span>
                <span
                  className={`inline-block w-0.5 h-5 bg-black ml-px ${
                    digits.length < CODE_LENGTH ? 'animate-[cursorBlink_1.1s_step-end_infinite]' : 'opacity-0'
                  }`}
                />
              </div>
            </div>

            {/* Submit button */}
            <div className="pt-2.5">
              {phase === 'pending' ? (
                <button
                  type="button"
                  onClick={() => {
                    clearPolling()
                    setDigits('')
                    setPhase('input')
                  }}
                  className="w-full h-12 rounded-[14px] font-semibold text-[16.5px] flex items-center justify-center bg-[#e5e5ea] text-[#1c1c1e] hover:bg-[#dcdce0] active:scale-[0.99] transition-all cursor-pointer select-none"
                  data-testid="cancel-request"
                >
                  Zrušiť a zadať nový kód
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  data-testid="submit-code"
                  className={`w-full h-12 rounded-[14px] font-semibold text-[16.5px] flex items-center justify-center transition-all select-none ${
                    canSubmit
                      ? 'bg-black text-white hover:bg-[#1a1a1a] cursor-pointer active:scale-[0.99] shadow-md'
                      : 'bg-[#e5e5ea] text-[#8e8e93] cursor-not-allowed'
                  }`}
                >
                  {phase === 'submitting' ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Požiadať o prístup'
                  )}
                </button>
              )}
            </div>
          </div>

          {/* iOS numeric keyboard */}
          <div className="w-full bg-[#d0d3d9] px-1.5 pt-1.5 pb-4 antialiased">
            <div className="grid grid-cols-3 gap-1.5 max-w-97.5 mx-auto">
              {KEYS.map((key) => (
                <button
                  key={key.digit}
                  type="button"
                  onClick={() => pressDigit(key.digit)}
                  data-testid={`key-${key.digit}`}
                  className="h-11.75 bg-white rounded-[7px] shadow-[0_1.5px_0_rgba(0,0,0,0.35)] flex flex-col items-center justify-center active:bg-[#b0b4ba] active:scale-[0.96] transition-all cursor-pointer"
                >
                  <span className="text-[26px] font-normal text-black leading-none">{key.digit}</span>
                  {key.letters ? (
                    <span className="text-[9.5px] font-bold tracking-[0.18em] text-black leading-none uppercase -mt-0.5">
                      {key.letters}
                    </span>
                  ) : (
                    <span className="h-1.75" />
                  )}
                </button>
              ))}

              <div className="h-11.75" />

              <button
                type="button"
                onClick={() => pressDigit('0')}
                data-testid="key-0"
                className="h-11.75 bg-white rounded-[7px] shadow-[0_1.5px_0_rgba(0,0,0,0.35)] flex flex-col items-center justify-center active:bg-[#b0b4ba] active:scale-[0.96] transition-all cursor-pointer"
              >
                <span className="text-[26px] font-normal text-black leading-none">0</span>
                <span className="h-1" />
              </button>

              <button
                type="button"
                onClick={backspace}
                aria-label="Zmazať číslicu"
                data-testid="key-backspace"
                className="h-11.75 flex items-center justify-center text-black active:opacity-35 active:scale-[0.92] transition-all cursor-pointer"
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.5-7.5H20a2 2 0 012 2v11a2 2 0 01-2 2H9.5L3 12z"
                  />
                </svg>
              </button>
            </div>

            <div className="w-36 h-[4.5px] bg-black/85 rounded-full mx-auto mt-2.5" />
          </div>
        </div>

        <style>{`
          @keyframes cursorBlink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  )
}
