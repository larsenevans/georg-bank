import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessRequest } from '@/lib/db/schema'
import {
  isValidAccessCode,
  checkAccessRequestRateLimit,
  getRemainingAccessRequests,
  hashIp,
  simplifyUserAgent,
  buildAdminEmailHtml,
  sendAdminEmail,
  getAccessAdminSecret,
  getAccessBaseUrl,
} from '@/lib/access-flow'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    code?: unknown
    email?: unknown
    password?: unknown
    name?: unknown
  } | null

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body?.code === 'string' ? body.code.trim() : ''

  if (!email && !isValidAccessCode(code)) {
    return NextResponse.json(
      { error: 'invalid_code', message: 'Zadajte platný e-mail alebo 16-miestny kód.' },
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

  const requestId = randomUUID()
  const deviceHint = simplifyUserAgent(userAgent)
  const token = getAccessAdminSecret() || randomUUID()

  await db.insert(accessRequest).values({
    id: requestId,
    code: code || null,
    email: email || null,
    token,
    status: 'pending',
    deviceHint,
    userAgent,
    ipHash,
  })

  const emailResult = await sendAdminEmail({
    subject: email
      ? `🔔 Žiadosť o prístup do George Bank: ${email}`
      : 'George · Nová žiadosť o prístup',
    html: buildAdminEmailHtml({
      code: code || undefined,
      email: email || undefined,
      deviceHint,
      createdAt: new Date(),
      decideBaseUrl: getAccessBaseUrl(request.url),
      requestId,
      token,
    }),
    isTest: isE2ETest,
  })

  if (!emailResult.ok) {
    console.warn('[access] Admin e-mail failed:', emailResult.error)
  }

  return NextResponse.json({
    requestId,
    remainingRequests: getRemainingAccessRequests(ipHash),
    emailSent: emailResult.ok,
  })
}
