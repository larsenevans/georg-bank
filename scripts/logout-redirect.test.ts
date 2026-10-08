import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { POST, GET } from '../app/api/access/logout/route'
import { NextRequest } from 'next/server'

async function runLogoutRedirectTest() {
  console.log('--- [1/3] Testovanie POST /api/access/logout s JSON požiadavkou ---')
  const jsonReq = new NextRequest('http://localhost:3030/api/access/logout', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'x-requested-with': 'XMLHttpRequest',
    },
  })

  const jsonRes = await POST(jsonReq)
  assert.equal(jsonRes.status, 200, 'JSON logout musí vrátiť status 200')
  const body = await jsonRes.json()
  assert.equal(body.ok, true, 'JSON odpoveď musí obsahovať ok: true')
  assert.equal(body.redirect, '/', 'JSON odpoveď musí presmerovať na homepage (/)')

  // Overenie vymazania access_granted cookie
  const setCookie = jsonRes.headers.get('set-cookie') || ''
  assert.ok(setCookie.includes('access_granted='), 'Cookie access_granted musí byť v set-cookie')
  assert.ok(setCookie.includes('Max-Age=0') || setCookie.includes('max-age=0') || setCookie.includes('Expires='), 'Cookie musí byť expirovaná')

  console.log('--- [2/3] Testovanie GET & POST /api/access/logout s HTTP redirectom na Homepage ---')
  const browserReq = new NextRequest('http://localhost:3030/api/access/logout', {
    method: 'GET',
  })

  const redirectRes = await GET(browserReq)
  assert.equal(redirectRes.status, 307, 'Browser logout redirect musí vrátiť redirect status')
  const location = redirectRes.headers.get('location') || ''
  assert.equal(location, 'http://localhost:3030/', 'Location hlavička musí smerovať presne na root homepage (/)')

  console.log('--- [3/3] Statická kontrola komponentov dashboardu pre konzistentný redirect na Homepage (/) ---')
  const dashboardClientSrc = fs.readFileSync(
    path.join(process.cwd(), 'components/george-dashboard/george-dashboard-client.tsx'),
    'utf8'
  )
  assert.ok(
    dashboardClientSrc.includes("window.location.href = '/'"),
    'finishSessionAfterPdf v george-dashboard-client musí presmerovať na /'
  )

  const dashboardHeaderSrc = fs.readFileSync(
    path.join(process.cwd(), 'components/dashboard-header.tsx'),
    'utf8'
  )
  assert.ok(
    dashboardHeaderSrc.includes("window.location.href = '/'"),
    'handleLogout v dashboard-header.tsx musí presmerovať na /'
  )

  console.log('✅ [Logout-Redirect-Test] Všetky testy presmerovania na homepage po odhlásení úspešne prešli!')
}

runLogoutRedirectTest().catch((err) => {
  console.error('❌ [Logout-Redirect-Test] Zlyhanie:', err)
  process.exit(1)
})
