import { NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'
import { v4 as uuidv4 } from 'uuid'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pushSubscription, user } from '@/lib/db/schema'
import { isSuperadminToken } from '@/lib/access-flow'
import { getActiveAccessSession } from '@/lib/access-session'
import { DEMO_DEFAULT_USER_ID } from '@/lib/demo-user'

export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => null)
    if (!rawBody || !rawBody.endpoint || !rawBody.keys?.p256dh || !rawBody.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 })
    }

    // 1. Resolve User ID: check Better Auth first
    let resolvedUserId: string | null = null

    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      })
      if (session?.user?.id) {
        resolvedUserId = session.user.id
      }
    } catch {
      // Ignore Better Auth error and fallback to cookies
    }

    // 2. Fallback to access_granted cookie
    if (!resolvedUserId) {
      const cookieStore = await cookies()
      const accessCookie = cookieStore.get('access_granted')?.value

      if (accessCookie) {
        if (isSuperadminToken(accessCookie)) {
          resolvedUserId = 'superadmin'
        } else {
          const accessSess = await getActiveAccessSession(accessCookie)
          if (accessSess) {
            resolvedUserId = accessSess.id
          }
        }
      }
    }

    // 3. Fallback to body.userId or default demo user ID
    if (!resolvedUserId) {
      resolvedUserId = (typeof rawBody.userId === 'string' && rawBody.userId) || DEMO_DEFAULT_USER_ID
    }

    // 4. Ensure foreign key in `user` table is satisfied
    let targetUserId: string = resolvedUserId || DEMO_DEFAULT_USER_ID
    const existingUser = await db.query.user.findFirst({
      where: eq(user.id, targetUserId),
    })

    if (!existingUser) {
      const firstUser = await db.query.user.findFirst()
      if (firstUser) {
        targetUserId = firstUser.id
      } else {
        const newDemoId = DEMO_DEFAULT_USER_ID
        await db.insert(user).values({
          id: newDemoId,
          name: 'Business účet',
          email: 'guest-abon@local.test',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        targetUserId = newDemoId
      }
    }

    // 5. Insert or update subscription
    const existing = await db.query.pushSubscription.findFirst({
      where: (table, { eq: eqOp }) => eqOp(table.endpoint, rawBody.endpoint),
    })

    if (!existing) {
      await db.insert(pushSubscription).values({
        id: uuidv4(),
        userId: targetUserId,
        endpoint: rawBody.endpoint,
        p256dh: rawBody.keys.p256dh,
        auth: rawBody.keys.auth,
      })
    } else {
      await db
        .update(pushSubscription)
        .set({
          userId: targetUserId,
          p256dh: rawBody.keys.p256dh,
          auth: rawBody.keys.auth,
        })
        .where(eq(pushSubscription.endpoint, rawBody.endpoint))
    }

    return NextResponse.json({
      success: true,
      message: 'Push subscription úspešne uložená.',
      userId: targetUserId,
    })
  } catch (error) {
    console.error('[Push Subscribe] Error saving subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
