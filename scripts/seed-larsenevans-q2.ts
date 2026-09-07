/* eslint-disable @typescript-eslint/no-explicit-any */
import '../lib/env'
import { pool } from '../lib/db'
import crypto from 'crypto'

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const randomDate = (year: number, month: number, startDay: number, endDay: number) => {
  const day = randomInt(startDay, endDay)
  const hour = randomInt(8, 18)
  const min = randomInt(0, 59)
  const sec = randomInt(0, 59)
  return new Date(Date.UTC(year, month - 1, day, hour, min, sec))
}

const generateId = () => 'txn_' + crypto.randomBytes(16).toString('hex')

const B2B_CLIENTS = [
  'TechCorp Solutions s.r.o.',
  'Global Ventures LLC',
  'NextGen AI Systems',
  'Nexus Digital a.s.',
  'Innovate IT',
  'FinTech Dynamics',
]

const VENDORS = [
  { name: 'Amazon Web Services', min: 800, max: 2500 },
  { name: 'Google Cloud EMEA', min: 500, max: 1500 },
  { name: 'Vercel Inc.', min: 40, max: 150 },
  { name: 'Stripe Payments', min: 20, max: 100 },
  { name: 'GitHub Pro', min: 40, max: 80 },
  { name: 'Slack Technologies', min: 80, max: 200 },
  { name: 'DigitalOcean', min: 100, max: 400 },
  { name: 'Notion Labs', min: 20, max: 50 },
]

const EXPENSES = [
  'Nákup HW - Alza.sk',
  'Marketingová kampaň - Google Ads',
  'Právne služby - JUDr. Novák',
  'Prenájom kancelárie - Sky Park',
  'Účtovné služby - TaxPro s.r.o.',
  'Firemná večera - UFO Restaurant',
  'Pohonné hmoty - OMV',
]

type SeedTxn = {
  id: string
  amount: number
  type: 'deposit' | 'withdrawal'
  description: string
  createdAt: Date
  fromAccountId: string | null
  toAccountId: string | null
  balanceBefore?: number
  balanceAfter?: number
}

async function seedQ2() {
  console.log('🌱 Starting Q2 realistic data generation for larsenevans@proton.me...')

  try {
    const client = await pool.connect()

    const userRes = await client.query('SELECT id FROM "user" WHERE email = $1', ['larsenevans@proton.me'])
    if (userRes.rows.length === 0) {
      console.log('❌ User larsenevans@proton.me not found! Prihlás sa raz na webe, aby sa vytvoril účet.')
      process.exit(1)
    }
    const userId = userRes.rows[0].id
    const accountId = 'acc_larsen_01'

    await client.query(`
      INSERT INTO bank_account (id, "userId", "accountNumber", "displayName", "accountType", balance, currency, "isActive")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT ("accountNumber") DO NOTHING
    `, [accountId, userId, 'SK1122334455667788990011', 'Business účet Larsen', 'checking', 0, 'EUR', true])

    await client.query('DELETE FROM transaction WHERE "fromAccountId" = $1 OR "toAccountId" = $1', [accountId])

    let currentBalance = 1500000 // 15 000,00 EUR
    const transactionsToInsert: SeedTxn[] = []

    const mode = process.env.MODE || 'BALANCED' // INCOME_HEAVY, EXPENSE_HEAVY, BALANCED
    const totalVolume = randomInt(100000, 110000) * 100 // 100k - 110k celkový obrat

    const generateMonth = (year: number, month: number) => {
      let monthlyIncome = 0
      let monthlyExpense = 0
      
      let targetIncome = 0
      let targetExpense = 0

      if (mode === 'INCOME_HEAVY') {
        targetIncome = totalVolume * 0.7 // 70% príjmy
        targetExpense = totalVolume * 0.3 // 30% výdavky
      } else if (mode === 'EXPENSE_HEAVY') {
        targetIncome = totalVolume * 0.3 // 30% príjmy
        targetExpense = totalVolume * 0.7 // 70% výdavky
      } else {
        // BALANCED (zhruba pol na pol, jemne ziskové)
        targetIncome = randomInt(50000, 65000) * 100
        targetExpense = randomInt(45000, 55000) * 100
      }

      while (monthlyIncome < targetIncome) {
        const amount = randomInt(3000, 15000) * 100
        monthlyIncome += amount
        const clientName = B2B_CLIENTS[randomInt(0, B2B_CLIENTS.length - 1)]
        const invoiceNum = `FA${year}${month.toString().padStart(2, '0')}${randomInt(10, 99)}`

        transactionsToInsert.push({
          id: generateId(),
          amount,
          type: 'deposit',
          description: `${clientName}|Úhrada faktúry ${invoiceNum}|Ostatné nepravidelné príjmy`,
          createdAt: randomDate(year, month, 1, 28),
          fromAccountId: null,
          toAccountId: accountId,
        })
      }

      // Fixné výdavky zohľadníme iba ak targetExpense je dostatočne veľký, inak ich zmenšíme
      const baseSalary = mode === 'INCOME_HEAVY' ? 5000 : 20000
      const salaryAmount = randomInt(baseSalary - 2000, baseSalary + 2000) * 100
      monthlyExpense += salaryAmount
      transactionsToInsert.push({
        id: generateId(),
        amount: salaryAmount,
        type: 'withdrawal',
        description: `Mzdy zamestnancov|Hromadný príkaz za ${month - 1 < 1 ? 12 : month - 1}/${month - 1 < 1 ? year - 1 : year}|Mzdy`,
        createdAt: randomDate(year, month, 12, 15),
        fromAccountId: accountId,
        toAccountId: null,
      })

      const baseTax = mode === 'INCOME_HEAVY' ? 3000 : 12000
      const taxAmount = randomInt(baseTax - 2000, baseTax + 2000) * 100
      monthlyExpense += taxAmount
      transactionsToInsert.push({
        id: generateId(),
        amount: taxAmount,
        type: 'withdrawal',
        description: `Štátna správa|Odvody SP, ZP a daň z príjmu|Odvody a dane`,
        createdAt: randomDate(year, month, 18, 22),
        fromAccountId: accountId,
        toAccountId: null,
      })

      while (monthlyExpense < targetExpense) {
        if (Math.random() > 0.5) {
          const vendor = VENDORS[randomInt(0, VENDORS.length - 1)]
          const amount = randomInt(vendor.min, vendor.max) * 100
          monthlyExpense += amount
          transactionsToInsert.push({
            id: generateId(),
            amount,
            type: 'withdrawal',
            description: `${vendor.name}|Platba kartou – SaaS|Prevádzkové náklady`,
            createdAt: randomDate(year, month, 1, 28),
            fromAccountId: accountId,
            toAccountId: null,
          })
        } else {
          const expenseDesc = EXPENSES[randomInt(0, EXPENSES.length - 1)]
          const amount = randomInt(100, 2500) * 100
          monthlyExpense += amount
          transactionsToInsert.push({
            id: generateId(),
            amount,
            type: 'withdrawal',
            description: `${expenseDesc.split(' - ')[0]}|${expenseDesc}|Nezaradené výdavky`,
            createdAt: randomDate(year, month, 1, 28),
            fromAccountId: accountId,
            toAccountId: null,
          })
        }
      }

      console.log(
        `📊 Mesiac ${year}-${month.toString().padStart(2, '0')}: Príjmy ${(monthlyIncome / 100).toFixed(2)} €, Výdavky ${(monthlyExpense / 100).toFixed(2)} €`
      )
    }

    generateMonth(2026, 4)
    generateMonth(2026, 5)
    generateMonth(2026, 6)

    transactionsToInsert.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    for (const txn of transactionsToInsert) {
      txn.balanceBefore = currentBalance
      currentBalance += txn.type === 'deposit' ? txn.amount : -txn.amount
      txn.balanceAfter = currentBalance

      await client.query(`
        INSERT INTO transaction (id, "userId", "fromAccountId", "toAccountId", amount, "balanceBefore", "balanceAfter", type, description, status, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        txn.id,
        userId,
        txn.fromAccountId,
        txn.toAccountId,
        txn.amount,
        txn.balanceBefore,
        txn.balanceAfter,
        txn.type,
        txn.description,
        'completed',
        txn.createdAt,
        txn.createdAt,
      ])
    }

    await client.query('UPDATE bank_account SET balance = $1 WHERE id = $2', [currentBalance, accountId])

    client.release()
    console.log(`\n🎉 Úspešne vložených ${transactionsToInsert.length} transakcií!`)
    console.log(`💰 Finálny zostatok: ${(currentBalance / 100).toFixed(2)} €`)
    process.exit(0)
  } catch (err: any) {
    console.error('❌ Error seeding data:', err.message)
    process.exit(1)
  }
}

seedQ2()