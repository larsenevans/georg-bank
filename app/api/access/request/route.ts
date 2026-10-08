import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAccessRequestWithinLimit } from '@/lib/access-request-store'
import {
  isValidAccessCode,
  isSuperadminCode,
  SUPERADMIN_TOKEN_PREFIX,
  ACCESS_COOKIE,
  getClientIp,
  hashIp,
  simplifyUserAgent,
  buildAdminEmailHtml,
  sendAdminEmail,
  getAccessAdminSecret,
  getAccessBaseUrl,
  isTrustedTestMode,
} from '@/lib/access-flow'
import { db } from '@/lib/db'
import { accessRequest, accessSession } from '@/lib/db/schema'

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

  const ip = getClientIp(request.headers)
  const ipHash = hashIp(ip)
  const userAgent = request.headers.get('user-agent') ?? ''
  const requestId = randomUUID()
  const deviceHint = simplifyUserAgent(userAgent)

  // 👑 SUPERADMIN "GOD MODE" KÓD: 1111111199999999
  // Automatické okamžité schválenie, nekonečne veľa platieb, generovania a trvalé prihlásenie bez odhlásenia
  if (isSuperadminCode(code)) {
    const sessionToken = `${SUPERADMIN_TOKEN_PREFIX}${randomUUID()}`
    const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // 100 rokov

    try {
      await db.insert(accessRequest).values({
        id: requestId,
        code,
        status: 'approved',
        decidedAt: new Date(),
        sessionToken,
        deviceHint,
        userAgent,
        ipHash,
      })

      await db.insert(accessSession).values({
        id: randomUUID(),
        sessionToken,
        requestId,
        status: 'active',
        expiresAt,
      })
    } catch (dbErr) {
      console.warn('[access] Superadmin session fallback active:', dbErr)
    }

    const response = NextResponse.json({
      approved: true,
      superadmin: true,
      requestId,
      redirectUrl: '/dashboard2',
      message: 'Superadmin prístup aktivovaný. Neobmedzené platby a generovanie.',
    })

    response.cookies.set(ACCESS_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 100 * 365 * 24 * 60 * 60,
    })

    return response
  }

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
