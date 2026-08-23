import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

function authFallbackUrl(): string | undefined {
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL)
  )
}

/**
 * Dynamic baseURL so Production alias hosts (e.g. george-dev-*.vercel.app)
 * and per-deployment VERCEL_URL stay aligned with the incoming request.
 * Guest sign-in must pass request headers (host / x-forwarded-*).
 */
const fallback = authFallbackUrl()

export const auth = betterAuth({
  database: pool,
  baseURL: fallback || 'http://localhost:3030',
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 4,
  },

  trustedOrigins: [
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    'http://localhost:3030',
    'http://localhost:3355',
    'http://10.0.2.2:3030',
    'https://*.vercel.app',
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  advanced: {
    // Vercel sets x-forwarded-host / x-forwarded-proto — required for dynamic baseURL.
    trustedProxyHeaders: true,
    ...(process.env.NODE_ENV === 'development' &&
    process.env.BETTER_AUTH_URL?.startsWith('https')
      ? {
          // In dev (v0 preview iframe over HTTPS), force cross-site cookies
          // so the session cookie is stored by the browser.
          // On plain http://localhost we must NOT set secure: true because
          // the __Secure- cookie prefix requires HTTPS.
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        }
      : {}),
  },
})
