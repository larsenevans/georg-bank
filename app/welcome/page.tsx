import { Suspense } from 'react'
import { WelcomeScreen } from '@/components/welcome-screen'

export const metadata = {
  title: 'George – vstupný kód',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

function WelcomeFallback() {
  return (
    <div className="min-h-dvh bg-[#030305] flex items-center justify-center text-slate-400 text-sm">
      Načítavam…
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<WelcomeFallback />}>
      <WelcomeScreen />
    </Suspense>
  )
}
