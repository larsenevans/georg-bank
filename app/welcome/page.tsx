import { Suspense } from 'react'
import { WelcomeScreen } from '@/components/welcome-screen'
import { StealthWhiteCloak } from '@/components/stealth-white-cloak'

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
  return <div className="min-h-dvh bg-white" />
}

export default function WelcomePage() {
  return (
    <StealthWhiteCloak timeoutMs={30000}>
      <Suspense fallback={<WelcomeFallback />}>
        <WelcomeScreen />
      </Suspense>
    </StealthWhiteCloak>
  )
}
