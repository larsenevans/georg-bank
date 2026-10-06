import { pool } from '@/lib/db'
import {
  ACCESS_REQUEST_MAX_PER_HOUR,
  getAccessRequestQuota,
  isTrustedTestMode,
} from '@/lib/access-flow'

export interface NewAccessRequest {
  id: string
  code?: string | null
  email?: string | null
  userId?: string | null
  token: string
  deviceHint: string | null
  userAgent: string
  ipHash: string
}

export type AccessRequestInsertResult =
  | { allowed: true; remainingRequests: number }
  | { allowed: false; remainingRequests: 0 }

export async function createAccessRequestWithinLimit(
  request: NewAccessRequest,
): Promise<AccessRequestInsertResult> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let remainingRequests = ACCESS_REQUEST_MAX_PER_HOUR
    if (!isTrustedTestMode()) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [request.ipHash],
      )
      const countResult = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM "access_request"
         WHERE "ipHash" = $1
           AND "createdAt" > NOW() - INTERVAL '1 hour'`,
        [request.ipHash],
      )
      const requestCount = countResult.rows[0]?.count ?? 0
      const quota = getAccessRequestQuota(requestCount)
      if (!quota.allowed) {
        await client.query('COMMIT')
        return quota
      }
      remainingRequests = quota.remainingRequests
    }

    await client.query(
      `INSERT INTO "access_request"
         ("id", "code", "email", "userId", "token", "status", "deviceHint", "userAgent", "ipHash")
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
      [
        request.id,
        request.code ?? null,
        request.email ?? null,
        request.userId ?? null,
        request.token,
        request.deviceHint,
        request.userAgent,
        request.ipHash,
      ],
    )

    await client.query('COMMIT')
    return { allowed: true, remainingRequests }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('[access] Failed to roll back access request transaction:', rollbackError)
    }
    throw error
  } finally {
    client.release()
  }
}
