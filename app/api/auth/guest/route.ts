import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { resolveDatabaseUrl } from '@/lib/db/resolve-database-url'
import {
  GUEST_USER_EMAIL,
  GUEST_USER_NAME,
  GUEST_USER_PASSWORD,
  ensureGuestCredentialAccount,
  isDedicatedGuestEmail,
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
    return { ok: false, detail: message }
  }
}

function guestFailureRedirect(request: NextRequest) {
  const signInUrl = new URL('/sign-in', request.url)
  signInUrl.searchParams.set('guest', 'unavailable')
  return NextResponse.redirect(signInUrl)
}

async function ensureGuestSignedIn(request: NextRequest) {
  if (!isDedicatedGuestEmail(GUEST_USER_EMAIL)) {
    console.error(
      '[guest-auth] Refusing guest login: GUEST_USER_EMAIL must end with @local.test, got:',
      GUEST_USER_EMAIL
    )
    return new Response(JSON.stringify({ error: 'Guest auth misconfigured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const dbProbe = await probeDatabase()
  if (!dbProbe.ok) {
    console.error('[guest-auth] database unreachable:', dbProbe.detail)
    return new Response(
      JSON.stringify({ error: 'Database unreachable', detail: dbProbe.detail }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    )
  }

  const headers = serverAuthHeaders(request)
  const credentials = {
    email: GUEST_USER_EMAIL,
    password: GUEST_USER_PASSWORD,
  }

  let response = await auth.api.signInEmail({
    body: credentials,
    headers,
    asResponse: true,
  })

  if (response.ok) return response

  const { ensureDatabase } = await import('@/scripts/ensure-db')
  await ensureDatabase().catch((error) => {
    console.error('[guest-auth] ensureDatabase failed:', error)
  })

  const signUpResponse = await auth.api.signUpEmail({
    body: {
      ...credentials,
      name: GUEST_USER_NAME,
    },
    headers,
    asResponse: true,
  })

  if (!signUpResponse.ok) {
    const healed = await ensureGuestCredentialAccount().catch((error) => {
      console.error('[guest-auth] credential heal failed:', error)
      return false
    })
    if (healed) {
      console.warn('[guest-auth] healed guest credential account')
    }
  }

  response = await auth.api.signInEmail({
    body: credentials,
    headers,
    asResponse: true,
  })

  return response
}

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from') ?? '/dashboard2'

  try {
    const authResponse = await ensureGuestSignedIn(request)

    if (!authResponse.ok) {
      const body = await authResponse.text().catch(() => '')
      console.error('[guest-auth] sign-in failed:', authResponse.status, body)
      return guestFailureRedirect(request)
    }

    const redirectUrl = new URL(from, request.url)
    const response = NextResponse.redirect(redirectUrl)
    copyAuthCookies(authResponse, response)
    return response
  } catch (error) {
    console.error('[guest-auth] unexpected error:', error)
    return guestFailureRedirect(request)
  }
}
