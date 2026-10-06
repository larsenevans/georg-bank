import fs from 'fs'
import path from 'path'
import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'
import { resolveDatabaseUrl } from '../lib/db/resolve-database-url'

// `npm run build` runs this before Next.js loads .env.local
loadEnv({ path: '.env.local' })

import {
  DEMO_DEFAULT_USER_EMAIL,
  DEMO_DEFAULT_USER_ID,
  DEMO_DEFAULT_USER_LEGACY_IDS,
  DEMO_DEFAULT_USER_NAME,
} from '../lib/demo-user'
import {
  GUEST_USER_EMAIL,
  GUEST_USER_NAME,
  GUEST_USER_PASSWORD,
} from '../lib/guest-auth'

function buildPool() {
  const rawUrl = resolveDatabaseUrl()
  if (!rawUrl) {
    console.warn('[ensure-db] No database URL configured, skipping.')
    return null
  }

  const hasSsl = rawUrl.includes('sslmode=')
  const connectionString = rawUrl
    .replace(/[?&]sslmode=[^&]*/g, '')
    .replace(/\?$/, '')

  return new Pool({
    connectionString,
    ssl: hasSsl ? { rejectUnauthorized: false } : undefined,
  })
}

async function tableExists(pool: Pool, tableName: string) {
  const result = await pool.query(
    `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1 LIMIT 1`,
    [tableName]
  )
  return result.rows.length > 0
}

async function applySqlFile(pool: Pool, filePath: string) {
  const sql = fs.readFileSync(filePath, 'utf8')
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await pool.query(statement)
  }
}

async function ensureSchema(pool: Pool) {
  if (await tableExists(pool, 'user')) {
    console.log('[ensure-db] Schema already present.')
    return
  }

  console.log('[ensure-db] Applying base schema...')
  await applySqlFile(
    pool,
    path.join(process.cwd(), 'drizzle', 'supabase_apply_0000.sql')
  )

  const migrationPath = path.join(
    process.cwd(),
    'drizzle',
    '0001_account_display_name.sql'
  )
  if (fs.existsSync(migrationPath)) {
    await applySqlFile(pool, migrationPath)
  }

  const statementProfileMigration = path.join(
    process.cwd(),
    'drizzle',
    '0002_bank_account_statement_profile.sql'
  )
  if (fs.existsSync(statementProfileMigration)) {
    await applySqlFile(pool, statementProfileMigration)
  }

  console.log('[ensure-db] Schema applied.')
}

async function ensureStatementProfileColumns(pool: Pool) {
  if (!(await tableExists(pool, 'bank_account'))) return

  const statementProfileMigration = path.join(
    process.cwd(),
    'drizzle',
    '0002_bank_account_statement_profile.sql'
  )
  if (fs.existsSync(statementProfileMigration)) {
    await applySqlFile(pool, statementProfileMigration)
  }
}

/** Access flow tables (idempotent CREATE TABLE IF NOT EXISTS) — needed by the welcome gate + e2e. */
async function ensureAccessFlowTables(pool: Pool) {
  if (await tableExists(pool, 'access_session')) return

  const accessFlowMigration = path.join(process.cwd(), 'drizzle', '0003_access_flow.sql')
  if (fs.existsSync(accessFlowMigration)) {
    await applySqlFile(pool, accessFlowMigration)
    console.log('[ensure-db] Access flow tables applied.')
  }
}

async function ensureGuestUser(pool: Pool) {
  const { isDedicatedGuestEmail, ensureGuestCredentialAccount } = await import(
    '../lib/guest-auth'
  )
  if (!isDedicatedGuestEmail(GUEST_USER_EMAIL)) {
    console.error(
      '[ensure-db] Skipping guest ensure: GUEST_USER_EMAIL must end with @local.test, got:',
      GUEST_USER_EMAIL
    )
    return
  }

  const existing = await pool.query(
    'SELECT 1 FROM "user" WHERE email = $1 LIMIT 1',
    [GUEST_USER_EMAIL]
  )

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE "user" SET name = $1, "updatedAt" = NOW() WHERE email = $2 AND name IS DISTINCT FROM $1`,
      [GUEST_USER_NAME, GUEST_USER_EMAIL]
    )
    const synced = await ensureGuestCredentialAccount(
      GUEST_USER_EMAIL,
      GUEST_USER_PASSWORD
    ).catch(() => false)
    console.log(
      synced
        ? '[ensure-db] Guest user exists; credential password synced.'
        : '[ensure-db] Guest user already exists.'
    )
    return
  }

  const { auth } = await import('../lib/auth')
  await auth.api.signUpEmail({
    body: {
      email: GUEST_USER_EMAIL,
      password: GUEST_USER_PASSWORD,
      name: GUEST_USER_NAME,
    },
  })
  console.log('[ensure-db] Guest user created.')
}

const DEMO_USER_ID_REF_TABLES = [
  'bank_account',
  'transaction',
  'session',
  'account',
  'push_subscription',
  'assistant_conversation',
  'assistant_message',
  'assistant_run_log',
] as const

/** Move legacy demo user rows (e.g. user-filip-default) onto user-peter-default. */
async function migrateLegacyDemoUserIds(pool: Pool) {
  if (!(await tableExists(pool, 'user'))) return

  for (const legacyId of DEMO_DEFAULT_USER_LEGACY_IDS) {
    const legacy = await pool.query(
      `SELECT id, name, email, "emailVerified", image, "createdAt" FROM "user" WHERE id = $1 LIMIT 1`,
      [legacyId]
    )
    if (legacy.rows.length === 0) continue

    const target = await pool.query(
      `SELECT 1 FROM "user" WHERE id = $1 LIMIT 1`,
      [DEMO_DEFAULT_USER_ID]
    )

    await pool.query('BEGIN')
    try {
      if (target.rows.length === 0) {
        const row = legacy.rows[0]
        // Free unique email before inserting the renamed row.
        await pool.query(
          `UPDATE "user" SET email = $1, "updatedAt" = NOW() WHERE id = $2`,
          [`migrated-${legacyId}@local.test`, legacyId]
        )
        await pool.query(
          `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            DEMO_DEFAULT_USER_ID,
            row.name || DEMO_DEFAULT_USER_NAME,
            DEMO_DEFAULT_USER_EMAIL,
            row.emailVerified ?? true,
            row.image ?? null,
            row.createdAt ?? new Date(),
          ]
        )
      }

      for (const table of DEMO_USER_ID_REF_TABLES) {
        if (!(await tableExists(pool, table))) continue
        await pool.query(
          `UPDATE "${table}" SET "userId" = $1 WHERE "userId" = $2`,
          [DEMO_DEFAULT_USER_ID, legacyId]
        )
      }

      await pool.query(`DELETE FROM "user" WHERE id = $1`, [legacyId])
      await pool.query('COMMIT')
      console.log(
        `[ensure-db] Migrated demo user ${legacyId} → ${DEMO_DEFAULT_USER_ID}.`
      )
    } catch (error) {
      await pool.query('ROLLBACK')
      throw error
    }
  }
}

/** Demo account used by dashboard2 payments (user-peter-default). Keep funded for CI. */
async function ensureDemoAccountBalance(pool: Pool) {
  if (!(await tableExists(pool, 'bank_account'))) {
    console.log('[ensure-db] bank_account table missing, skip demo balance seed.')
    return
  }

  const SEED_CENTS = 885_000 // €8850 — demo account target balance
  const defaultUserId = DEMO_DEFAULT_USER_ID

  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, "updatedAt" = NOW()`,
    [defaultUserId, DEMO_DEFAULT_USER_NAME, DEMO_DEFAULT_USER_EMAIL]
  )

  const existing = await pool.query(
    `SELECT id, balance FROM "bank_account" WHERE "userId" = $1 LIMIT 1`,
    [defaultUserId]
  )

  if (existing.rows.length === 0) {
    // Reclaim shared demo IBAN if it still belongs to a legacy user id.
    const byIban = await pool.query(
      `SELECT id, balance FROM "bank_account" WHERE "accountNumber" = $1 LIMIT 1`,
      ['SK3109000000005012345678']
    )
    if (byIban.rows.length > 0) {
      await pool.query(
        `UPDATE "bank_account"
         SET "userId" = $1,
             "productLabel" = COALESCE("productLabel", 'Osobný účet'),
             "holderAddressLine1" = COALESCE("holderAddressLine1", 'Tomášikova 12'),
             "holderAddressLine2" = COALESCE("holderAddressLine2", '831 04 Bratislava'),
             "updatedAt" = NOW()
         WHERE id = $2`,
        [defaultUserId, byIban.rows[0].id]
      )
      console.log('[ensure-db] Demo bank account reclaimed onto peter (balance preserved).')
      return
    }

    await pool.query(
      `INSERT INTO "bank_account" (
         id, "userId", "accountNumber", "displayName", "accountType",
         "productLabel", "holderAddressLine1", "holderAddressLine2",
         balance, currency, "isActive", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, 'SK3109000000005012345678', 'Osobný účet', 'checking',
         'Osobný účet', 'Tomášikova 12', '831 04 Bratislava',
         $3, 'EUR', true, NOW(), NOW()
       )
       ON CONFLICT ("accountNumber") DO UPDATE
         SET "userId" = EXCLUDED."userId",
             "productLabel" = COALESCE("bank_account"."productLabel", EXCLUDED."productLabel"),
             "holderAddressLine1" = COALESCE("bank_account"."holderAddressLine1", EXCLUDED."holderAddressLine1"),
             "holderAddressLine2" = COALESCE("bank_account"."holderAddressLine2", EXCLUDED."holderAddressLine2"),
             "updatedAt" = NOW()`,
      ['acc-demo-default', defaultUserId, SEED_CENTS]
    )
    console.log('[ensure-db] Demo bank account seeded with €100.')
    return
  }

  const current = Number(existing.rows[0].balance ?? 0)
  await pool.query(
    `UPDATE "bank_account"
     SET "productLabel" = COALESCE("productLabel", 'Osobný účet'),
         "holderAddressLine1" = COALESCE("holderAddressLine1", 'Tomášikova 12'),
         "holderAddressLine2" = COALESCE("holderAddressLine2", '831 04 Bratislava'),
         "updatedAt" = NOW()
     WHERE id = $1`,
    [existing.rows[0].id]
  )
  console.log(`[ensure-db] Demo account balance preserved (${current} cents).`)
}

/**
 * Guest session (admin@local.test) powers most Playwright chromium specs.
 * Without a funded checking account, /dashboardpayment and statement generator
 * redirect to /dashboard2, and Menu sub-header omits "| €".
 */
async function ensureGuestBankAccount(pool: Pool) {
  if (!(await tableExists(pool, 'bank_account'))) {
    console.log('[ensure-db] bank_account table missing, skip guest balance seed.')
    return
  }

  const { isDedicatedGuestEmail } = await import('../lib/guest-auth')
  if (!isDedicatedGuestEmail(GUEST_USER_EMAIL)) {
    console.error(
      '[ensure-db] Skipping guest bank seed: GUEST_USER_EMAIL must end with @local.test, got:',
      GUEST_USER_EMAIL
    )
    return
  }

  const SEED_CENTS = 666_000
  const GUEST_IBAN = 'SK3109000000005012345679'
  const GUEST_ACCOUNT_ID = 'acc-guest-default'

  const user = await pool.query(`SELECT id FROM "user" WHERE email = $1 LIMIT 1`, [
    GUEST_USER_EMAIL,
  ])
  if (user.rows.length === 0) {
    console.warn('[ensure-db] Guest user missing; cannot seed bank account.')
    return
  }

  const guestUserId = user.rows[0].id as string
  const existing = await pool.query(
    `SELECT id, balance, "displayName" FROM "bank_account"
     WHERE "userId" = $1 AND "accountType" = 'checking' LIMIT 1`,
    [guestUserId]
  )

  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO "bank_account" (
         id, "userId", "accountNumber", "displayName", "accountType",
         "productLabel", "holderAddressLine1", "holderAddressLine2",
         balance, currency, "isActive", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, 'Business účet', 'checking',
         'Business účet', 'Testovacia 1', '811 01 Bratislava',
         $4, 'EUR', true, NOW(), NOW()
       )
       ON CONFLICT ("accountNumber") DO UPDATE
         SET "userId" = EXCLUDED."userId",
             "displayName" = EXCLUDED."displayName",
             "productLabel" = COALESCE("bank_account"."productLabel", EXCLUDED."productLabel"),
             "holderAddressLine1" = COALESCE("bank_account"."holderAddressLine1", EXCLUDED."holderAddressLine1"),
             "holderAddressLine2" = COALESCE("bank_account"."holderAddressLine2", EXCLUDED."holderAddressLine2"),
             "updatedAt" = NOW()`,
      [GUEST_ACCOUNT_ID, guestUserId, GUEST_IBAN, SEED_CENTS]
    )
    console.log('[ensure-db] Guest checking account seeded with funded Business účet.')
    return
  }

  const row = existing.rows[0]
  const current = Number(row.balance ?? 0)
  await pool.query(
    `UPDATE "bank_account"
     SET "displayName" = 'Business účet',
         "productLabel" = COALESCE(NULLIF("productLabel", ''), 'Business účet'),
         "holderAddressLine1" = COALESCE("holderAddressLine1", 'Testovacia 1'),
         "holderAddressLine2" = COALESCE("holderAddressLine2", '811 01 Bratislava'),
         "updatedAt" = NOW()
     WHERE id = $1`,
    [row.id]
  )
  console.log(`[ensure-db] Guest account balance preserved (${current} cents).`)
}

export async function ensureDatabase() {
  const pool = buildPool()
  if (!pool) return

  try {
    await pool.query('SELECT 1')
    await ensureSchema(pool)
    await ensureStatementProfileColumns(pool)
    await ensureAccessFlowTables(pool)
    await ensureGuestUser(pool)
    await migrateLegacyDemoUserIds(pool)
    await ensureDemoAccountBalance(pool)
    await ensureGuestBankAccount(pool)
  } finally {
    await pool.end()
  }
}

async function main() {
  try {
    await ensureDatabase()
  } catch (error) {
    if (process.env.VERCEL === '1') {
      console.warn(
        '[ensure-db] Continuing Vercel build without DB setup:',
        error instanceof Error ? error.message : error
      )
      return
    }
    console.warn(
      '[ensure-db] Skipping database setup:',
      error instanceof Error ? error.message : error
    )
  }
}

if (process.argv[1]?.includes('ensure-db')) {
  main().catch((error) => {
    console.error('[ensure-db] Failed:', error)
    process.exit(1)
  })
}