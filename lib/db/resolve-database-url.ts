/**
 * Resolves PostgreSQL connection string for Drizzle / Better Auth.
 *
 * Priority:
 * 1. DATABASE_URL (if not localhost placeholder)
 * 2. SUPABASE_DATABASE_URL
 * 3. Built from NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD + pooler host
 */
export function resolveDatabaseUrl(): string | undefined {
  const direct = process.env.DATABASE_URL?.trim()
  if (direct && !isLocalPlaceholder(direct)) {
    return direct
  }

  const supabaseDirect = process.env.SUPABASE_DATABASE_URL?.trim()
  if (supabaseDirect) {
    return supabaseDirect
  }

  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (supabaseUrl && password) {
    const ref = supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]
    const region = process.env.SUPABASE_REGION?.trim() || 'eu-west-3'
    const host =
      process.env.SUPABASE_POOLER_HOST?.trim() ||
      `aws-0-${region}.pooler.supabase.com`

    // Supavisor Transaction Pooler (port 6543) for Vercel/serverless.
    return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres?sslmode=require`
  }

  if (supabaseUrl && !password) {
    console.warn(
      '[db] NEXT_PUBLIC_SUPABASE_URL is set but SUPABASE_DB_PASSWORD is missing. ' +
        'Add SUPABASE_DB_PASSWORD to .env.local (Supabase → Project Settings → Database).'
    )
  }

  // Last resort: explicit local dev URL (only when Supabase is not configured).
  if (direct && !supabaseUrl) {
    return direct
  }

  return undefined
}

function isLocalPlaceholder(url: string): boolean {
  return (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    // malformed local URL without credentials
    /^postgresql:\/\/localhost/i.test(url) ||
    /^postgresql:\/\/127\.0\.0\.1/i.test(url)
  )
}
