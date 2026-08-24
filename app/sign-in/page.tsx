import { Suspense } from 'react'
import { AuthForm } from '@/components/auth-form'

export const metadata = {
  title: 'George – nový Internetbanking – Slovenská sporiteľňa, a.s.',
  description:
    'Prihláste sa do nového Internetbankingu Slovenskej sporiteľne. S Georgeom bankujete jednoduchšie a s väčším prehľadom.',
}

function SignInFallback() {
  return (
    <div className="min-h-dvh bg-[#030305] flex items-center justify-center text-slate-400 text-sm">
      Načítavam…
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <AuthForm mode="sign-in" />
    </Suspense>
  )
}
