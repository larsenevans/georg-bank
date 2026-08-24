'use client'

import { useTranslation } from '@/components/providers/translation-provider'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const guestUnavailable = searchParams.get('guest') === 'unavailable'
  const t = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'credentials' | 'safe-login'>('credentials')
  const [rememberDevice, setRememberDevice] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Ostránené: Už povolená registrácia viacerých účtov pre testovanie prevodov.

    try {
      const submittedEmail = email.trim()
      const submittedPassword = password
      const authEmail = submittedEmail.includes('@') ? submittedEmail : `${submittedEmail}@local.test`
      const authPassword = submittedPassword

      // Attempt sign-in / sign-up
      let result = isSignUp
        ? await authClient.signUp.email({ email: authEmail, password: authPassword, name: name || 'Peter' })
        : await authClient.signIn.email({ email: authEmail, password: authPassword })

      // Local/dev only: auto-create the account on a fresh DB.
      // Never do this in production — it masks "wrong password" and can
      // create accounts that guest sync later overwrites.
      if (
        result.error &&
        !isSignUp &&
        process.env.NODE_ENV === 'development'
      ) {
        const signUpResult = await authClient.signUp.email({
          email: authEmail,
          password: authPassword,
          name: 'Peter',
        })
        if (!signUpResult.error) {
          result = await authClient.signIn.email({ email: authEmail, password: authPassword })
        }
      }

      setLoading(false)

      if (result.error) {
        setError(result.error.message ?? 'Niekde nastala chyba.')
        return
      }

      if (typeof window !== 'undefined' && localStorage.getItem('skip_safe_login') === 'true') {
        router.push('/')
        router.refresh()
      } else {
        setStep('safe-login')
      }
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Niekde nastala chyba.')
    }
  }

  const handleFinalize = () => {
    if (rememberDevice) {
      localStorage.setItem('skip_safe_login', 'true')
    }
    router.push('/')
    router.refresh()
  }

  if (step === 'safe-login') {
    return (
      <div className="min-h-dvh bg-[#030305] text-slate-100 flex flex-col font-sans items-center justify-center px-6 relative overflow-hidden">
        {/* Glow Blobs */}
        <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-purple-900/10 rounded-full accent-glow pointer-events-none z-0"></div>
        <div className="fixed bottom-1/4 left-1/3 w-[350px] h-[350px] bg-blue-900/10 rounded-full accent-glow pointer-events-none z-0"></div>

        <div className="w-full max-w-[400px] george-card glow-purple rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-10 flex flex-col items-center">
          {/* Large George Logo */}
          <div className="logo mb-8 ml-auto mr-auto scale-110"></div>

          {/* Heading */}
          <h1 className="text-[20px] font-bold text-white leading-snug mb-5 text-center tracking-tight">
            {t.auth.safeLoginSubtitle.split(' ').slice(0, 4).join(' ')}<br />{t.auth.safeLoginSubtitle.split(' ').slice(4).join(' ')}
          </h1>

          {/* Description */}
          <p className="text-slate-300 text-[14px] leading-relaxed mb-6 text-center">
            Nie je potrebné, aby ste použili ďalší bezpečnostný predmet.<br />
            <Link href="#" className="text-[#327bf5] hover:underline font-semibold inline-block mt-2">
              Ako funguje prihlásenie?
            </Link>
          </p>

          {/* Checkbox Card */}
          <div className="w-full bg-[#1b1b26] border border-slate-800 rounded-xl p-4 mb-6 text-left flex items-start gap-3">
            <input
              id="remember-device"
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="w-5 h-5 rounded border-slate-750 text-[#327bf5] focus:ring-[#327bf5] mt-0.5 cursor-pointer accent-[#327bf5]"
            />
            <label htmlFor="remember-device" className="text-[13px] text-slate-300 font-semibold leading-snug cursor-pointer select-none">
              {t.auth.rememberDevice}
            </label>
          </div>

          <Button
            className="w-full bg-[#327bf5] hover:bg-blue-600 text-white text-[14px] font-bold h-12 rounded-xl shadow-lg shadow-blue-900/30 active:scale-[0.98] transition-all"
            onClick={handleFinalize}
          >
            {t.auth.continueButton}
          </Button>
        </div>

        <div className="mt-8 text-center text-xs text-slate-400 z-10">
          Uistite sa, že ste v aplikácii George potvrdili prihlásenie.
        </div>
      </div>
    )
  }

  if (mode === 'sign-in' && step === 'credentials') {
    return (
      <div className="min-h-dvh bg-[#030305] flex items-center justify-center font-sans text-slate-100 px-6 relative overflow-hidden">
        {/* Glow Blobs */}
        <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-purple-900/10 rounded-full accent-glow pointer-events-none z-0"></div>
        <div className="fixed bottom-1/4 left-1/3 w-[350px] h-[350px] bg-blue-900/10 rounded-full accent-glow pointer-events-none z-0"></div>

        <div className="w-full max-w-[400px] george-card glow-purple rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-10">
          <div className="logo mb-8 ml-auto mr-auto scale-110"></div>
          {guestUnavailable && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/20 text-amber-100 text-xs font-semibold rounded-xl p-3">
              Automatické prihlásenie hosta nie je dostupné. Prihláste sa prosím manuálne.
            </div>
          )}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t.auth.emailPlaceholder}</label>
              <input
                id="email"
                name="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 h-12 bg-[#1b1b26] border border-slate-800 focus:border-[#327bf5] rounded-xl text-white focus:outline-none transition-all duration-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t.auth.passwordPlaceholder}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 h-12 bg-[#1b1b26] border border-slate-800 focus:border-[#327bf5] rounded-xl text-white focus:outline-none transition-all duration-200"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-semibold rounded-xl p-3 flex items-center gap-2 mt-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-[18px] h-[18px] shrink-0">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                  <path d="M12 8v4m0 4h.01" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#327bf5] hover:bg-blue-600 text-white font-bold rounded-xl transition-all duration-200 active:scale-[0.98] mt-2 shadow-lg shadow-blue-900/30 focus-visible:ring-2 focus-visible:ring-[#327bf5]"
            >
              {loading ? t.auth.loggingInButton : t.auth.continueButton}
            </Button>
          </form>

          <div className="flex flex-col items-center gap-3 mt-5 text-[13px]">
            <Link href="/sign-up" className="text-[#327bf5] hover:underline font-semibold transition-colors">
              {t.auth.noAccountText}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#030305] flex flex-col font-sans text-slate-100 relative overflow-hidden">
      {/* Glow Blobs */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-purple-900/10 rounded-full accent-glow pointer-events-none z-0"></div>
      <div className="fixed bottom-1/4 left-1/3 w-[350px] h-[350px] bg-blue-900/10 rounded-full accent-glow pointer-events-none z-0"></div>

      <header className="flex justify-end p-4 relative z-10">
        <button
          onClick={() => alert('Získal si free point!')}
          className="absolute top-4 left-4 w-4 h-4 rounded-full bg-transparent hover:bg-blue-500/20 cursor-pointer"
          aria-label="Secret Free Point"
        />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20 z-10">
        <div className="w-full max-w-[400px] george-card glow-purple rounded-3xl p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
          <div className="logo mb-8 ml-auto mr-auto scale-110"></div>
          
          <h1 className="text-xl font-bold text-white mb-6 text-center tracking-tight">
            {isSignUp ? t.auth.signUpTitle : t.auth.signInTitle}
          </h1>

          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
            {isSignUp && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Meno a priezvisko</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="w-full px-4 h-12 bg-[#1b1b26] border border-slate-800 focus:border-[#327bf5] rounded-xl text-white focus:outline-none transition-all"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t.auth.emailPlaceholder}</label>
              <input
                id="email"
                name="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 h-12 bg-[#1b1b26] border border-slate-800 focus:border-[#327bf5] rounded-xl text-white focus:outline-none transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t.auth.passwordPlaceholder}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 h-12 bg-[#1b1b26] border border-slate-800 focus:border-[#327bf5] rounded-xl text-white focus:outline-none transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-semibold rounded-xl p-3 flex items-center gap-2 mt-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-[18px] h-[18px] shrink-0">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                  <path d="M12 8v4m0 4h.01" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#327bf5] hover:bg-blue-600 text-white font-bold rounded-xl transition-all duration-200 active:scale-[0.98] mt-2 shadow-lg shadow-blue-900/30 focus-visible:ring-2 focus-visible:ring-[#327bf5]"
            >
              {loading
                ? (isSignUp ? t.auth.registeringButton : t.auth.loggingInButton)
                : (isSignUp ? t.auth.registerLink : t.auth.loginLink)}
            </Button>
          </form>

          <div className="flex flex-col items-center gap-3 mt-5 text-[13px]">
            <Link href={isSignUp ? '/sign-in' : '/sign-up'} className="text-[#327bf5] hover:underline font-semibold transition-colors">
              {isSignUp ? t.auth.hasAccountText : t.auth.noAccountText}
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-[#0a0a10] border-t border-slate-900/40 text-slate-400 px-6 py-4 flex items-center justify-between text-xs font-medium z-10">
        <div className="logo h-6 w-auto object-contain filter brightness-75"></div>
        <Link href="#" className="hover:text-white transition-colors">
          Kontakty
        </Link>
      </footer>
    </div>
  )
}
