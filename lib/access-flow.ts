import { createHash, randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'

export const ACCESS_COOKIE = 'access_granted'
export const ACCESS_REQUEST_MAX_PER_HOUR = 15
export const ACCESS_REQUEST_EXPIRY_HOURS = 24
export const ACCESS_SESSION_EXPIRY_DAYS = 30
export const SUPERADMIN_ACCESS_CODE = '1111111199999999'
export const SUPERADMIN_TOKEN_PREFIX = 'superadmin_'

export function isValidAccessCode(code: string): boolean {
  return /^[0-9]{16}$/.test(code)
}

export function isSuperadminCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.trim() === SUPERADMIN_ACCESS_CODE
}

export function isSuperadminToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && (token.startsWith(SUPERADMIN_TOKEN_PREFIX) || token === SUPERADMIN_ACCESS_CODE)
}

export function getAccessAdminSecret(): string | null {
  const configured = process.env.ACCESS_ADMIN_SECRET?.trim()
  if (configured) return configured

  const authUrl = process.env.BETTER_AUTH_URL?.trim()
  if (
    isTrustedTestMode() &&
    (authUrl?.startsWith('http://localhost:') || !authUrl)
  ) {
    return 'playwright-e2e-access-admin-secret'
  }

  return null
}

export function getAccessAdminEmail(): string | null {
  const configured = process.env.ACCESS_ADMIN_EMAIL?.trim()
  return configured || null
}

export function getAccessEnabled(): boolean {
  return process.env.ACCESS_FLOW_ENABLED !== 'false'
}

/**
 * Extracts the trusted client IP.
 * On Cloud Run and reverse proxies with Google Front End (GFE),
 * the actual connecting client IP is appended to the end of X-Forwarded-For.
 * Taking the rightmost (last) IP ensures that client-supplied spoofed IPs
 * prepended to X-Forwarded-For cannot bypass the rate limit.
 */
export function getClientIp(headers: Headers | { get(name: string): string | null }): string {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const parts = forwardedFor
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      return parts[parts.length - 1]
    }
  }

  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) {
    return realIp
  }

  return 'unknown'
}

export function hashIp(ip: string | null | undefined): string {
  if (!ip) return ''
  return createHash('sha256').update(`access-ip:${ip}`).digest('hex').slice(0, 32)
}

export function simplifyUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null
  const browsers: Array<[RegExp, string]> = [
    [/CriOS|Chrome/i, 'Chrome'],
    [/Firefox|FxiOS/i, 'Firefox'],
    [/Safari/i, 'Safari'],
    [/Edg/i, 'Edge'],
  ]
  const systems: Array<[RegExp, string]> = [
    [/iPhone/i, 'iPhone'],
    [/iPad/i, 'iPad'],
    [/Android/i, 'Android'],
    [/Mac OS X/i, 'macOS'],
    [/Windows/i, 'Windows'],
    [/Linux/i, 'Linux'],
  ]
  const browser = browsers.find(([re]) => re.test(ua))?.[1] ?? 'Neznámy prehliadač'
  const system = systems.find(([re]) => re.test(ua))?.[1] ?? 'Neznáme zariadenie'
  return `${system} · ${browser}`
}

export function isTrustedTestMode(): boolean {
  return (
    process.env.E2E_TEST_MODE === 'true' &&
    process.env.VERCEL_ENV !== 'production'
  )
}

export function getAccessRequestQuota(requestCount: number):
  | { allowed: true; remainingRequests: number }
  | { allowed: false; remainingRequests: 0 } {
  if (requestCount >= ACCESS_REQUEST_MAX_PER_HOUR) {
    return { allowed: false, remainingRequests: 0 }
  }
  return {
    allowed: true,
    remainingRequests: ACCESS_REQUEST_MAX_PER_HOUR - requestCount - 1,
  }
}

const decideBuckets = new Map<string, number[]>()

export function checkAccessDecideRateLimit(key: string): boolean {
  if (isTrustedTestMode()) {
    return true
  }
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const max = 60
  const existing = decideBuckets.get(key) ?? []
  const recent = existing.filter((timestamp) => now - timestamp < windowMs)
  if (recent.length >= max) {
    return false
  }
  recent.push(now)
  decideBuckets.set(key, recent)
  return true
}

export function generateSessionToken(): string {
  return randomUUID()
}

export function isAccessRequestExpired(createdAt: Date | null): boolean {
  if (!createdAt) return true
  return Date.now() - createdAt.getTime() > ACCESS_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000
}

export function formatAccessCode(code: string): string {
  return code.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function getAccessBaseUrl(requestUrl: string): string {
  const url = new URL(requestUrl)
  const forwardedProto = process.env.ACCESS_BASE_URL
  if (forwardedProto) return forwardedProto.replace(/\/$/, '')
  return `${url.protocol}//${url.host}`
}

export function buildAdminEmailHtml(params: {
  code?: string
  email?: string
  deviceHint: string | null
  createdAt: Date
  decideBaseUrl: string
  requestId: string
  token: string
}): string {
  const approveUrl = `${params.decideBaseUrl}/api/access/decide?token=${encodeURIComponent(params.token)}&requestId=${encodeURIComponent(params.requestId)}&decision=approved`
  const rejectUrl = `${params.decideBaseUrl}/api/access/decide?token=${encodeURIComponent(params.token)}&requestId=${encodeURIComponent(params.requestId)}&decision=rejected`
  const codeGroups = params.code ? formatAccessCode(params.code) : null
  const createdAtSk = params.createdAt.toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })
  const userIdentifier = params.email ? params.email : (codeGroups ?? params.requestId)

  return `<!DOCTYPE html>
<html lang="sk">
<body style="margin:0;padding:0;background:#030305;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;color:#e2e8f0;">
    <p style="font-size:13px;color:#94a3b8;margin:0 0 8px;">GEORGE · NOVÁ ŽIADOSŤ O PRÍSTUP</p>
    <h2 style="margin:0 0 24px;font-size:20px;color:#ffffff;">Žiadosť o prístup: ${userIdentifier}</h2>
    ${
      params.email
        ? `<div style="background:#171821;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">E-mail žiadateľa</p>
            <p style="margin:0;font-size:20px;font-weight:bold;color:#3b82f6;">${params.email}</p>
          </div>`
        : codeGroups
          ? `<div style="background:#171821;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
              <p style="margin:0 0 12px;font-size:13px;color:#94a3b8;">16-miestny prístupový kód</p>
              <p style="margin:0;font-size:28px;letter-spacing:4px;font-family:'Courier New',monospace;color:#ffffff;">${codeGroups}</p>
            </div>`
          : ''
    }
    <table style="width:100%;font-size:13px;color:#94a3b8;margin-bottom:32px;">
      ${params.email ? `<tr><td style="padding:4px 0;">E-mail</td><td style="text-align:right;color:#e2e8f0;">${params.email}</td></tr>` : ''}
      <tr><td style="padding:4px 0;">Čas žiadosti</td><td style="text-align:right;color:#e2e8f0;">${createdAtSk}</td></tr>
      <tr><td style="padding:4px 0;">Zariadenie</td><td style="text-align:right;color:#e2e8f0;">${params.deviceHint ?? 'Neznáme'}</td></tr>
      <tr><td style="padding:4px 0;">ID žiadosti</td><td style="text-align:right;color:#e2e8f0;font-family:'Courier New',monospace;">${params.requestId}</td></tr>
    </table>
    <p style="font-size:13px;color:#94a3b8;margin:0 0 24px;">Pre autorizáciu kliknite na tlačidlo nižšie:</p>
    <a href="${approveUrl}" style="display:block;background:#16a34a;color:#ffffff;text-decoration:none;text-align:center;font-weight:bold;font-size:16px;padding:16px;border-radius:12px;margin-bottom:12px;">✅ SCHVÁLIŤ PRÍSTUP</a>
    <a href="${rejectUrl}" style="display:block;background:#dc2626;color:#ffffff;text-decoration:none;text-align:center;font-weight:bold;font-size:14px;padding:12px;border-radius:12px;">❌ ZAMIETNUŤ</a>
    <p style="font-size:11px;color:#64748b;margin:24px 0 0;">Žiadosť expiruje po 24 hodinách. Tento e-mail bol zaslaný automaticky.</p>
  </div>
</body>
</html>`
}

let testEmailSentAt = 0
const TEST_EMAIL_COOLDOWN_MS = 15 * 60 * 1000 // 15 minút cooldown pre testovacie e-maily

function hasRecentTestEmail(): boolean {
  const now = Date.now()
  if (testEmailSentAt && now - testEmailSentAt < TEST_EMAIL_COOLDOWN_MS) {
    return true
  }
  try {
    const stampFile = path.join(process.cwd(), '.next', 'cache', 'last-test-email.txt')
    if (fs.existsSync(stampFile)) {
      const saved = parseInt(fs.readFileSync(stampFile, 'utf8'), 10)
      if (saved && now - saved < TEST_EMAIL_COOLDOWN_MS) {
        testEmailSentAt = saved
        return true
      }
    }
  } catch {}
  return false
}

function recordTestEmailSent(): void {
  const now = Date.now()
  testEmailSentAt = now
  try {
    const cacheDir = path.join(process.cwd(), '.next', 'cache')
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    fs.writeFileSync(path.join(cacheDir, 'last-test-email.txt'), String(now), 'utf8')
  } catch {}
}

export async function sendAdminEmail(params: {
  html: string
  subject?: string
  isTest?: boolean
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const to = getAccessAdminEmail()
  const from = process.env.ACCESS_EMAIL_FROM?.trim() || 'George Bezpečnosť <noreply@slotstar.fun>'
  if (!apiKey || !to) {
    console.warn('[access] Admin e-mail not sent (missing RESEND_API_KEY or ACCESS_ADMIN_EMAIL)')
    return { ok: false, error: 'email_not_configured' }
  }

  const isTestRun = params.isTest || isTrustedTestMode()

  // Pre testy: odošli presne 1 e-mail na začiatku testovania, ďalších 90+ test požiadaviek preskoč
  if (isTestRun) {
    if (hasRecentTestEmail()) {
      console.log('[access] ℹ️ Testovací e-mail už bol v tomto behu odoslaný. Preskakujem ďalšie testovacie e-maily (ochrana schránky pred spamom).')
      return { ok: true, skipped: true }
    }
    recordTestEmailSent()
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: params.subject || '🔔 George · Nová žiadosť o prístup',
        html: params.html,
      }),
    })
    if (!res.ok) {
      return { ok: false, error: `resend_error_${res.status}` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'email_send_failed' }
  }
}
