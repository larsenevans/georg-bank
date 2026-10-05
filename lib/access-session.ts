import { and, eq, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { accessSession } from '@/lib/db/schema'
import {
  ACCESS_AUTO_LOGOUT_SECONDS,
  ACCESS_COOKIE,
  getAccessEnabled,
} from '@/lib/access-flow'

export type AccessSessionRow = typeof accessSession.$inferSelect

/** Pure: schedule logout only when both flags are true and logoutAt is still null. */
export function shouldScheduleLogout(session: {
  transactionUsed: boolean
  pdfGenerated: boolean
  logoutAt: Date | null
}): boolean {
  return Boolean(session.transactionUsed && session.pdfGenerated && session.logoutAt == null)
}

/** Pure: logoutAt = now + ACCESS_AUTO_LOGOUT_SECONDS (exactly 60s by contract). */
export function computeLogoutAt(nowMs: number = Date.now()): Date {
  return new Date(nowMs + ACCESS_AUTO_LOGOUT_SECONDS * 1000)
}

/** Pure: patch applied by endSession. */
export function buildEndSessionValues(now: Date = new Date()) {
  return {
    status: 'ended' as const,
    endedAt: now,
  }
}

export async function readAccessCookieToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(ACCESS_COOKIE)?.value ?? null
}

/**
 * Returns the active access session for a cookie token, or null.
 * If logoutAt has passed (or expired), ends the session and returns null.
 * Callers that need to skip when ACCESS_FLOW_ENABLED=false should check getAccessEnabled().
 */
export async function getActiveAccessSession(
  cookieToken: string | null | undefined,
): Promise<AccessSessionRow | null> {
  if (!cookieToken) return null

  const [row] = await db
    .select()
    .from(accessSession)
    .where(eq(accessSession.sessionToken, cookieToken))
    .limit(1)

  if (!row) return null
  if (row.status !== 'active') return null

  const now = Date.now()
  if (row.expiresAt.getTime() <= now) {
    await endSession(row.sessionToken)
    return null
  }
  if (row.logoutAt && row.logoutAt.getTime() <= now) {
    await endSession(row.sessionToken)
    return null
  }

  return row
}

export async function markTransactionUsed(sessionId: string): Promise<void> {
  await db
    .update(accessSession)
    .set({ transactionUsed: true })
    .where(eq(accessSession.id, sessionId))
}

export async function markPdfGenerated(sessionId: string): Promise<void> {
  await db
    .update(accessSession)
    .set({ pdfGenerated: true })
    .where(eq(accessSession.id, sessionId))
}

/**
 * Set logoutAt = now + ACCESS_AUTO_LOGOUT_SECONDS only when both flags are true
 * and logoutAt is still null. Idempotent: if logoutAt is already set, returns it unchanged.
 */
export async function maybeScheduleLogout(sessionId: string): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(accessSession)
    .where(eq(accessSession.id, sessionId))
    .limit(1)

  if (!row) return null
  if (row.logoutAt) return row.logoutAt
  if (!shouldScheduleLogout(row)) return null

  const logoutAt = computeLogoutAt()
  await db
    .update(accessSession)
    .set({ logoutAt })
    .where(and(eq(accessSession.id, sessionId), isNull(accessSession.logoutAt)))

  const [updated] = await db
    .select()
    .from(accessSession)
    .where(eq(accessSession.id, sessionId))
    .limit(1)

  return updated?.logoutAt ?? logoutAt
}

export async function endSession(sessionToken: string): Promise<void> {
  await db
    .update(accessSession)
    .set(buildEndSessionValues())
    .where(
      and(eq(accessSession.sessionToken, sessionToken), eq(accessSession.status, 'active')),
    )
}

export type AccessGateResult =
  | { ok: true; session: AccessSessionRow | null; skipped: true }
  | { ok: true; session: AccessSessionRow; skipped: false }
  | { ok: false; error: string; status: number }

/** When access flow is disabled, skip gating. Otherwise require an active session. */
export async function requireActiveAccessSession(
  cookieToken: string | null | undefined,
): Promise<AccessGateResult> {
  if (!getAccessEnabled()) {
    return { ok: true, session: null, skipped: true }
  }
  const session = await getActiveAccessSession(cookieToken)
  if (!session) {
    return { ok: false, error: 'access_session_required', status: 401 }
  }
  return { ok: true, session, skipped: false }
}

export async function requireAccessForTransaction(
  cookieToken: string | null | undefined,
): Promise<AccessGateResult> {
  const gate = await requireActiveAccessSession(cookieToken)
  if (!gate.ok) return gate
  if (gate.skipped) return gate
  if (gate.session.transactionUsed) {
    return { ok: false, error: 'transaction_already_used', status: 403 }
  }
  return gate
}

export async function requireAccessForPdf(
  cookieToken: string | null | undefined,
): Promise<AccessGateResult> {
  const gate = await requireActiveAccessSession(cookieToken)
  if (!gate.ok) return gate
  if (gate.skipped) return gate
  if (gate.session.pdfGenerated) {
    return { ok: false, error: 'pdf_already_generated', status: 403 }
  }
  return gate
}

export async function afterTransactionSuccess(session: AccessSessionRow): Promise<void> {
  await markTransactionUsed(session.id)
  await maybeScheduleLogout(session.id)
}

export async function afterPdfSuccess(session: AccessSessionRow): Promise<void> {
  await markPdfGenerated(session.id)
  await maybeScheduleLogout(session.id)
}
