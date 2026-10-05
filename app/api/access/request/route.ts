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
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''

  if (!isValidAccessCode(code)) {
    return NextResponse.json(
      { error: 'invalid_code', message: 'Zadajte presne 16-miestny kód.' },
      { status: 400 },
    )
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const ipHash = hashIp(ip)

  if (!checkAccessRequestRateLimit(ipHash)) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Príliš veľa pokusov. Skúste to neskôr.',
      },
      { status: 429 },
    )
  }

  const requestId = randomUUID()
  const deviceHint = simplifyUserAgent(request.headers.get('user-agent'))

  await db.insert(accessRequest).values({
    id: requestId,
    code,
    status: 'pending',
    deviceHint,
    ipHash,
  })

  const token = getAccessAdminSecret()
  const emailResult =
    token && token !== ''
      ? await sendAdminEmail({
          html: buildAdminEmailHtml({
            code,
            deviceHint,
            createdAt: new Date(),
            decideBaseUrl: getAccessBaseUrl(request.url),
            requestId,
            token,
          }),
        })
      : { ok: false, error: 'admin_secret_missing' }

  if (!emailResult.ok) {
    console.warn('[access] Admin e-mail failed:', emailResult.error)
  }

  return NextResponse.json({
    requestId,
    remainingRequests: getRemainingAccessRequests(ipHash),
    emailSent: emailResult.ok,
  })
}
