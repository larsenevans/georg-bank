import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { resolveDatabaseUrl } from './resolve-database-url'

// Strip ALL sslmode params from the URL so that the `pg` driver never
// internally overrides our explicit ssl object (pg ignores our
// { rejectUnauthorized: false } when sslmode=require is in the URL string).
function buildConnectionString(raw?: string): string | undefined {
  if (!raw) return undefined
  return raw
    .replace(/[?&]sslmode=[^&]*/g, '')  // remove ?sslmode=… or &sslmode=…
    .replace(/\?$/, '')                   // clean trailing '?' if nothing left
}

const rawUrl = resolveDatabaseUrl() || process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const hasSsl  = rawUrl?.includes('sslmode=') ?? false
const connectionString = buildConnectionString(rawUrl)

export const pool = new Pool({
  connectionString,
  // Always allow self‑signed certs on VPS; set to true only when you have
  // a proper CA‑signed certificate.
  ssl: hasSsl ? { rejectUnauthorized: false } : undefined,
})

export const db = drizzle(pool, { schema })
