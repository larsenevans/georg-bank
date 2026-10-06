import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAccessRequestWithinLimit } from '@/lib/access-request-store'
import {
  hashIp,
  simplifyUserAgent,
  buildAdminEmailHtml,
  sendAdminEmail,
  getAccessAdminSecret,
  getAccessBaseUrl,
  isTrustedTestMode,
} from '@/lib/access-flow'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown
    password?: unknown
  } | null

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: 'invalid_email', message: 'Zadajte platnú e-mailovú adresu.' },
      { status: 400 },
    )
  }

  if (body?.password !== undefined) {
    return NextResponse.json(
      {
        error: 'password_not_supported',
        message: 'Táto route slúži iba na žiadosť o prístup; heslo neposielajte.',
      },
      { status: 400 },
    )
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const ipHash = hashIp(ip)

  const userAgent = request.headers.get('user-agent') ?? ''
  const deviceHint = simplifyUserAgent(userAgent)
  const requestId = randomUUID()
  const token = getAccessAdminSecret() || randomUUID()
  let requestQuota: Awaited<ReturnType<typeof createAccessRequestWithinLimit>>
  try {
    requestQuota = await createAccessRequestWithinLimit({
      id: requestId,
      email,
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
    subject: `🔔 Žiadosť o prístup do George Bank: ${email}`,
    html: buildAdminEmailHtml({
      email,
      deviceHint,
      createdAt: new Date(),
      decideBaseUrl: getAccessBaseUrl(request.url),
      requestId,
      token,
    }),
    isTest: isTrustedTestMode(),
  })

  if (!emailResult.ok) {
    console.warn('[access] Admin e-mail warning:', emailResult.error)
  }

  return NextResponse.json({
    ok: true,
    requestId,
    status: 'pending',
    remainingRequests: requestQuota.remainingRequests,
    emailSent: emailResult.ok,
  })
}
