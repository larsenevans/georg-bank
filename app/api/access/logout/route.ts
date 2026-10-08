import { NextRequest, NextResponse } from 'next/server'
import { ACCESS_COOKIE } from '@/lib/access-flow'
import { endSession, readAccessCookieToken } from '@/lib/access-session'

function clearAccessCookie(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function POST(request: NextRequest) {
  const token =
    request.cookies?.get(ACCESS_COOKIE)?.value ||
    (await readAccessCookieToken().catch(() => null))
  if (token) {
    try {
      await endSession(token)
    } catch (err) {
      console.warn('[access/logout] endSession failed:', err)
    }
  }

  const accept = request.headers.get('accept') || ''
  const wantsJson =
    accept.includes('application/json') ||
    request.headers.get('x-requested-with') === 'XMLHttpRequest'

  if (wantsJson) {
    const res = NextResponse.json(
      { ok: true, redirect: '/' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
    clearAccessCookie(res)
    return res
  }

  const homeUrl = new URL('/', request.url)
  const res = NextResponse.redirect(homeUrl)
  clearAccessCookie(res)
  return res
}

export async function GET(request: NextRequest) {
  return POST(request)
}