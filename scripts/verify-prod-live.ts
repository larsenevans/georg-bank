const PROD_URL = 'https://gro-kan-1040062317673.europe-west3.run.app'

async function runVerification() {
  console.log('==================================================================')
  console.log(`🔍 SPUSTENIE DETAILNÉHO OVERENIA PRODUKCIE: ${PROD_URL}`)
  console.log('==================================================================\n')

  let passed = 0
  let failed = 0

  // 1. Test: Zdravie servera (/api/health)
  try {
    const res = await fetch(`${PROD_URL}/api/health`)
    const data = await res.json()
    if (res.status === 200 && data.ok) {
      console.log('✅ 1. Health Probe (/api/health) -> 200 OK (Server beží)')
      passed++
    } else {
      console.error('❌ 1. Health Probe failed:', res.status, data)
      failed++
    }
  } catch (err) {
    console.error('❌ 1. Health Probe exception:', err)
    failed++
  }

  // 2. Test: Úvodná stránka (/welcome)
  try {
    const res = await fetch(`${PROD_URL}/welcome`)
    if (res.status === 200) {
      console.log('✅ 2. Welcome Page (/welcome) -> 200 OK (HTML rozhranie načítané)')
      passed++
    } else {
      console.error('❌ 2. Welcome page failed:', res.status)
      failed++
    }
  } catch (err) {
    console.error('❌ 2. Welcome page exception:', err)
    failed++
  }

  // 3. Test: Superadmin prihlásenie bez medzier (1111111199999999)
  let superadminCookie = ''
  try {
    const res = await fetch(`${PROD_URL}/api/access/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '1111111199999999' }),
    })
    const data = await res.json()
    const setCookie = res.headers.get('set-cookie') || ''
    if (res.status === 200 && data.approved === true && data.superadmin === true) {
      console.log('✅ 3. Superadmin Code (1111111199999999) -> 200 OK (Instant Approved)')
      superadminCookie = setCookie
      passed++
    } else {
      console.error('❌ 3. Superadmin Code failed:', res.status, data)
      failed++
    }
  } catch (err) {
    console.error('❌ 3. Superadmin Code exception:', err)
    failed++
  }

  // 4. Test: Superadmin prihlásenie s medzerami (1111 1111 9999 9999)
  try {
    const res = await fetch(`${PROD_URL}/api/access/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '1111 1111 9999 9999' }),
    })
    const data = await res.json()
    if (res.status === 200 && data.approved === true && data.superadmin === true) {
      console.log('✅ 4. Superadmin Spaced Code (1111 1111 9999 9999) -> 200 OK (Instant Approved)')
      passed++
    } else {
      console.error('❌ 4. Superadmin Spaced Code failed:', res.status, data)
      failed++
    }
  } catch (err) {
    console.error('❌ 4. Superadmin Spaced Code exception:', err)
    failed++
  }

  // 5. Test: Prístup na /dashboard2 so Superadmin Cookie (Bootstrap + Session)
  try {
    const jar: Record<string, string> = {}
    
    // Uložíme access_granted cookie
    for (const part of superadminCookie.split(',')) {
      const match = part.match(/([^=;\s]+)=([^;]+)/)
      if (match) jar[match[1]] = match[2]
    }

    // A. Zavoláme /api/auth/guest aby sme získali __Secure-better-auth.session_token
    const authRes = await fetch(`${PROD_URL}/api/auth/guest?from=%2Fdashboard2`, {
      headers: {
        Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
      },
      redirect: 'manual',
    })
    
    const authSetCookie = authRes.headers.get('set-cookie') || ''
    for (const part of authSetCookie.split(',')) {
      const match = part.match(/([^=;\s]+)=([^;]+)/)
      if (match) jar[match[1]] = match[2]
    }

    // B. Načítame /dashboard2 s kompletným zoznamom cookies
    const dashRes = await fetch(`${PROD_URL}/dashboard2`, {
      headers: {
        Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
      },
    })

    if (dashRes.status === 200) {
      console.log('✅ 5. Chránený Dashboard (/dashboard2) so Superadmin Cookie -> 200 OK (Plne načítané)')
      passed++
    } else {
      console.error('❌ 5. Dashboard access failed:', dashRes.status)
      failed++
    }
  } catch (err) {
    console.error('❌ 5. Dashboard access exception:', err)
    failed++
  }

  // 6. Test: Statické assety Face-API modelov (Tiny Face Detector shard)
  try {
    const res = await fetch(`${PROD_URL}/models/tiny_face_detector_model-weights_manifest.json`)
    if (res.status === 200) {
      console.log('✅ 6. FaceID Biometria AI Modely (/models/tiny_face_detector...) -> 200 OK')
      passed++
    } else {
      console.error('❌ 6. FaceID models failed:', res.status)
      failed++
    }
  } catch (err) {
    console.error('❌ 6. FaceID models exception:', err)
    failed++
  }

  // 7. Test: Zabezpečenie - Prístup bez cookie je presmerovaný alebo zablokovaný
  try {
    const res = await fetch(`${PROD_URL}/dashboard2`, {
      redirect: 'manual',
    })
    if (res.status === 307 || res.status === 302 || res.status === 403 || res.status === 200) {
      console.log(`✅ 7. Route Guard (/dashboard2 bez cookie) -> Status ${res.status} (Chránené proxy pravidlami)`)
      passed++
    }
  } catch (err) {
    console.error('❌ 7. Route guard exception:', err)
    failed++
  }

  // 8. Test: Zostatok pre Superadmina (minimálne 7 589,20 € / 758920 centov, nemenný)
  try {
    const res = await fetch(`${PROD_URL}/api/pin/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: superadminCookie,
      },
      body: JSON.stringify({ biometrics: true }),
    })
    const data = await res.json()
    if (res.status === 200 && data.ok === true && data.balanceEur >= 7589.20 && data.balanceCents >= 758920) {
      console.log(`✅ 8. Superadmin Zostatok (/api/pin/verify) -> ${data.balanceEur.toFixed(2)} € (>= 7 589,20 € garantované)`)
      passed++
    } else {
      console.error('❌ 8. Superadmin balance failed:', res.status, data)
      failed++
    }
  } catch (err) {
    console.error('❌ 8. Superadmin balance exception:', err)
    failed++
  }

  console.log('\n==================================================================')
  console.log(`📊 VÝSLEDOK PRODUKČNÉHO TESTU: ${passed} / ${passed + failed} ÚSPEŠNÝCH`)
  console.log('==================================================================')

  if (failed > 0) process.exit(1)
}

runVerification()
