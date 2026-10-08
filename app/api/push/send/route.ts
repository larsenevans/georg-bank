import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { db } from '@/lib/db'
import { pushSubscription } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim()
const vapidSubject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@internetbank.sk'
const vapidConfigured = Boolean(vapidPublic && vapidPrivate)

if (vapidConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!)
}

export interface SendPushOptions {
  title: string
  message: string
  userId?: string
  url?: string
}

export interface SendPushResult {
  success: boolean
  sentCount: number
  failedCount: number
  totalSubscriptions: number
  error?: string
}

/**
 * Direct server-side helper to send Web Push notifications to subscriptions.
 */
export async function sendWebPushNotification({
  title,
  message,
  userId,
  url = '/dashboard-v2',
}: SendPushOptions): Promise<SendPushResult> {
  if (process.env.PUSH_NOTIFICATIONS_ENABLED !== 'true') {
    return { success: false, sentCount: 0, failedCount: 0, totalSubscriptions: 0, error: 'Push notifikácie sú vypnuté.' }
  }

  if (!vapidConfigured) {
    return { success: false, sentCount: 0, failedCount: 0, totalSubscriptions: 0, error: 'VAPID kľúče nie sú nakonfigurované.' }
  }

  const payload = JSON.stringify({
    title: title || 'George',
    body: message || 'Máte novú notifikáciu v bankovom účte.',
    url,
    timestamp: Date.now(),
  })

  let subs: (typeof pushSubscription.$inferSelect)[] = []
  try {
    if (userId) {
      subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId))
    } else {
      subs = await db.select().from(pushSubscription)
    }
  } catch (dbErr) {
    console.warn('[Push Service] Database lookup error:', dbErr)
    return { success: false, sentCount: 0, failedCount: 0, totalSubscriptions: 0, error: 'Zlyhalo načítanie odberov z databázy.' }
  }

  let sentCount = 0
  let failedCount = 0

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload
      )
      sentCount++
    } catch (err) {
      console.warn('[Push Service] Error sending to endpoint:', sub.endpoint, err)
      failedCount++
    }
  }

  return {
    success: true,
    sentCount,
    failedCount,
    totalSubscriptions: subs.length,
  }
}

export async function POST(req: Request) {
  try {
    if (process.env.PUSH_NOTIFICATIONS_ENABLED !== 'true') {
      return NextResponse.json({ ok: false, message: 'Push notifications disabled' }, { status: 200 })
    }

    if (!vapidConfigured) {
      return NextResponse.json({ ok: false, message: 'VAPID keys not configured' }, { status: 200 })
    }

    const body = await req.json().catch(() => ({}))
    const {
      title = 'George Bank',
      message = 'Zmena zostatku na účte.',
      userId,
      url = '/dashboard-v2',
    } = body ?? {}

    const result = await sendWebPushNotification({
      title,
      message,
      userId,
      url,
    })

    return NextResponse.json({
      success: result.success,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      totalSubscriptions: result.totalSubscriptions,
      message: `Push správy odoslané: ${result.sentCount} doručených, ${result.failedCount} zlyhalo (celkovo odberov: ${result.totalSubscriptions}).`,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
