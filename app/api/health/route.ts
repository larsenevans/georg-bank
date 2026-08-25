import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { resolveDatabaseUrl } from '@/lib/db/resolve-database-url'
import { getGuestConfig, isDedicatedGuestEmail } from '@/lib/guest-auth'
import { isAppPinConfigured } from '@/lib/app-pin'
import { computeHealthOk } from '@/lib/health-readiness'

export const dynamic = 'force-dynamic'

/**
 * Public readiness probe (no secrets). Reports guest/PIN config flags for diagnostics;
 * PIN-only deployments stay 200 when core infra is up even if guest env is invalid.
 */
export async function GET() {
  const hasDatabaseUrl = Boolean(resolveDatabaseUrl())
  const hasBetterAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET?.trim())
  const betterAuthUrl = process.env.BETTER_AUTH_URL?.trim() || null
  const guestConfig = getGuestConfig()
  const guestEmailConfigured = Boolean(process.env.GUEST_USER_EMAIL?.trim())
  const guestPasswordConfigured = Boolean(process.env.GUEST_USER_PASSWORD?.trim())
  const rawGuestEmail = process.env.GUEST_USER_EMAIL?.trim() || null
  const rawGuestEmailOk = rawGuestEmail ? isDedicatedGuestEmail(rawGuestEmail) : false

  let database: 'ok' | 'unreachable' | 'unconfigured' = 'unconfigured'
  let databaseError: string | null = null

  if (!hasDatabaseUrl) {
    database = 'unconfigured'
  } else {
    try {
      const client = await pool.connect()
      try {
        await client.query('SELECT 1')
        database = 'ok'
      } finally {
        client.release()
      }
    } catch (error) {
      database = 'unreachable'
      const message = error instanceof Error ? error.message : String(error)
      console.error('[health] database probe failed:', message)
      databaseError = 'connection_failed'
    }
  }

  const pinConfigured = isAppPinConfigured()

  const ok = computeHealthOk({
    database,
    hasBetterAuthSecret,
    betterAuthUrlConfigured: Boolean(betterAuthUrl),
    pinConfigured,
    guestConfigured: guestConfig.ok,
  })

  return NextResponse.json(
    {
      ok,
      database,
      databaseError,
      betterAuth: {
        secretConfigured: hasBetterAuthSecret,
        urlConfigured: Boolean(betterAuthUrl),
        // Host only — never echo full secrets
        urlHost: betterAuthUrl
          ? (() => {
              try {
                return new URL(betterAuthUrl).host
              } catch {
                return 'invalid'
              }
            })()
          : null,
      },
      guest: {
        configured: guestConfig.ok,
        emailConfigured: guestEmailConfigured,
        passwordConfigured: guestPasswordConfigured,
        emailIsLocalTest: rawGuestEmailOk,
        missingEnvKeys: guestConfig.ok ? [] : guestConfig.missingKeys,
        invalidEnvKeys: guestConfig.ok ? [] : guestConfig.invalidKeys,
      },
      pin: {
        configured: pinConfigured,
        missingEnvKeys: pinConfigured ? [] : ['APP_PIN'],
      },
      vercel: {
        env: process.env.VERCEL_ENV ?? null,
        url: process.env.VERCEL_URL ?? null,
        productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      },
    },
    { status: ok ? 200 : 503 }
  )
}
