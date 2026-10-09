import { Suspense } from 'react'
import { WelcomeScreen } from '@/components/welcome-screen'

export const metadata = {
  title: 'George – prístupový kód',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  },
}

function WelcomeFallback() {
  return (
    <div className="min-h-dvh bg-black flex items-center justify-center text-slate-400 text-sm">
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
