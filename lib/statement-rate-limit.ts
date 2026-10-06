import { isTrustedTestMode } from '@/lib/access-flow'

const WINDOW_MS = 60 * 60 * 1000
const MAX_REQUESTS = 5

const buckets = new Map<string, number[]>()

export function checkStatementGenerationRateLimit(userId: string) {
  if (isTrustedTestMode()) {
    return true
  }
  const now = Date.now()
  const existing = buckets.get(userId) ?? []
  const recent = existing.filter((timestamp) => now - timestamp < WINDOW_MS)

  if (recent.length >= MAX_REQUESTS) {
    return false
  }

  recent.push(now)
  buckets.set(userId, recent)
  return true
}