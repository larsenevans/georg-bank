import { APP_PIN_COOKIE, APP_PIN_TOKEN, isValidAppPin } from '@/lib/app-pin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { pin?: unknown } | null
  const pin = typeof body?.pin === 'string' ? body.pin : ''

  if (!isValidAppPin(pin)) {
    return NextResponse.json({ error: 'invalid_pin' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(APP_PIN_COOKIE, APP_PIN_TOKEN, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
