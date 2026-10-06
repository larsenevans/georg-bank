import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAccessRequestWithinLimit } from '@/lib/access-request-store'
import {
  isValidAccessCode,
  hashIp,
  simplifyUserAgent,
  buildAdminEmailHtml,
  sendAdminEmail,
  getAccessAdminSecret,
  getAccessBaseUrl,
  isTrustedTestMode,
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

  const requestId = randomUUID()
  const deviceHint = simplifyUserAgent(userAgent)
  const token = getAccessAdminSecret() || randomUUID()
  let requestQuota: Awaited<ReturnType<typeof createAccessRequestWithinLimit>>
  try {
    requestQuota = await createAccessRequestWithinLimit({
      id: requestId,
      code: code || null,
      email: email || null,
      token,
      deviceHint,
      userAgent,
      ipHash,
    })
  } catch (error) {
    console.error('[access] Failed to store access request:', error)
    return NextResponse.json(
      { error: 'request_failed', message: 'Žiadosť sa nepodarilo uložiť.' },
      { status: 500 },
    )
  }

  if (!requestQuota.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Príliš veľa pokusov. Skúste to neskôr.',
      },
      { status: 429 },
    )
  }

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
    isTest: isTrustedTestMode(),
  })

  if (!emailResult.ok) {
    console.warn('[access] Admin e-mail failed:', emailResult.error)
  }

  return NextResponse.json({
    requestId,
    remainingRequests: requestQuota.remainingRequests,
    emailSent: emailResult.ok,
  })
}
