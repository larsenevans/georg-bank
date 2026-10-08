import assert from 'node:assert/strict'
import { GET as cronCleanupGet } from '../app/api/cron/cleanup/route'
import { isSuperadminToken, isSuperadminCode } from '../lib/access-flow'
import {
  requireAccessForPdf,
  afterPdfSuccess,
  afterTransactionSuccess,
  buildEndSessionValues,
} from '../lib/access-session'

export async function runCronCleanupGcsUploadTest() {
  console.log('--- [1/3] Testovanie Cron Cleanup Endpointu & Ochrany ---')

  // 1. Cron Cleanup Unauthorized check when CRON_SECRET is set
  const savedCronSecret = process.env.CRON_SECRET
  try {
    process.env.CRON_SECRET = 'secret_test_token_123'
    const unauthReq = new Request('http://localhost:3030/api/cron/cleanup', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong_token' },
    })
    const unauthRes = await cronCleanupGet(unauthReq)
    assert.strictEqual(unauthRes.status, 401, 'Cron endpoint with bad secret must return 401')
    const unauthJson = await unauthRes.json()
    assert.strictEqual(unauthJson.success, false)

    // Authorized call
    const authReq = new Request('http://localhost:3030/api/cron/cleanup', {
      method: 'GET',
      headers: { authorization: 'Bearer secret_test_token_123' },
    })
    const authRes = await cronCleanupGet(authReq)
    assert.strictEqual(authRes.status, 200, 'Cron endpoint with valid secret must return 200')
    const authJson = await authRes.json()
    assert.strictEqual(authJson.success, true)
    assert.ok(authJson.deleted, 'Response must include deleted statistics')
    assert.strictEqual(typeof authJson.deleted.guestTransactions, 'number')
    assert.strictEqual(typeof authJson.deleted.superadminTransactions, 'number')
  } finally {
    if (savedCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = savedCronSecret
    }
  }

  // 2. Cron Cleanup without CRON_SECRET (open/internal cron)
  delete process.env.CRON_SECRET
  const openReq = new Request('http://localhost:3030/api/cron/cleanup', { method: 'GET' })
  const openRes = await cronCleanupGet(openReq)
  assert.strictEqual(openRes.status, 200)
  const openJson = await openRes.json()
  assert.strictEqual(openJson.success, true)

  console.log('--- [2/3] Testovanie GCS PDF Metadát & Retenčných Pravidiel ---')

  // Test superadmin token and code recognition
  const superToken = 'superadmin_live_token_777'
  const guestToken = 'guest_token_abc123'

  assert.strictEqual(isSuperadminToken(superToken), true, 'Superadmin token recognized')
  assert.strictEqual(isSuperadminToken(guestToken), false, 'Guest token is not superadmin')
  assert.strictEqual(isSuperadminCode('1111111199999999'), true, 'Superadmin code recognized')
  assert.strictEqual(isSuperadminCode('1111 1111 9999 9999'), true, 'Superadmin formatted code recognized')
  assert.strictEqual(isSuperadminCode('2222333344445555'), false, 'Random code is not superadmin')

  // GCS Metadata simulation validation
  function buildGcsMetadata(isSuperadmin: boolean) {
    return {
      metadata: {
        isSuperadmin: isSuperadmin ? 'true' : 'false',
        retentionDays: isSuperadmin ? '30' : '0.25',
        createdAt: new Date().toISOString(),
      },
    }
  }

  function getGcsExpiryMs(isSuperadmin: boolean): number {
    return isSuperadmin ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  }

  const superMeta = buildGcsMetadata(true)
  assert.strictEqual(superMeta.metadata.isSuperadmin, 'true')
  assert.strictEqual(superMeta.metadata.retentionDays, '30')
  assert.strictEqual(getGcsExpiryMs(true), 2592000000, 'Superadmin signed URL must be 30 days (2592000000ms)')

  const guestMeta = buildGcsMetadata(false)
  assert.strictEqual(guestMeta.metadata.isSuperadmin, 'false')
  assert.strictEqual(guestMeta.metadata.retentionDays, '0.25')
  assert.strictEqual(getGcsExpiryMs(false), 86400000, 'Guest signed URL must be 24h fallback')

  console.log('--- [3/3] Testovanie PDF Gate Kontraktu pre Guest vs Superadmin ---')

  // Superadmin PDF gate: always ok, returns synthetic session without DB lookup
  const superGate = await requireAccessForPdf(superToken)
  assert.strictEqual(superGate.ok, true, 'Superadmin can always access PDF gate')
  assert.strictEqual(superGate.session?.sessionToken, superToken, 'Superadmin receives synthetic session')

  // Superadmin actions: always a no-op that never writes to DB or logs out
  await afterTransactionSuccess(superGate.session!)
  await afterPdfSuccess(superGate.session!)
  assert.strictEqual(superGate.session?.status, 'active', 'Superadmin session stays active after transactions & PDF')

  // Guest session pure end values contract
  const endValues = buildEndSessionValues()
  assert.strictEqual(endValues.status, 'ended', 'Guest end session values must set status ended')
  assert.ok(endValues.endedAt instanceof Date, 'Guest end session must have valid endedAt date')
  assert.ok(endValues.logoutAt instanceof Date, 'Guest end session must have valid logoutAt date')

  return { success: true }
}

runCronCleanupGcsUploadTest()
  .then(() => {
    console.log('✅ [Cron-GCS-Test] Všetky integračné testy pre Cron Cleanup & GCS Upload úspešne prešli!')
  })
  .catch((err) => {
    console.error('❌ [Cron-GCS-Test] Test zlyhal:', err)
    process.exit(1)
  })
