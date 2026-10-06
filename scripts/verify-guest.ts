import { config } from 'dotenv'
config({ path: '.env.local' })
import { pool } from '../lib/db'

async function check() {
  const email = 'guest@local.test'
  const u = await pool.query('SELECT id, email, name FROM "user" WHERE email = $1', [email])
  console.log('Guest user in DB:', u.rows)
  if (u.rows.length > 0) {
    const a = await pool.query('SELECT id, "userId", "providerId" FROM account WHERE "userId" = $1', [u.rows[0].id])
    console.log('Guest account credentials in DB:', a.rows)
    const b = await pool.query('SELECT id, "accountNumber", balance, currency FROM bank_account WHERE "userId" = $1', [u.rows[0].id])
    console.log('Guest bank account in DB:', b.rows)
  }
  await pool.end()
}

check().catch(console.error)
