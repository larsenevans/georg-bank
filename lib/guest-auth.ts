import { randomUUID } from 'crypto'

/** Short-lived cookie set when guest bootstrap fails — breaks proxy redirect loop without URL leaks. */
export const GUEST_BOOTSTRAP_SKIP_COOKIE = 'guest_bootstrap_skip'

export type GuestConfig =
  | { ok: true; email: string; password: string; name: string }
  | { ok: false; missingKeys: string[]; invalidKeys: string[] }

/**
 * Server-side guest identity only — never read NEXT_PUBLIC_* here.
 * Those vars are for client auth-form prefills and must not skew guest auto-login.
 */
export function getGuestConfig(): GuestConfig {
  const missingKeys: string[] = []
  const invalidKeys: string[] = []

  const email = process.env.GUEST_USER_EMAIL?.trim()
  const password = process.env.GUEST_USER_PASSWORD?.trim()

  if (!email) {
    missingKeys.push('GUEST_USER_EMAIL')
  } else if (!isDedicatedGuestEmail(email)) {
    invalidKeys.push('GUEST_USER_EMAIL')
  }

  if (!password) {
    missingKeys.push('GUEST_USER_PASSWORD')
  }

  if (missingKeys.length > 0 || invalidKeys.length > 0) {
    return { ok: false, missingKeys, invalidKeys }
  }

  return {
    ok: true,
    email: email!,
    password: password!,
    name: process.env.GUEST_USER_NAME?.trim() || 'Peter',
  }
}

const resolvedGuest = getGuestConfig()

/** @deprecated Prefer getGuestConfig() — empty when env is missing or invalid. */
export const GUEST_USER_EMAIL = resolvedGuest.ok ? resolvedGuest.email : ''

/** @deprecated Prefer getGuestConfig() — empty when env is missing or invalid. */
export const GUEST_USER_PASSWORD = resolvedGuest.ok ? resolvedGuest.password : ''

export const GUEST_USER_NAME = resolvedGuest.ok ? resolvedGuest.name : 'Peter'

/** Dedicated guest inbox — never point GUEST_USER_EMAIL at a real person's mailbox. */
export function isDedicatedGuestEmail(email: string) {
  return email.trim().toLowerCase().endsWith('@local.test')
}

export function guestLoginPath(from = '/dashboard2') {
  return `/api/auth/guest?from=${encodeURIComponent(from)}`
}

/**
 * Align the guest credential password with GUEST_USER_PASSWORD.
 * Needed when the guest user already exists (sign-up fails) but was
 * created with a different password — otherwise /api/auth/guest 500s.
 *
 * Refuses to overwrite credentials when GUEST_USER_EMAIL is not a
 * dedicated @local.test address (misconfig would reset a real user).
 */
export async function syncGuestCredentialPassword(email: string, password: string) {
  if (!isDedicatedGuestEmail(email)) {
    console.error(
      '[guest-auth] Refusing password sync: GUEST_USER_EMAIL must be a dedicated @local.test address, got:',
      email
    )
    return false
  }

  const { hashPassword } = await import('better-auth/crypto')
  const { pool } = await import('@/lib/db')

  const passwordHash = await hashPassword(password)
  const result = await pool.query(
    `UPDATE account SET password = $1, "updatedAt" = NOW()
     FROM "user"
     WHERE account."userId" = "user".id
       AND lower("user".email) = lower($2)
       AND account."providerId" = 'credential'
     RETURNING account.id`,
    [passwordHash, email]
  )

  return (result.rowCount ?? 0) > 0
}

/**
 * Ensure the dedicated guest user has a credential account with the configured password.
 * Handles users created without a credential row (sign-up 422 + sign-in loop).
 */
export async function ensureGuestCredentialAccount(email: string, password: string) {
  if (!isDedicatedGuestEmail(email)) {
    return false
  }

  const { hashPassword } = await import('better-auth/crypto')
  const { pool } = await import('@/lib/db')

  const userResult = await pool.query<{ id: string }>(
    `SELECT id FROM "user" WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  )

  if (userResult.rows.length === 0) {
    return false
  }

  const userId = userResult.rows[0].id
  const passwordHash = await hashPassword(password)

  const accountResult = await pool.query<{ id: string }>(
    `SELECT id FROM account
     WHERE "userId" = $1 AND "providerId" = 'credential'
     LIMIT 1`,
    [userId]
  )

  if (accountResult.rows.length === 0) {
    await pool.query(
      `INSERT INTO account (
         id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
       ) VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())`,
      [randomUUID(), userId, userId, passwordHash]
    )
    console.warn('[guest-auth] created missing credential account for guest user')
    return true
  }

  return syncGuestCredentialPassword(email, password)
}
