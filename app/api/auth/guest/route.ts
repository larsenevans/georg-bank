import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { resolveDatabaseUrl } from '@/lib/db/resolve-database-url'
import {
  GUEST_BOOTSTRAP_SKIP_COOKIE,
  ensureGuestCredentialAccount,
  getGuestConfig,
} from '@/lib/guest-auth'
import { NextRequest, NextResponse } from 'next/server'

function copyAuthCookies(source: Response, target: NextResponse) {
  if (typeof source.headers.getSetCookie === 'function') {
    for (const cookie of source.headers.getSetCookie()) {
      target.headers.append('Set-Cookie', cookie)
    }
    return
  }

  const setCookie = source.headers.get('set-cookie')
  if (setCookie) {
    target.headers.set('set-cookie', setCookie)
  }
}

/**
 * Better Auth dynamic baseURL needs host / x-forwarded-* from the real request.
 * Stripping to cookie+origin alone breaks resolution on Vercel aliases.
 */
function serverAuthHeaders(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('origin', request.nextUrl.origin)
  headers.set('content-type', 'application/json')
  if (!headers.get('host')) {
    headers.set('host', request.nextUrl.host)
  }
  return headers
}

function publicOrigin(request: NextRequest) {
  const configured =
    process.env.ACCESS_BASE_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim()
  if (configured) {
    return new URL(configured).origin
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`
  }

  return request.nextUrl.origin
}

function redirectTarget(request: NextRequest, path: string) {
  const origin = publicOrigin(request)
  if (!path.startsWith('/') || path.startsWith('//')) {
    return new URL('/dashboard2', origin)
  }

  return new URL(path, origin)
}

async function probeDatabase(): Promise<{ ok: boolean; detail: string }> {
  const resolved = resolveDatabaseUrl()
  if (!resolved) {
    return {
      ok: false,
      detail: 'database_unconfigured',
    }
  }
  try {
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
    } finally {
      client.release()
    }
    return { ok: true, detail: 'ok' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[guest-auth] database probe failed:', message)
    return { ok: false, detail: 'database_unreachable' }
  }
}

function guestFailureRedirect(request: NextRequest, reason: string) {
  console.error('[guest-auth] bootstrap failed:', reason)
  const dashboardUrl = redirectTarget(request, '/dashboard2')
  const response = NextResponse.redirect(dashboardUrl)
  response.cookies.set(GUEST_BOOTSTRAP_SKIP_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 5,
  })
  return response
}

async function healGuestCredentials(email: string, password: string) {
  const { ensureDatabase } = await import('@/scripts/ensure-db')
  await ensureDatabase().catch((error) => {
    console.error('[guest-auth] ensureDatabase failed:', error)
  })

  const healed = await ensureGuestCredentialAccount(email, password).catch((error) => {
    console.error('[guest-auth] credential heal failed:', error)
    return false
  })

  if (healed) {
    console.warn('[guest-auth] healed guest credential account')
  }

  return healed
}

async function ensureGuestSignedIn(
  request: NextRequest,
  guest: { email: string; password: string; name: string }
) {
  const dbProbe = await probeDatabase()
  if (!dbProbe.ok) {
    console.error('[guest-auth] database unreachable:', dbProbe.detail)
    return { response: null as Response | null, reason: 'database_unreachable' }
  }

  const headers = serverAuthHeaders(request)
  const credentials = {
    email: guest.email,
    password: guest.password,
  }

  let response = await auth.api.signInEmail({
    body: credentials,
    headers,
    asResponse: true,
  })

  if (response.ok) {
    return { response, reason: null }
  }

  await healGuestCredentials(guest.email, guest.password)

  response = await auth.api.signInEmail({
    body: credentials,
    headers,
    asResponse: true,
  })

  if (response.ok) {
    return { response, reason: null }
  }

  const signUpResponse = await auth.api.signUpEmail({
    body: {
      ...credentials,
      name: guest.name,
    },
    headers,
    asResponse: true,
  })

  if (!signUpResponse.ok) {
    await healGuestCredentials(guest.email, guest.password)
  }

  response = await auth.api.signInEmail({
    body: credentials,
    headers,
    asResponse: true,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('[guest-auth] sign-in failed after heal:', response.status, body)
    return { response: null, reason: 'sign_in_failed' }
  }

  return { response, reason: null }
}

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from') ?? '/dashboard2'
  const guestConfig = getGuestConfig()

  if (!guestConfig.ok) {
    const keys = [...guestConfig.missingKeys, ...guestConfig.invalidKeys]
    return guestFailureRedirect(request, `guest_env_misconfigured:${keys.join(',')}`)
  }

  try {
    const { response: authResponse, reason } = await ensureGuestSignedIn(request, guestConfig)

    if (!authResponse) {
      return guestFailureRedirect(request, reason ?? 'sign_in_failed')
    }

    const redirectUrl = redirectTarget(request, from)
    const response = NextResponse.redirect(redirectUrl)
    copyAuthCookies(authResponse, response)
    return response
  } catch (error) {
    console.error('[guest-auth] unexpected error:', error)
    return guestFailureRedirect(request, 'unexpected_error')
  }
}
