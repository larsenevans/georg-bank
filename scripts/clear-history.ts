import '../lib/env'
import { pool } from '../lib/db'

async function clearHistory() {
  console.log('🧹 Starting to clear all payment and statement history from the database...')

  try {
    const client = await pool.connect()
    
    // 1. Delete all transactions
    console.log('🗑️ Deleting all transactions...')
    const txDeleteRes = await client.query('DELETE FROM "transaction"')
    console.log(`   ✅ Deleted ${txDeleteRes.rowCount} transactions.`)

    // 2. Reset bank account balances to 0
    console.log('🔄 Resetting all bank account balances to 0 EUR...')
    const accountUpdateRes = await client.query('UPDATE bank_account SET balance = 0')
    console.log(`   ✅ Reset ${accountUpdateRes.rowCount} bank accounts.`)

    // 3. Delete assistant conversations and messages
    console.log('🗑️ Deleting all assistant conversations and messages...')
    const msgDeleteRes = await client.query('DELETE FROM assistant_message')
    const convDeleteRes = await client.query('DELETE FROM assistant_conversation')
    console.log(`   ✅ Deleted ${msgDeleteRes.rowCount} messages and ${convDeleteRes.rowCount} conversations.`)

    client.release()
    console.log('\n🎉 Database cleared successfully! Everything is fresh and empty.')
    process.exit(0)

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('❌ Error clearing database:', errorMsg)
    process.exit(1)
  }
}

clearHistory()
