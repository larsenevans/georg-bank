import { createHash, randomUUID } from 'crypto'

export const ACCESS_COOKIE = 'access_granted'
export const ACCESS_REQUEST_MAX_PER_HOUR = 5
export const ACCESS_REQUEST_WINDOW_MS = 60 * 60 * 1000
export const ACCESS_REQUEST_EXPIRY_HOURS = 24
export const ACCESS_SESSION_EXPIRY_DAYS = 30
export const ACCESS_AUTO_LOGOUT_SECONDS = 60

export function isValidAccessCode(code: string): boolean {
  return /^[0-9]{16}$/.test(code)
}

export function getAccessAdminSecret(): string | null {
  const configured = process.env.ACCESS_ADMIN_SECRET?.trim()
  return configured || null
}

export function getAccessAdminEmail(): string | null {
  const configured = process.env.ACCESS_ADMIN_EMAIL?.trim()
  return configured || null
}

export function getAccessEnabled(): boolean {
  return process.env.ACCESS_FLOW_ENABLED !== 'false'
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

const requestBuckets = new Map<string, number[]>()

export function checkAccessRequestRateLimit(key: string): boolean {
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    return true
  }
  const now = Date.now()
  const existing = requestBuckets.get(key) ?? []
  const recent = existing.filter((timestamp) => now - timestamp < ACCESS_REQUEST_WINDOW_MS)
  if (recent.length >= ACCESS_REQUEST_MAX_PER_HOUR) {
    return false
  }
  recent.push(now)
  requestBuckets.set(key, recent)
  return true
}

export function getRemainingAccessRequests(key: string): number {
  const now = Date.now()
  const recent = (requestBuckets.get(key) ?? []).filter(
    (timestamp) => now - timestamp < ACCESS_REQUEST_WINDOW_MS,
  )
  return Math.max(0, ACCESS_REQUEST_MAX_PER_HOUR - recent.length)
}

const decideBuckets = new Map<string, number[]>()

export function checkAccessDecideRateLimit(key: string): boolean {
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
  code: string
  deviceHint: string | null
  createdAt: Date
  decideBaseUrl: string
  requestId: string
  token: string
}): string {
  const approveUrl = `${params.decideBaseUrl}/api/access/decide?token=${encodeURIComponent(params.token)}&requestId=${encodeURIComponent(params.requestId)}&decision=approved`
  const rejectUrl = `${params.decideBaseUrl}/api/access/decide?token=${encodeURIComponent(params.token)}&requestId=${encodeURIComponent(params.requestId)}&decision=rejected`
  const codeGroups = formatAccessCode(params.code)
  const createdAtSk = params.createdAt.toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })
  return `<!DOCTYPE html>
<html lang="sk">
<body style="margin:0;padding:0;background:#030305;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;color:#e2e8f0;">
    <p style="font-size:13px;color:#94a3b8;margin:0 0 8px;">GEORGE · NOVÁ ŽIADOSŤ O PRÍSTUP</p>
    <h2 style="margin:0 0 24px;font-size:20px;color:#ffffff;">Niektorý si vyžiadal prístup do aplikácie</h2>
    <div style="background:#171821;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:13px;color:#94a3b8;">16-miestny prístupový kód</p>
      <p style="margin:0;font-size:28px;letter-spacing:4px;font-family:'Courier New',monospace;color:#ffffff;">${codeGroups}</p>
    </div>
    <table style="width:100%;font-size:13px;color:#94a3b8;margin-bottom:32px;">
      <tr><td style="padding:4px 0;">Čas žiadosti</td><td style="text-align:right;color:#e2e8f0;">${createdAtSk}</td></tr>
      <tr><td style="padding:4px 0;">Zariadenie</td><td style="text-align:right;color:#e2e8f0;">${params.deviceHint ?? 'Neznáme'}</td></tr>
      <tr><td style="padding:4px 0;">ID žiadosti</td><td style="text-align:right;color:#e2e8f0;font-family:'Courier New',monospace;">${params.requestId}</td></tr>
    </table>
    <p style="font-size:13px;color:#94a3b8;margin:0 0 24px;">Porovnaj kód so svojim zoznamom a rozhodni:</p>
    <a href="${approveUrl}" style="display:block;background:#16a34a;color:#ffffff;text-decoration:none;text-align:center;font-weight:bold;font-size:16px;padding:16px;border-radius:12px;margin-bottom:12px;">✅ SCHVÁLIŤ PRÍSTUP</a>
    <a href="${rejectUrl}" style="display:block;background:#dc2626;color:#ffffff;text-decoration:none;text-align:center;font-weight:bold;font-size:16px;padding:16px;border-radius:12px;">❌ ZAMIETNUŤ</a>
    <p style="font-size:11px;color:#64748b;margin:24px 0 0;">Žiadosť expiruje po 24 hodinách. Tento e-mail bol zaslaný automaticky.</p>
  </div>
</body>
</html>`
}

export async function sendAdminEmail(params: {
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const to = getAccessAdminEmail()
  const from = process.env.ACCESS_EMAIL_FROM?.trim() || 'George Access <onboarding@resend.dev>'
  if (!apiKey || !to) {
    console.warn('[access] Admin e-mail not sent (missing RESEND_API_KEY or ACCESS_ADMIN_EMAIL)')
    return { ok: false, error: 'email_not_configured' }
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
        subject: 'George · Nová žiadosť o prístup',
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
