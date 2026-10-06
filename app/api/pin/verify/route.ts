import { APP_PIN_COOKIE, APP_PIN_TOKEN, isValidAppPin } from '@/lib/app-pin'
import { applyLoginSessionBalance } from '@/lib/random-balance-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { pin?: unknown; biometrics?: unknown } | null
  const pin = typeof body?.pin === 'string' ? body.pin : ''
  const isBiometrics = body?.biometrics === true

  if (!isBiometrics && !isValidAppPin(pin)) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 })
  }

  // 1. Generate random balance in range [4 675.45, 15 873.20] EUR
  // 2. Update DB bankAccount balance
  // 3. Reset accessSession.transactionUsed = false so user has 1 fresh allowed payment
  const { balanceEur, balanceCents } = await applyLoginSessionBalance()

  const response = NextResponse.json({ ok: true, balanceEur, balanceCents })
  response.cookies.set(APP_PIN_COOKIE, APP_PIN_TOKEN, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
