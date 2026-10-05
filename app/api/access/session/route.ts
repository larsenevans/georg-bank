import { NextResponse } from 'next/server'
import { ACCESS_COOKIE, getAccessEnabled } from '@/lib/access-flow'
import {
  getActiveAccessSession,
  readAccessCookieToken,
} from '@/lib/access-session'

export async function GET() {
  if (!getAccessEnabled()) {
    return NextResponse.json(
      { logoutAt: null, transactionUsed: false, pdfGenerated: false, disabled: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const token = await readAccessCookieToken()
  const session = await getActiveAccessSession(token)

  if (!session) {
    const res = NextResponse.json(
      { logoutAt: null, transactionUsed: false, pdfGenerated: false, error: 'no_session' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
    if (token) {
      res.cookies.set(ACCESS_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      })
    }
    return res
  }

  return NextResponse.json(
    {
      logoutAt: session.logoutAt ? session.logoutAt.toISOString() : null,
      transactionUsed: session.transactionUsed,
      pdfGenerated: session.pdfGenerated,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}