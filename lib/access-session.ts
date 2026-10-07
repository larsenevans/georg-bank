import { and, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessSession } from '@/lib/db/schema'
import {
  ACCESS_COOKIE,
  getAccessEnabled,
} from '@/lib/access-flow'

export type AccessSessionRow = typeof accessSession.$inferSelect

/** Pure: a session is consumed when either protected action succeeds. */
export function shouldScheduleLogout(session: {
  transactionUsed: boolean
  pdfGenerated: boolean
  logoutAt: Date | null
}): boolean {
  return Boolean((session.transactionUsed || session.pdfGenerated) && session.logoutAt == null)
}

/** Pure: consumed sessions end at the action timestamp without a countdown. */
export function computeLogoutAt(nowMs: number = Date.now()): Date {
  return new Date(nowMs)
}

/** Pure: patch applied by endSession. */
export function buildEndSessionValues(now: Date = new Date()) {
  return {
    status: 'ended' as const,
    logoutAt: now,
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
    .set({
      transactionUsed: true,
    })
    .where(and(eq(accessSession.id, sessionId), eq(accessSession.status, 'active')))
}

export async function markPdfGenerated(sessionId: string): Promise<void> {
  const now = new Date()
  await db
    .update(accessSession)
    .set({
      pdfGenerated: true,
      ...buildEndSessionValues(now),
    })
    .where(and(eq(accessSession.id, sessionId), eq(accessSession.status, 'active')))
}

/**
 * End a session immediately when one protected action is consumed.
 * Kept as a dedicated helper for callers that use the historical function name.
 */
export async function maybeScheduleLogout(sessionId: string): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(accessSession)
    .where(eq(accessSession.id, sessionId))
    .limit(1)

  if (!row || row.logoutAt) return row?.logoutAt ?? null
  if (!shouldScheduleLogout(row)) return null

  const logoutAt = computeLogoutAt()
  await db
    .update(accessSession)
    .set(buildEndSessionValues(logoutAt))
    .where(and(eq(accessSession.id, sessionId), eq(accessSession.status, 'active')))

  return logoutAt
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

function clearAccessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  }
}

export function clearAccessCookie(response: NextResponse): NextResponse {
  response.cookies.set(ACCESS_COOKIE, '', clearAccessCookieOptions())
  return response
}

export async function clearAccessCookieFromServerAction(): Promise<void> {
  const jar = await cookies()
  jar.set(ACCESS_COOKIE, '', clearAccessCookieOptions())
}

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

export function getConsumedActionError(
  session: Pick<AccessSessionRow, 'transactionUsed' | 'pdfGenerated'>,
  attemptedAction: 'transaction_already_used' | 'pdf_already_generated',
): 'transaction_already_used' | 'pdf_already_generated' | null {
  if (attemptedAction === 'transaction_already_used' && session.transactionUsed) {
    return 'transaction_already_used'
  }
  if (attemptedAction === 'pdf_already_generated' && session.pdfGenerated) {
    return 'pdf_already_generated'
  }
  return null
}

async function requireAccessForConsumedAction(
  cookieToken: string | null | undefined,
  consumedError: 'transaction_already_used' | 'pdf_already_generated',
): Promise<AccessGateResult> {
  if (!getAccessEnabled()) {
    return { ok: true, session: null, skipped: true }
  }
  if (!cookieToken) {
    return { ok: false, error: 'access_session_required', status: 401 }
  }

  const [session] = await db
    .select()
    .from(accessSession)
    .where(eq(accessSession.sessionToken, cookieToken))
    .limit(1)

  if (!session) {
    return { ok: false, error: 'access_session_required', status: 401 }
  }
  const consumedActionError = getConsumedActionError(session, consumedError)
  if (consumedActionError) {
    return { ok: false, error: consumedActionError, status: 403 }
  }
  if (
    session.status !== 'active' ||
    session.expiresAt.getTime() <= Date.now() ||
    (session.logoutAt != null && session.logoutAt.getTime() <= Date.now())
  ) {
    if (session.status === 'active') {
      await endSession(session.sessionToken)
    }
    return { ok: false, error: 'access_session_required', status: 401 }
  }

  return { ok: true, session, skipped: false }
}

export async function requireAccessForTransaction(
  cookieToken: string | null | undefined,
): Promise<AccessGateResult> {
  return requireAccessForConsumedAction(cookieToken, 'transaction_already_used')
}

export async function requireAccessForPdf(
  cookieToken: string | null | undefined,
): Promise<AccessGateResult> {
  return requireAccessForConsumedAction(cookieToken, 'pdf_already_generated')
}

export async function afterTransactionSuccess(session: AccessSessionRow): Promise<void> {
  await markTransactionUsed(session.id)
}

export async function afterPdfSuccess(session: AccessSessionRow): Promise<void> {
  await markPdfGenerated(session.id)
}
