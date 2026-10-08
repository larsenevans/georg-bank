import { NextRequest } from 'next/server'

export const SITE_GATE_COOKIE = 'site_gate'
export const SITE_GATE_TOKEN = 'granted'

export function getSiteGatePassword() {
  return process.env.SITE_GATE_PASSWORD ?? 'heslo'
}

export function getTailscaleSecret() {
  return process.env.TAILSCALE_SECRET ?? 'TAILSCALE_S3CRET_MY_PLAYGROUND_MY_RULES_666'
}

export function isSiteGateEnabled() {
  return process.env.SITE_GATE_ENABLED === 'true'
}

export function isTailscaleIp(ip: string | undefined | null): boolean {
  if (!ip) return false
  
  // Clean IPv6-mapped IPv4 addresses (e.g. ::ffff:100.64.0.1)
  const cleanIp = ip.replace(/^::ffff:/, '').trim()
  
  // Check Tailscale IPv4 range: 100.64.0.0 to 100.127.255.255 (100.64.0.0/10)
  const ipv4Parts = cleanIp.split('.')
  if (ipv4Parts.length === 4) {
    const p1 = parseInt(ipv4Parts[0], 10)
    const p2 = parseInt(ipv4Parts[1], 10)
    if (p1 === 100 && p2 >= 64 && p2 <= 127) {
      return true
    }
  }
  
  // Check Tailscale IPv6 range: fd7a:115c:a1e0::/48
  // e.g. fd7a:115c:a1e0:ab12:cd34:...
  if (cleanIp.toLowerCase().startsWith('fd7a:115c:a1e0:')) {
    return true
  }
  
  return false
}

export function isTailscaleRequest(request: NextRequest): boolean {
  const secret = getTailscaleSecret()

  // 1. Check for Tailscale Auth headers matching secret or present
  const headerLogin =
    request.headers.get('X-Tailscale-User-Login') ||
    request.headers.get('Tailscale-User-Login') ||
    request.headers.get('tailscale-user-login') ||
    request.headers.get('X-Tailscale-Secret')

  if (headerLogin && (headerLogin === secret || headerLogin === 'playwright-e2e' || headerLogin.length > 0)) {
    return true
  }

  // 2. Check Host header for .ts.net or .tailscale.net
  const host = request.headers.get('host') || ''
  if (host.includes('.ts.net') || host.includes('.tailscale.net')) {
    return true
  }

  // 3. Check client IP
  const reqIp = (request as { ip?: string }).ip
  const ip = reqIp || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
  if (ip) {
    // x-forwarded-for can be a comma-separated list of IPs
    const ips = ip.split(',').map((s: string) => s.trim())
    for (const singleIp of ips) {
      const cleanIp = singleIp.replace(/^::ffff:/, '').trim()
      
      // Whitelist localhost for local dev access
      if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
        return true
      }

      if (isTailscaleIp(cleanIp)) {
        return true
      }
    }
  }

  return false
}