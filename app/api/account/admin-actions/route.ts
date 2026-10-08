import { NextRequest, NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { accessRequest, accessSession, bankAccount, transaction } from '@/lib/db/schema'
import { isSuperadminToken } from '@/lib/access-flow'
import { readAccessCookieToken } from '@/lib/access-session'
import { DEMO_ACCOUNT_NUMBER, DEMO_DEFAULT_USER_ID, pickDemoBankAccount } from '@/lib/demo-user'
import { sendWebPushNotification } from '@/app/api/push/send/route'

/**
 * Superadmin "God-Mode" administrative endpoint (Horizon-bank).
 *
 * Only a cookie holding a superadmin token ('superadmin_*') or the master
 * access code may call this route. Every action mutates the live demo
 * payer's data and returns the freshly resolved balance in EUR.
 */

const SUPERADMIN_MASTER_CODE = '1111111199999999'

function isMasterCode(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.replace(/\s+/g, '') === SUPERADMIN_MASTER_CODE
}

/** True when the current cookie is a superadmin token, the master code, or running locally in dev mode. */
async function isAuthorizedSuperadmin(): Promise<boolean> {
  const token = await readAccessCookieToken()
  if (isSuperadminToken(token) || isMasterCode(token) || token === SUPERADMIN_MASTER_CODE) {
    return true
  }
  if (process.env.NODE_ENV !== 'production') {
    return true
  }
  return false
}

/** Resolve the live demo payer account (id, userId). */
async function resolveTargetAccount() {
  const preferredByIban = await db.query.bankAccount.findFirst({
    where: (fields, { eq: eqFn }) => eqFn(fields.accountNumber, DEMO_ACCOUNT_NUMBER),
  })
  if (preferredByIban) {
    return { account: preferredByIban, userId: preferredByIban.userId }
  }

  const byUser = await db.query.bankAccount.findFirst({
    where: (fields, { eq: eqFn }) => eqFn(fields.userId, DEMO_DEFAULT_USER_ID),
  })
  if (byUser) {
    return { account: byUser, userId: byUser.userId }
  }

  const anyAccount = await db.query.bankAccount.findFirst({})
  if (anyAccount && anyAccount.userId) {
    const owned = await db.query.bankAccount.findMany({
      where: (fields, { eq: eqFn }) => eqFn(fields.userId, anyAccount.userId),
      limit: 50,
    })
    const picked = pickDemoBankAccount(owned) ?? owned[0] ?? null
    if (picked) {
      return { account: picked, userId: picked.userId }
    }
  }

  return { account: null as typeof bankAccount.$inferSelect | null, userId: DEMO_DEFAULT_USER_ID }
}

/** Read the balance (EUR) of the resolved account with a single query. */
async function readBalanceEur(): Promise<number> {
  const { account } = await resolveTargetAccount()
  if (!account) return 0
  return account.balance / 100
}

function isIncomingType(type: string | null | undefined): boolean {
  return type === 'incoming' || type === 'deposit' || type === 'topup'
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorizedSuperadmin())) {
      return NextResponse.json(
        { ok: false, error: 'unauthorized', message: 'Nemáte oprávnenie superadmina.' },
        { status: 401 },
      )
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { ok: false, error: 'invalid_json', message: 'Neplatné JSON telo požiadavky.' },
        { status: 400 },
      )
    }

    const action = typeof body.action === 'string' ? body.action : ''

    switch (action) {
      case 'set_balance': {
        const amountEur = Number(body.amountEur)
        if (!Number.isFinite(amountEur) || amountEur < 0) {
          return NextResponse.json(
            { ok: false, error: 'invalid_amount', message: 'Zadajte platnú sumu.' },
            { status: 400 },
          )
        }
        const { account } = await resolveTargetAccount()
        if (!account) {
          return NextResponse.json(
            { ok: false, error: 'account_not_found', message: 'Účet sa nenašiel.' },
            { status: 404 },
          )
        }
        const balanceCents = Math.round(amountEur * 100)
        await db
          .update(bankAccount)
          .set({ balance: balanceCents, updatedAt: new Date() })
          .where(eq(bankAccount.id, account.id))

        const balanceEur = await readBalanceEur()

        // Send push notification to client
        sendWebPushNotification({
          title: 'Aktualizácia zostatku',
          message: `Váš aktuálny zostatok na účte je ${balanceEur.toLocaleString('sk-SK')} €.`,
          url: '/dashboard-v2',
        }).catch(() => null)

        return NextResponse.json({
          ok: true,
          balanceEur,
          message: `Zostatok nastavený na ${balanceEur.toLocaleString('sk-SK')} €.`,
        })
      }

      case 'reset_session': {
        // Reset the "one payment used" flag so a new payment is released.
        await db
          .update(accessSession)
          .set({ transactionUsed: false, status: 'active' })
          .where(eq(accessSession.status, 'ended'))
        // Also clear the flag on any session that has already consumed a payment.
        await db
          .update(accessSession)
          .set({ transactionUsed: false })
          .where(eq(accessSession.transactionUsed, true))

        const balanceEur = await readBalanceEur()
        return NextResponse.json({
          ok: true,
          balanceEur,
          message: 'Limit 1 platby bol resetovaný. Nová platba je uvoľnená.',
        })
      }

      case 'create_transaction': {
        const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : ''
        const amountEur = Number(body.amountEur)
        const rawType = typeof body.type === 'string' ? body.type.trim().toLowerCase() : ''
        const note = typeof body.note === 'string' ? body.note.trim() : ''

        if (!recipient) {
          return NextResponse.json(
            { ok: false, error: 'missing_recipient', message: 'Zadajte meno príjemcu.' },
            { status: 400 },
          )
        }
        if (!Number.isFinite(amountEur) || amountEur <= 0) {
          return NextResponse.json(
            { ok: false, error: 'invalid_amount', message: 'Zadajte platnú sumu.' },
            { status: 400 },
          )
        }
        const { account, userId } = await resolveTargetAccount()
        if (!account) {
          return NextResponse.json(
            { ok: false, error: 'account_not_found', message: 'Účet sa nenašiel.' },
            { status: 404 },
          )
        }

        const incoming = isIncomingType(rawType)
        const effectiveType = incoming ? 'deposit' : 'transfer'

        const amountCents = Math.round(amountEur * 100)
        const currentBalanceCents = account.balance ?? 0
        const newBalanceCents = incoming
          ? currentBalanceCents + amountCents
          : currentBalanceCents - amountCents

        const fullDescription = [recipient, note ? `(${note})` : ''].filter(Boolean).join(' ')
        const newTxnId = `sa-txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        await db.transaction(async (tx) => {
          await tx
            .update(bankAccount)
            .set({ balance: newBalanceCents, updatedAt: new Date() })
            .where(eq(bankAccount.id, account.id))

          await tx.insert(transaction).values({
            id: newTxnId,
            userId,
            fromAccountId: account.id,
            amount: amountCents,
            balanceBefore: currentBalanceCents,
            balanceAfter: newBalanceCents,
            type: effectiveType,
            description: fullDescription,
            isSuperadmin: true,
            status: 'completed',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        })

        const balanceEur = await readBalanceEur()

        // Send push notification to client
        sendWebPushNotification({
          title: incoming ? 'Prijatá platba!' : 'Odchádzajúca platba',
          message: `${incoming ? '+' : '-'}${amountEur.toLocaleString('sk-SK')} € — ${recipient}`,
          url: '/dashboard-v2',
        }).catch(() => null)

        return NextResponse.json({
          ok: true,
          balanceEur,
          message: incoming
            ? `Príjem ${amountEur.toLocaleString('sk-SK')} € od ${recipient} pridaný.`
            : `Výdaj ${amountEur.toLocaleString('sk-SK')} € — ${recipient} pridaný.`,
          transaction: {
            id: newTxnId,
            recipient,
            amountEur,
            type: effectiveType,
            note,
            createdAt: new Date().toISOString(),
          },
        })
      }

      case 'unlock_user_payment': {
        const requestId = typeof body.requestId === 'string' ? body.requestId : ''
        if (!requestId) {
          return NextResponse.json(
            { ok: false, error: 'missing_id', message: 'Chýba requestId.' },
            { status: 400 },
          )
        }
        await db
          .update(accessSession)
          .set({ transactionUsed: false, logoutAt: null })
          .where(eq(accessSession.requestId, requestId))

        return NextResponse.json({
          ok: true,
          message: 'Používateľ bol odblokovaný (má povolenú ďalšiu platbu).',
        })
      }

      case 'send_push_notification': {
        const title = typeof body.title === 'string' && body.title ? body.title : 'George Bank'
        const message = typeof body.message === 'string' && body.message ? body.message : 'Dôležité bankové oznámenie'
        const targetUserId = typeof body.userId === 'string' && body.userId ? body.userId : undefined

        const pushRes = await sendWebPushNotification({
          title,
          message,
          userId: targetUserId,
          url: '/dashboard-v2',
        })

        return NextResponse.json({
          ok: pushRes.success,
          sentCount: pushRes.sentCount,
          failedCount: pushRes.failedCount,
          totalSubscriptions: pushRes.totalSubscriptions,
          message: `Push správa odoslaná (${pushRes.sentCount} doručených z ${pushRes.totalSubscriptions} aktívnych zariadení).`,
        })
      }

      case 'get_live_users': {
        const requests = await db.query.accessRequest.findMany({
          orderBy: [desc(accessRequest.createdAt)],
          limit: 30,
        })
        const sessions = await db.query.accessSession.findMany({
          limit: 50,
        })
        const sessionMap = new Map(sessions.map((s) => [s.requestId, s]))
        const liveUsers = requests.map((r) => {
          const sess = sessionMap.get(r.id)
          return {
            id: r.id,
            requestId: r.id,
            email: r.email,
            code: r.code,
            status: r.status,
            deviceHint: r.deviceHint,
            createdAt: new Date(r.createdAt).toISOString(),
            sessionToken: r.sessionToken ?? sess?.sessionToken ?? null,
            transactionUsed: Boolean(sess?.transactionUsed),
            pdfGenerated: Boolean(sess?.pdfGenerated),
            paymentsCount: sess?.transactionUsed ? 1 : 0,
          }
        })
        return NextResponse.json({ ok: true, liveUsers })
      }

      default:
        return NextResponse.json(
          { ok: false, error: 'unknown_action', message: 'Neznáma akcia.' },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('[admin-actions] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'internal', message: 'Interná chyba servera.' },
      { status: 500 },
    )
  }
}

/**
 * GET live monitoring data (users & active sessions) for superadmin.
 */
export async function GET() {
  try {
    if (!(await isAuthorizedSuperadmin())) {
      return NextResponse.json(
        { ok: false, error: 'unauthorized', message: 'Nemáte oprávnenie superadmina.' },
        { status: 401 },
      )
    }

    const requests = await db.query.accessRequest.findMany({
      orderBy: [desc(accessRequest.createdAt)],
      limit: 30,
    })
    const sessions = await db.query.accessSession.findMany({
      limit: 50,
    })
    const sessionMap = new Map(sessions.map((s) => [s.requestId, s]))
    const liveUsers = requests.map((r) => {
      const sess = sessionMap.get(r.id)
      return {
        id: r.id,
        requestId: r.id,
        email: r.email,
        code: r.code,
        status: r.status,
        deviceHint: r.deviceHint,
        createdAt: new Date(r.createdAt).toISOString(),
        sessionToken: r.sessionToken ?? sess?.sessionToken ?? null,
        transactionUsed: Boolean(sess?.transactionUsed),
        pdfGenerated: Boolean(sess?.pdfGenerated),
        paymentsCount: sess?.transactionUsed ? 1 : 0,
      }
    })

    return NextResponse.json({ ok: true, liveUsers })
  } catch (error) {
    console.error('[admin-actions] GET Error:', error)
    return NextResponse.json(
      { ok: false, error: 'internal', message: 'Chyba pri načítaní používateľov.' },
      { status: 500 },
    )
  }
}

/**
 * PATCH alias for the same endpoint.
 */
export async function PATCH(req: NextRequest) {
  return POST(req)
}

export const dynamic = 'force-dynamic'