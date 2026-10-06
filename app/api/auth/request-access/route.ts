import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessRequest, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  checkAccessRequestRateLimit,
  getRemainingAccessRequests,
  hashIp,
  simplifyUserAgent,
  buildAdminEmailHtml,
  sendAdminEmail,
  getAccessAdminSecret,
  getAccessBaseUrl,
} from '@/lib/access-flow'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown
    password?: unknown
    name?: unknown
  } | null

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : null

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: 'invalid_email', message: 'Zadajte platnú e-mailovú adresu.' },
      { status: 400 },
    )
  }

  if (!password || password.length < 4) {
    return NextResponse.json(
      { error: 'invalid_password', message: 'Heslo musí mať aspoň 4 znaky.' },
      { status: 400 },
    )
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const ipHash = hashIp(ip)

  const userAgent = request.headers.get('user-agent') ?? ''
  const isE2ETest =
    userAgent.includes('playwright') ||
    request.headers.get('x-e2e-test') === '1' ||
    process.env.DISABLE_RATE_LIMIT === 'true' ||
    process.env.CI === 'true'

  if (!isE2ETest && !checkAccessRequestRateLimit(ipHash, isE2ETest)) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Príliš veľa pokusov. Skúste to neskôr.',
      },
      { status: 429 },
    )
  }

  const deviceHint = simplifyUserAgent(userAgent)
  const requestId = randomUUID()

  // Find or create local user record
  const existingUser = await db.query.user?.findFirst({
    where: eq(user.email, email),
  }).catch(() => null)

  const userId: string = existingUser?.id || randomUUID()
  if (!existingUser) {
    try {
      await db.insert(user).values({
        id: userId,
        email,
        name: name || email.split('@')[0],
        emailVerified: false,
      })
    } catch {
      // User might already exist or concurrent insert
    }
  }

  const token = getAccessAdminSecret() || randomUUID()

  await db.insert(accessRequest).values({
    id: requestId,
    email,
    userId,
    token,
    status: 'pending',
    deviceHint,
    userAgent,
    ipHash,
  })

  const emailResult = await sendAdminEmail({
    subject: `🔔 Žiadosť o prístup do George Bank: ${email}`,
    html: buildAdminEmailHtml({
      email,
      deviceHint,
      createdAt: new Date(),
      decideBaseUrl: getAccessBaseUrl(request.url),
      requestId,
      token,
    }),
    isTest: isE2ETest,
  })

  if (!emailResult.ok) {
    console.warn('[access] Admin e-mail warning:', emailResult.error)
  }

  return NextResponse.json({
    ok: true,
    requestId,
    status: 'pending',
    remainingRequests: getRemainingAccessRequests(ipHash),
    emailSent: emailResult.ok,
  })
}
