import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { resolveDatabaseUrl } from '@/lib/db/resolve-database-url'
import { GUEST_USER_EMAIL, isDedicatedGuestEmail } from '@/lib/guest-auth'

export const dynamic = 'force-dynamic'

/**
 * Public readiness probe (no secrets). Used to diagnose prod guest-auth failures
 * without needing a session cookie.
 */
export async function GET() {
  const hasDatabaseUrl = Boolean(resolveDatabaseUrl())
  const hasBetterAuthSecret = Boolean(process.env.BETTER_AUTH_SECRET?.trim())
  const betterAuthUrl = process.env.BETTER_AUTH_URL?.trim() || null
  const rawGuestEmail = process.env.GUEST_USER_EMAIL?.trim() || null
  const rawGuestEmailOk = rawGuestEmail
    ? isDedicatedGuestEmail(rawGuestEmail)
    : true
  const guestEmailOk = isDedicatedGuestEmail(GUEST_USER_EMAIL)
  const devPrefillEmail = process.env.NEXT_PUBLIC_DEV_USER_EMAIL?.trim() || null

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
      databaseError = error instanceof Error ? error.message : String(error)
    }
  }

  const ok =
    database === 'ok' &&
    hasBetterAuthSecret &&
    guestEmailOk &&
    rawGuestEmailOk &&
    Boolean(betterAuthUrl)

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
        emailIsLocalTest: guestEmailOk,
        envEmailIsLocalTest: rawGuestEmailOk,
        usingFallbackEmail: Boolean(rawGuestEmail && !rawGuestEmailOk),
        serverUsesDedicatedGuestEmail: guestEmailOk,
        devPrefillEmailConfigured: Boolean(devPrefillEmail),
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
