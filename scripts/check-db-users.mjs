import { Pool } from 'pg'

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
})

async function run() {
  const users = await pool.query('SELECT id, email, name FROM "user"')
  console.log('Users in 54322:', users.rows)
  const accounts = await pool.query('SELECT id, "userId", "providerId" FROM account')
  console.log('Accounts in 54322:', accounts.rows)
  await pool.end()
}

run().catch(console.error)
