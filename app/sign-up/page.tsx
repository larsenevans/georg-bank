import { Suspense } from 'react'
import { AuthForm } from '@/components/auth-form'

export const metadata = {
  title: 'George – registrácia – Slovenská sporiteľňa, a.s.',
  description: 'Zaregistrujte sa do nového Internetbankingu Slovenskej sporiteľne.',
}

function SignUpFallback() {
  return (
    <div className="min-h-dvh bg-[#030305] flex items-center justify-center text-slate-400 text-sm">
      Načítavam…
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpFallback />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  )
}
