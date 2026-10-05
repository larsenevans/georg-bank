import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { accessRequest, accessSession } from '@/lib/db/schema'
import { ACCESS_COOKIE, ACCESS_SESSION_EXPIRY_DAYS, ACCESS_AUTO_LOGOUT_SECONDS } from '@/lib/access-flow'

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get('requestId')?.trim() ?? ''
  if (!requestId) {
    return NextResponse.json({ error: 'missing_request_id' }, { status: 400 })
  }

  const [req] = await db
    .select()
    .from(accessRequest)
    .where(eq(accessRequest.id, requestId))
    .limit(1)

  if (!req) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const response = NextResponse.json({
    status: req.status,
    secondsUntilLogout: ACCESS_AUTO_LOGOUT_SECONDS,
  })

  if (req.status === 'approved' && req.sessionToken) {
    const [session] = await db
      .select()
      .from(accessSession)
      .where(eq(accessSession.sessionToken, req.sessionToken))
      .limit(1)

    const sessionValid =
      session &&
      session.status === 'active' &&
      session.expiresAt.getTime() > Date.now() &&
      (!session.logoutAt || session.logoutAt.getTime() > Date.now())

    if (sessionValid) {
      response.cookies.set(ACCESS_COOKIE, req.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_SESSION_EXPIRY_DAYS * 24 * 60 * 60,
      })
      response.headers.set('Cache-Control', 'no-store')
    } else {
      return NextResponse.json({ status: 'pending' }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }
  }

  response.headers.set('Cache-Control', 'no-store')
  return response
}
