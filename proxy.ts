import { NextRequest, NextResponse } from 'next/server'
import { isSiteGateEnabled, SITE_GATE_COOKIE, SITE_GATE_TOKEN, isTailscaleRequest } from '@/lib/site-gate'

const SESSION_COOKIE = '__Secure-better-auth.session_token'
const SESSION_COOKIE_INSECURE = 'better-auth.session_token'

function hasSessionCookie(request: NextRequest) {
  return Boolean(
    request.cookies.get(SESSION_COOKIE)?.value ||
    request.cookies.get(SESSION_COOKIE_INSECURE)?.value
  )
}

function shouldSkipAuth(request: NextRequest) {
  const { pathname } = request.nextUrl
  return (
    pathname.startsWith('/api/auth') ||
    pathname === '/gate' ||
    pathname.startsWith('/api/gate') ||
    pathname === '/sign-in' ||
    pathname === '/sign-up' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/test-db') ||
    pathname.startsWith('/api/transactions') ||
    pathname.startsWith('/api/receipts') ||
    pathname.startsWith('/api/push') ||
    pathname.startsWith('/api/debug-ingest')
  )
}

/**
 * Security headers helper - adds camera permissions and security headers
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data: blob: https://fonts.gstatic.com; " +
    "connect-src 'self' https:; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID, Idempotency-Key');
  return response;
}

/**
 * Next.js 16+: file convention is `proxy` (formerly `middleware`).
 * Site gate + guest session redirects.
 * Legacy /dashboard is redirected to /dashboard2 (active product surface).
 * Also adds security headers for QR scanning.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Prefer dashboard2 — block opening the legacy /dashboard shell.
  if (pathname === '/dashboard' || pathname === '/dashboard/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard2'
    url.search = search
    return addSecurityHeaders(NextResponse.redirect(url))
  }

  if (isSiteGateEnabled()) {
    const hasGateCookie = request.cookies.get(SITE_GATE_COOKIE)?.value === SITE_GATE_TOKEN
    const isTS = isTailscaleRequest(request)
    const gateBypassed = hasGateCookie || isTS

    // Gate UI + public APIs needed by the main app and live /pohyby ledger.
    // Payments from george-*.vercel.app must reach Supabase so the dashboard can show them.
    const gatePublicPath =
      pathname === '/gate' ||
      pathname.startsWith('/api/gate') ||
      pathname.startsWith('/api/health') ||
      pathname.startsWith('/api/test-db') ||
      pathname.startsWith('/api/transactions') ||
      pathname.startsWith('/api/receipts') ||
      pathname.startsWith('/api/push') ||
      pathname.startsWith('/api/debug-ingest') ||
      pathname.startsWith('/api/auth')

    if (!gateBypassed && !gatePublicPath) {
      const gateUrl = request.nextUrl.clone()
      gateUrl.pathname = '/gate'
      gateUrl.search = ''
      const redirectTarget = `${pathname}${search}`
      if (redirectTarget !== '/') {
        // Normalize legacy landing to dashboard2 when bouncing via gate
        const from =
          redirectTarget === '/dashboard' || redirectTarget.startsWith('/dashboard?')
            ? '/dashboard2'
            : redirectTarget
        gateUrl.searchParams.set('from', from)
      }

      return addSecurityHeaders(NextResponse.redirect(gateUrl))
    }
    // Tailscale / gate cookie only skips the password gate — still require guest session below.
  }

  if (hasSessionCookie(request) || shouldSkipAuth(request)) {
    return addSecurityHeaders(NextResponse.next())
  }

  const guestUrl = request.nextUrl.clone()
  guestUrl.pathname = '/api/auth/guest'
  guestUrl.search = ''
  const rawTarget = pathname === '/' ? '/dashboard2' : `${pathname}${search}`
  const target =
    rawTarget === '/dashboard' || rawTarget.startsWith('/dashboard?')
      ? '/dashboard2'
      : rawTarget
  guestUrl.searchParams.set('from', target)

  return addSecurityHeaders(NextResponse.redirect(guestUrl))
}

export const config = {
  matcher: [
    // Skip static assets + face-api weights under /models (public/)
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|service-worker.js|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|json)$).*)',
  ],
}
