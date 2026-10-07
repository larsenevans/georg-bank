import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { accessRequest, accessSession } from '@/lib/db/schema'
import {
  getAccessAdminSecret,
  getClientIp,
  checkAccessDecideRateLimit,
  generateSessionToken,
  isAccessRequestExpired,
  ACCESS_SESSION_EXPIRY_DAYS,
  ACCESS_COOKIE,
} from '@/lib/access-flow'

function decidePageHtml(message: string, ok: boolean, allowEnter = false): string {
  const color = ok ? '#16a34a' : '#dc2626'
  const actionBtn = (ok && allowEnter)
    ? `
    <div style="margin-top:24px;">
      <a href="/dashboard2" style="display:inline-block;padding:14px 28px;background:#179f42;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:bold;font-size:16px;box-shadow:0 4px 14px rgba(23,159,66,0.4);letter-spacing:0.3px;">
        Vstúpiť do aplikácie George →
      </a>
      <p style="font-size:12px;color:#94a3b8;margin-top:12px;">Presmerovanie prebehne automaticky o <span id="sec">3</span> s...</p>
    </div>
    <script>
      let s = 3;
      const el = document.getElementById('sec');
      const timer = setInterval(() => {
        s--;
        if (el) el.textContent = s;
        if (s <= 0) {
          clearInterval(timer);
          window.location.href = '/dashboard2';
        }
      }, 1000);
    </script>`
    : `<p style="font-size:13px;color:${color};margin-top:16px;">Toto okno môžete zavrieť.</p>`

  return `<!DOCTYPE html>
<html lang="sk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>George · Rozhodnutie</title></head>
<body style="margin:0;background:#030305;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:24px;max-width:420px;">
    <p style="font-size:48px;margin:0 0 16px;">${ok ? '✅' : '❌'}</p>
    <p style="font-size:18px;color:#e2e8f0;margin:0 0 8px;line-height:1.4;">${message}</p>
    ${actionBtn}
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const token = params.get('token') ?? ''
  const requestId = params.get('requestId')?.trim() ?? ''
  const decision = params.get('decision') ?? ''

  if (!checkAccessDecideRateLimit(getClientIp(request.headers))) {
    return new NextResponse(decidePageHtml('Príliš veľa pokusov.', false), {
      status: 429,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const secret = getAccessAdminSecret()
  if (!secret || token !== secret) {
    return new NextResponse(decidePageHtml('Neplatný admin token.', false), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (decision !== 'approved' && decision !== 'rejected') {
    return new NextResponse(decidePageHtml('Neplatné rozhodnutie.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const [req] = await db
    .select()
    .from(accessRequest)
    .where(eq(accessRequest.id, requestId))
    .limit(1)

  if (!req) {
    return new NextResponse(decidePageHtml('Žiadosť nebola nájdená.', false), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (req.status !== 'pending') {
    return new NextResponse(
      decidePageHtml(`Žiadosť už bola rozhodnutá (${req.status === 'approved' ? 'schválená' : 'zamietnutá'}).`, false),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  if (isAccessRequestExpired(req.createdAt)) {
    return new NextResponse(decidePageHtml('Žiadosť expirovala (24 h).', false), {
      status: 410,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (decision === 'rejected') {
    await db
      .update(accessRequest)
      .set({ status: 'rejected', decidedAt: new Date() })
      .where(eq(accessRequest.id, requestId))
    return new NextResponse(decidePageHtml('Prístup bol zamietnutý.', true), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const sessionToken = generateSessionToken()
  await db
    .update(accessRequest)
    .set({ status: 'approved', decidedAt: new Date(), sessionToken })
    .where(eq(accessRequest.id, requestId))

  const expiresAt = new Date(Date.now() + ACCESS_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(accessSession).values({
    id: randomUUID(),
    sessionToken,
    requestId,
    status: 'active',
    expiresAt,
  })

  const approvedUserText = req.email ? ` pre ${req.email}` : ''
  const response = new NextResponse(
    decidePageHtml(
      `Prístup bol úspešne schválený${approvedUserText}. Používateľ má povolený vstup do bankingu.`,
      true,
      true,
    ),
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  )

  response.cookies.set(ACCESS_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_SESSION_EXPIRY_DAYS * 24 * 60 * 60,
  })

  return response
}
