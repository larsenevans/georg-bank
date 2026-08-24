import { randomUUID } from 'crypto'

const DEFAULT_GUEST_EMAIL = 'admin@local.test'
const DEFAULT_GUEST_PASSWORD = 'admin1234'

/**
 * Server-side guest identity only — never read NEXT_PUBLIC_* here.
 * Those vars are for client auth-form prefills and must not skew guest auto-login.
 */
function resolveGuestEmail() {
  const configured = process.env.GUEST_USER_EMAIL?.trim()
  if (!configured) {
    return DEFAULT_GUEST_EMAIL
  }
  if (!configured.toLowerCase().endsWith('@local.test')) {
    console.error(
      '[guest-auth] GUEST_USER_EMAIL must end with @local.test; falling back to',
      DEFAULT_GUEST_EMAIL,
      '(got:',
      configured,
      ')'
    )
    return DEFAULT_GUEST_EMAIL
  }
  return configured
}

function resolveGuestPassword() {
  const configured = process.env.GUEST_USER_PASSWORD?.trim()
  if (configured) {
    return configured
  }
  return DEFAULT_GUEST_PASSWORD
}

export const GUEST_USER_EMAIL = resolveGuestEmail()

export const GUEST_USER_PASSWORD = resolveGuestPassword()

export const GUEST_USER_NAME = 'Peter'

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
export async function syncGuestCredentialPassword() {
  if (!isDedicatedGuestEmail(GUEST_USER_EMAIL)) {
    console.error(
      '[guest-auth] Refusing password sync: GUEST_USER_EMAIL must be a dedicated @local.test address, got:',
      GUEST_USER_EMAIL
    )
    return false
  }

  const { hashPassword } = await import('better-auth/crypto')
  const { pool } = await import('@/lib/db')

  const passwordHash = await hashPassword(GUEST_USER_PASSWORD)
  const result = await pool.query(
    `UPDATE account SET password = $1, "updatedAt" = NOW()
     FROM "user"
     WHERE account."userId" = "user".id
       AND lower("user".email) = lower($2)
       AND account."providerId" = 'credential'
     RETURNING account.id`,
    [passwordHash, GUEST_USER_EMAIL]
  )

  return (result.rowCount ?? 0) > 0
}

/**
 * Ensure the dedicated guest user has a credential account with the configured password.
 * Handles users created without a credential row (sign-up 422 + sign-in loop).
 */
export async function ensureGuestCredentialAccount() {
  if (!isDedicatedGuestEmail(GUEST_USER_EMAIL)) {
    return false
  }

  const { hashPassword } = await import('better-auth/crypto')
  const { pool } = await import('@/lib/db')

  const userResult = await pool.query<{ id: string }>(
    `SELECT id FROM "user" WHERE lower(email) = lower($1) LIMIT 1`,
    [GUEST_USER_EMAIL]
  )

  if (userResult.rows.length === 0) {
    return false
  }

  const userId = userResult.rows[0].id
  const passwordHash = await hashPassword(GUEST_USER_PASSWORD)

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

  return syncGuestCredentialPassword()
}
