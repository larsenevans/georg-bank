'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bankAccount, transaction, user } from '@/lib/db/schema'
import { and, eq, desc, or } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { v4 as uuidv4 } from 'uuid'
import { attachPaymentConfirmationUrl } from '@/lib/banking-pdf-url'
import { encodeTransactionDescription } from '@/lib/payment-confirmation-from-transaction'
import { triggerProcessPaymentWebhook } from '@/lib/trigger-process-payment-webhook'
import {
  afterTransactionSuccess,
  clearAccessCookieFromServerAction,
  readAccessCookieToken,
  requireAccessForTransaction,
} from '@/lib/access-session'
import { isSuperadminCode, isSuperadminToken } from '@/lib/access-flow'

/**
 * Resolve the current user id from the Better Auth session.
 * Every server action that touches user data MUST go through this helper.
 */
async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

type BankingDbClient = Pick<typeof db, 'select' | 'insert'>

function createDemoAccountNumber() {
  const random8Digits = Math.floor(10000000 + Math.random() * 90000000).toString()
  return `SK67 0900 0000 0050 ${random8Digits.slice(0, 4)} ${random8Digits.slice(4)}`
}

async function ensureCheckingAccountForUser(
  client: BankingDbClient,
  userId: string,
  initialBalance = 0
) {
  const existingAccount = await client
    .select()
    .from(bankAccount)
    .where(
      and(
        eq(bankAccount.userId, userId),
        eq(bankAccount.accountType, 'checking')
      )
    )
    .limit(1)

  if (existingAccount[0]) return existingAccount[0]

  const createdAccount = await client
    .insert(bankAccount)
    .values({
      id: uuidv4(),
      userId,
      accountNumber: createDemoAccountNumber(),
      accountType: 'checking',
      currency: 'EUR',
      balance: initialBalance,
    })
    .returning()

  return createdAccount[0]
}

// Bank Account Actions
export async function getBankAccounts() {
  const userId = await getUserId()
  return db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.userId, userId))
    .orderBy(desc(bankAccount.createdAt))
}

export async function createBankAccount(
  accountType: 'checking' | 'savings',
  currency: string = 'EUR'
) {
  const userId = await getUserId()

  const result = await db
    .insert(bankAccount)
    .values({
      id: uuidv4(),
      userId,
      accountNumber: createDemoAccountNumber(),
      accountType,
      currency,
      balance: 0,
    })
    .returning()

  revalidatePath('/dashboard')
  return result[0]
}

export async function getAccountBalance(accountId: string) {
  const userId = await getUserId()
  const account = await db
    .select()
    .from(bankAccount)
    .where(
      and(
        eq(bankAccount.id, accountId),
        eq(bankAccount.userId, userId)
      )
    )
    .limit(1)

  return account[0]?.balance || 0
}

// Transaction Actions
export async function getTransactions(limit: number = 20) {
  const userId = await getUserId()
  const cookieToken = await readAccessCookieToken()
  const isSuperadmin = Boolean(
    isSuperadminToken(cookieToken) || isSuperadminCode(cookieToken)
  )
  return db
    .select()
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        isSuperadmin ? undefined : eq(transaction.isSuperadmin, false)
      )
    )
    .orderBy(desc(transaction.createdAt))
    .limit(limit)
}

export async function getAccountTransactions(
  accountId: string,
  limit: number = 20
) {
  const userId = await getUserId()
  const cookieToken = await readAccessCookieToken()
  const isSuperadmin = Boolean(
    isSuperadminToken(cookieToken) || isSuperadminCode(cookieToken)
  )
  return db
    .select()
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        isSuperadmin ? undefined : eq(transaction.isSuperadmin, false),
        or(
          eq(transaction.fromAccountId, accountId),
          eq(transaction.toAccountId, accountId)
        )
      )
    )
    .orderBy(desc(transaction.createdAt))
    .limit(limit)
}

export async function createTransaction(
  fromAccountId: string,
  toAccountId: string | null,
  amount: string,
  type: 'transfer' | 'deposit' | 'withdrawal',
  description?: string
) {
  const accessGate = await requireAccessForTransaction(await readAccessCookieToken())
  if (!accessGate.ok) {
    if (accessGate.status === 403 && accessGate.error !== 'transaction_already_used') {
      await clearAccessCookieFromServerAction()
    }
    throw new Error(accessGate.error === 'transaction_already_used'
      ? 'Platbu ste už využili. Môžete si stiahnuť PDF výpis.'
      : 'Vyžaduje sa aktívna access session.')
  }
  const accessSessionRow = accessGate.skipped ? null : accessGate.session

  const userId = await getUserId()

  // Verify the fromAccount belongs to the user
  const fromAccount = await db
    .select()
    .from(bankAccount)
    .where(
      and(
        eq(bankAccount.id, fromAccountId),
        eq(bankAccount.userId, userId)
      )
    )
    .limit(1)

  if (!fromAccount[0]) {
    throw new Error('Account not found')
  }

  const currentBalance = fromAccount[0].balance as number
  const transactionAmount = Math.round(parseFloat(amount) * 100)

  if (currentBalance < transactionAmount) {
    throw new Error('Insufficient funds')
  }

  // Create transaction record
  const newBalance = currentBalance - transactionAmount
  const newTransaction = await db
    .insert(transaction)
    .values({
      id: uuidv4(),
      userId,
      fromAccountId,
      toAccountId,
      amount: transactionAmount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      type,
      description: description || '',
      status: 'completed',
    })
    .returning()

  // Update account balance
  await db
    .update(bankAccount)
    .set({ balance: newBalance })
    .where(eq(bankAccount.id, fromAccountId))

  if (type === 'withdrawal' || type === 'transfer') {
    await attachPaymentConfirmationUrl(newTransaction[0].id)
    triggerProcessPaymentWebhook({
      transactionId: newTransaction[0].id,
      senderId: userId,
      amount,
      description: description || '',
    })
  }

  if (accessSessionRow) {
    await afterTransactionSuccess(accessSessionRow)
  }

  revalidatePath('/dashboard')
  return newTransaction[0]
}

export async function depositFunds(
  accountId: string,
  amount: string,
  description?: string
) {
  const { MANUAL_TOPUP_BLOCKED_MESSAGE, MANUAL_TOPUP_DISABLED } = await import(
    '@/lib/topup-rules'
  )
  if (MANUAL_TOPUP_DISABLED) {
    throw new Error(MANUAL_TOPUP_BLOCKED_MESSAGE)
  }

  const userId = await getUserId()

  const account = await db
    .select()
    .from(bankAccount)
    .where(and(eq(bankAccount.id, accountId), eq(bankAccount.userId, userId)))
    .limit(1)

  if (!account[0]) {
    throw new Error('Account not found')
  }

  const currentBalance = account[0].balance as number
  const depositAmount = Math.round(parseFloat(amount) * 100)
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    throw new Error('Suma musí byť väčšia ako 0.')
  }

  const newBalance = currentBalance + depositAmount

  await db.insert(transaction).values({
    id: uuidv4(),
    userId,
    fromAccountId: accountId,
    toAccountId: null,
    amount: depositAmount,
    balanceBefore: currentBalance,
    balanceAfter: newBalance,
    type: 'deposit',
    description: description || 'Deposit',
    status: 'completed',
  })

  await db
    .update(bankAccount)
    .set({ balance: newBalance })
    .where(eq(bankAccount.id, accountId))

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/accounts/${accountId}`)
}

// Internal transfer by email
export async function internalTransferByEmail(
  fromAccountId: string,
  toEmail: string,
  amount: string,
  description?: string
) {
  const accessGate = await requireAccessForTransaction(await readAccessCookieToken())
  if (!accessGate.ok) {
    if (accessGate.status === 403 && accessGate.error !== 'transaction_already_used') {
      await clearAccessCookieFromServerAction()
    }
    throw new Error(accessGate.error === 'transaction_already_used'
      ? 'Platbu ste už využili. Môžete si stiahnuť PDF výpis.'
      : 'Vyžaduje sa aktívna access session.')
  }
  const accessSessionRow = accessGate.skipped ? null : accessGate.session

  const userId = await getUserId()
  const normalizedEmail = toEmail.trim().toLowerCase()
  const transactionAmount = Math.round(parseFloat(amount) * 100)

  if (!normalizedEmail) {
    throw new Error('Zadajte e-mail príjemcu.')
  }

  if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
    throw new Error('Suma platby musí byť väčšia ako 0.')
  }

  const newTransaction = await db.transaction(async (tx) => {
    // 1. Get sender's account and verify ownership
    const fromAccountResult = await tx
      .select()
      .from(bankAccount)
      .where(
        and(
          eq(bankAccount.id, fromAccountId),
          eq(bankAccount.userId, userId)
        )
      )
      .limit(1)

    if (!fromAccountResult[0]) {
      throw new Error('Zdrojový účet nebol nájdený.')
    }

    const currentBalance = fromAccountResult[0].balance as number

    if (currentBalance < transactionAmount) {
      throw new Error('Nedostatok prostriedkov na účte.')
    }

    // 2. Find the recipient user by email
    const recipientUserResult = await tx
      .select()
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1)

    if (!recipientUserResult[0]) {
      throw new Error('Príjemca s týmto e-mailom v systéme neexistuje.')
    }

    const recipientUserId = recipientUserResult[0].id

    if (recipientUserId === userId) {
      throw new Error('Nemôžete poslať platbu na vlastný e-mail.')
    }

    const senderUserResult = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    // 3. Ensure recipient has a checking account even if they never opened dashboard yet.
    const recipientAccount = await ensureCheckingAccountForUser(tx, recipientUserId)
    const toAccountId = recipientAccount.id
    const recipientCurrentBalance = recipientAccount.balance as number

    // 4. Perform the transfer updates
    const newSenderBalance = currentBalance - transactionAmount
    const newRecipientBalance = recipientCurrentBalance + transactionAmount

    // 4a. Update sender
    await tx
      .update(bankAccount)
      .set({ balance: newSenderBalance })
      .where(eq(bankAccount.id, fromAccountId))

    // 4b. Update recipient
    await tx
      .update(bankAccount)
      .set({ balance: newRecipientBalance })
      .where(eq(bankAccount.id, toAccountId))

    const recipientLabel =
      recipientUserResult[0].name || recipientUserResult[0].email || normalizedEmail
    const senderLabel =
      senderUserResult[0]?.name || senderUserResult[0]?.email || 'Odosielateľ'

    // 4c. Create withdrawal transaction for sender
    const senderTransaction = await tx
      .insert(transaction)
      .values({
        id: uuidv4(),
        userId,
        fromAccountId,
        toAccountId,
        amount: transactionAmount,
        balanceBefore: currentBalance,
        balanceAfter: newSenderBalance,
        type: 'withdrawal',
        description: encodeTransactionDescription({
          recipientName: recipientLabel,
          note: description || 'Interný prevod na e-mail',
          category: 'Nezaradené výdavky',
          recipientAccountOrEmail: normalizedEmail,
        }),
        status: 'completed',
      })
      .returning()

    // 4d. Create deposit transaction for recipient
    await tx
      .insert(transaction)
      .values({
        id: uuidv4(),
        userId: recipientUserId,
        fromAccountId,
        toAccountId,
        amount: transactionAmount,
        balanceBefore: recipientCurrentBalance,
        balanceAfter: newRecipientBalance,
        type: 'deposit',
        description: `${senderLabel}|${description || 'Prijatá platba z e-mailu'}|Ostatné nepravidelné príjmy`,
        status: 'completed',
      })

    return { transaction: senderTransaction[0], recipientId: recipientUserId }
  })

  if (newTransaction.transaction?.id) {
    triggerProcessPaymentWebhook({
      transactionId: newTransaction.transaction.id,
      senderId: userId,
      recipientId: newTransaction.recipientId,
      amount,
      description,
    })
  }

  if (newTransaction.transaction?.id) {
    await attachPaymentConfirmationUrl(newTransaction.transaction.id)
  }

  if (accessSessionRow) {
    await afterTransactionSuccess(accessSessionRow)
    await clearAccessCookieFromServerAction()
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/accounts/${fromAccountId}`)
  return newTransaction.transaction
}

export async function deleteTransaction(transactionId: string, pin: string) {
  const { isValidAppPin } = await import('@/lib/app-pin')
  if (!isValidAppPin(pin)) {
    throw new Error('Nesprávny PIN kód.')
  }

  const userId = await getUserId()

  // Verify the transaction belongs to the user
  const txnResult = await db
    .select()
    .from(transaction)
    .where(
      and(
        eq(transaction.id, transactionId),
        eq(transaction.userId, userId)
      )
    )
    .limit(1)

  const txn = txnResult[0]
  if (!txn) {
    throw new Error('Transakcia nebola nájdená.')
  }

  // Delete the transaction
  await db
    .delete(transaction)
    .where(
      and(
        eq(transaction.id, transactionId),
        eq(transaction.userId, userId)
      )
    )

  revalidatePath('/dashboard')
  if (txn.fromAccountId) {
    revalidatePath(`/dashboard/accounts/${txn.fromAccountId}`)
  }
  if (txn.toAccountId) {
    revalidatePath(`/dashboard/accounts/${txn.toAccountId}`)
  }

  return { success: true }
}

export async function deleteAllTransactions(pin: string) {
  const { isValidAppPin } = await import('@/lib/app-pin')
  if (!isValidAppPin(pin)) {
    throw new Error('Nesprávny PIN kód.')
  }

  const userId = await getUserId()

  // Delete all transactions for the current user
  await db
    .delete(transaction)
    .where(eq(transaction.userId, userId))

  revalidatePath('/dashboard')
  return { success: true }
}
