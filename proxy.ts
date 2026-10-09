import { NextRequest, NextResponse } from 'next/server'
import { GUEST_BOOTSTRAP_SKIP_COOKIE } from '@/lib/guest-auth'
import { isSiteGateEnabled, SITE_GATE_COOKIE, SITE_GATE_TOKEN, isTailscaleRequest } from '@/lib/site-gate'
const ACCESS_COOKIE = 'access_granted'
const ACCESS_FLOW_DISABLED = process.env.ACCESS_FLOW_ENABLED === 'false'

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
    pathname === '/welcome' ||
    pathname === '/robots.txt' ||
    (process.env.NODE_ENV !== 'production' && pathname.startsWith('/dashboard-v2')) ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/pin') ||
    // Access-flow API (welcome gate): request/status/decide/session/logout authorize via the
    // access cookie or admin secret themselves and must not bounce through guest bootstrap
    // (e.g. dashboard polling /api/access/session while guest_bootstrap_skip is set).
    pathname === '/api/access' ||
    pathname.startsWith('/api/access/') ||
    pathname === '/gate' ||
    pathname.startsWith('/api/gate') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/test-db') ||
    pathname.startsWith('/api/transactions') ||
    pathname.startsWith('/api/receipts') ||
    pathname.startsWith('/api/push') ||
    pathname.startsWith('/api/debug-ingest') ||
    pathname.startsWith('/api/cron')
  )
}

/** Break guest ↔ dashboard2 redirect loop when guest bootstrap fails (e.g. DB down). */
function shouldSkipGuestRedirect(request: NextRequest) {
  const { pathname } = request.nextUrl
  return (
    (pathname === '/dashboard2' || pathname === '/dashboard3' || pathname === '/dashboard-v2') &&
    request.cookies.get(GUEST_BOOTSTRAP_SKIP_COOKIE)?.value === '1'
  )
}

/**
 * Security headers helper - adds camera permissions and security headers
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    'X-Robots-Tag',
    'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, noodp, noydir'
  );
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

const SCANNER_PROBE_PREFIXES = [
  '/wp-',
  '/phpmyadmin',
  '/pma',
  '/adminer',
  '/actuator',
  '/cgi-bin',
  '/cgi-sys',
  '/.env',
  '/.git',
  '/.svn',
  '/.hg',
  '/.bzr',
  '/.aws',
  '/.ssh',
  '/.docker',
  '/.kube',
  '/.config',
]

const SCANNER_PROBE_EXACT = [
  '/xmlrpc.php',
  '/server-status',
  '/server-info',
  '/web.config',
  '/.htaccess',
  '/.htpasswd',
  '/composer.json',
  '/composer.lock',
  '/package.json',
  '/package-lock.json',
]

const SCANNER_PROBE_EXTENSIONS = [
  '.php',
  '.asp',
  '.aspx',
  '.jsp',
  '.cgi',
  '.sql',
  '.bak',
  '.backup',
  '.swp',
  '.tar',
  '.gz',
  '.zip',
  '.rar',
]

/**
 * Detekcia bežných scanner sond a exploit skenerov (Nápad 3: Scanner Trap)
 */
export function isScannerProbe(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  if (lower.includes('..') || lower.includes('%2e%2e') || lower.includes('/etc/passwd') || lower.includes('/proc/self')) {
    return true
  }
  if (SCANNER_PROBE_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return true
  }
  if (SCANNER_PROBE_EXACT.some((exact) => lower === exact)) {
    return true
  }
  if (SCANNER_PROBE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return true
  }
  return false
}

/**
 * Okamžitá odpoveď pre scanner trap: generická Nginx 404 bez odhalenia Next.js/Reactu
 */
export function createScannerTrapResponse(): NextResponse {
  const genericNginxHtml =
    '<!DOCTYPE html>\n' +
    '<html>\n' +
    '<head><title>404 Not Found</title></head>\n' +
    '<body>\n' +
    '<center><h1>404 Not Found</h1></center>\n' +
    '<hr><center>nginx</center>\n' +
    '</body>\n' +
    '</html>\n'

  return new NextResponse(genericNginxHtml, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag':
        'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, noodp, noydir',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Connection': 'close',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/**
 * Next.js 16+: file convention is `proxy` (formerly `middleware`).
 * Site gate + guest session redirects.
 * Legacy /dashboard is redirected to /dashboard2 (active product surface).
 * Also adds security headers for QR scanning.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // 🛡️ SCANNER TRAP & SILENT DROP (Nápad 3)
  // Okamžité zachytenie a eliminácia sond (wp-admin, .env, phpmyadmin, .git, xmlrpc, atď.)
  // Žiadny redirect, žiadne odhalenie George bankingu, žiadne JS bundles.
  if (isScannerProbe(pathname)) {
    return createScannerTrapResponse()
  }

  // Access flow welcome gate — runs BEFORE the legacy site gate.
  // Every visitor must hold a valid access session (approved by admin).
  if (!ACCESS_FLOW_DISABLED) {
    const accessCookie = request.cookies.get(ACCESS_COOKIE)?.value
    const accessPublicPath =
      pathname === '/welcome' ||
      pathname === '/robots.txt' ||
      pathname === '/gate' ||
      (process.env.NODE_ENV !== 'production' && pathname.startsWith('/dashboard-v2')) ||
      pathname.startsWith('/api/access') ||
      pathname.startsWith('/api/account') ||
      pathname.startsWith('/api/health') ||
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/pin') ||
      pathname.startsWith('/api/gate') ||
      pathname.startsWith('/api/cron')
    if (!accessCookie && !accessPublicPath) {
      const welcomeUrl = request.nextUrl.clone()
      welcomeUrl.pathname = '/welcome'
      welcomeUrl.search = ''
      return addSecurityHeaders(NextResponse.redirect(welcomeUrl))
    }
  }


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
      pathname === '/welcome' ||
      pathname.startsWith('/api/access') ||
      pathname.startsWith('/api/gate') ||
      pathname.startsWith('/api/health') ||
      pathname.startsWith('/api/test-db') ||
      pathname.startsWith('/api/transactions') ||
      pathname.startsWith('/api/receipts') ||
      pathname.startsWith('/api/push') ||
      pathname.startsWith('/api/export') ||
      pathname.startsWith('/api/cron') ||
      pathname.startsWith('/api/pin') ||
      pathname.startsWith('/api/account') ||
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

  if (hasSessionCookie(request) || shouldSkipAuth(request) || shouldSkipGuestRedirect(request)) {
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
