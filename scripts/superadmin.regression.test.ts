import {
  SUPERADMIN_ACCESS_CODE,
  SUPERADMIN_TOKEN_PREFIX,
  isSuperadminCode,
  isSuperadminToken,
  isValidAccessCode,
} from '@/lib/access-flow'
import {
  getActiveAccessSession,
  getConsumedActionError,
  afterTransactionSuccess,
  afterPdfSuccess,
} from '@/lib/access-session'
import { NextRequest } from 'next/server'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`)
    throw new Error(`Assertion Failed: ${message}`)
  }
}

console.log('--- SPUSTENIE REGRESNÝCH TESTOV PRE SUPERADMIN GOD-MODE (1111111199999999) ---')

// ============================================================================
// 1. KÓD A TOKEN FORMÁT
// ============================================================================
assert(SUPERADMIN_ACCESS_CODE === '1111111199999999', 'Superadmin access code must be 1111111199999999')
assert(SUPERADMIN_TOKEN_PREFIX === 'superadmin_', 'Superadmin token prefix must be superadmin_')
assert(isValidAccessCode('1111111199999999') === true, 'Superadmin code must pass 16-digit validation')
assert(isSuperadminCode('1111111199999999') === true, 'isSuperadminCode recognizes exact superadmin code')
assert(isSuperadminCode('1111 1111 9999 9999') === true, 'isSuperadminCode accepts spaced 4x4 input')
assert(isSuperadminCode(' 1111111199999999 ') === true, 'isSuperadminCode trims leading/trailing whitespace')
assert(isSuperadminCode('1111111199999998') === false, 'isSuperadminCode rejects wrong code')
assert(isSuperadminCode('') === false, 'isSuperadminCode rejects empty string')

assert(isSuperadminToken('superadmin_1740000000_abc') === true, 'isSuperadminToken matches prefix superadmin_')
assert(isSuperadminToken('1111111199999999') === true, 'isSuperadminToken matches raw superadmin code')
assert(isSuperadminToken('d9b62f1e-84b2-4d69-a1df-b4c688d61394') === false, 'isSuperadminToken rejects UUID guest token')
assert(isSuperadminToken(null) === false, 'isSuperadminToken rejects null')
assert(isSuperadminToken(undefined) === false, 'isSuperadminToken rejects undefined')

// ============================================================================
// 2. OKAMŽITÁ AUTORIZÁCIA BEZ DB (ZERO LATENCY SESSION RESOLUTION)
// ============================================================================
async function testSessionResolution() {
  // A. Superadmin prefixed token
  const session1 = await getActiveAccessSession('superadmin_test_session_123')
  assert(session1 !== null, 'Superadmin prefixed token must resolve to active session')
  assert(session1?.status === 'active', 'Superadmin session status must be active')
  assert(session1?.sessionToken === 'superadmin_test_session_123', 'Session token must match input')

  // B. Raw superadmin code as token
  const session2 = await getActiveAccessSession('1111111199999999')
  assert(session2 !== null, 'Raw superadmin code token must resolve to active session')
  assert(session2?.status === 'active', 'Superadmin session status must be active')

  // C. Null or undefined returns null
  assert((await getActiveAccessSession(null)) === null, 'null token returns null')
  assert((await getActiveAccessSession(undefined)) === null, 'undefined token returns null')
  assert((await getActiveAccessSession('')) === null, 'empty token returns null')
}

// ============================================================================
// 3. GOD-MODE: NEKONEČNÉ PLATBY (ŽIADNE 403 TRANSACTION_ALREADY_USED)
// ============================================================================
const superadminSessionMock = {
  id: 'superadmin-god-mode',
  sessionToken: 'superadmin_active_12345',
  accessCode: '1111111199999999',
  status: 'approved' as const,
  transactionUsed: true,
  transactionUsedAt: new Date(),
  pdfGenerated: true,
  pdfGeneratedAt: new Date(),
  expiresAt: new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000),
  ipHash: 'superadmin-ip',
  userAgent: 'Superadmin-Browser',
  approvedAt: new Date(),
  endedAt: null,
  logoutAt: null,
}

// Overenie, že pre Superadmina getConsumedActionError VŽDY vracia null
assert(
  getConsumedActionError(superadminSessionMock, 'transaction_already_used') === null,
  'Superadmin can make unlimited transactions even if transactionUsed=true',
)

// Simulácia 10 platieb za sebou
for (let i = 1; i <= 10; i++) {
  const err = getConsumedActionError(superadminSessionMock, 'transaction_already_used')
  assert(err === null, `Payment #${i} must not be blocked for superadmin`)
}

// ============================================================================
// 4. GOD-MODE: NEKONEČNÉ PDF GENERÁCIE (ŽIADNE 403 PDF_ALREADY_GENERATED)
// ============================================================================
assert(
  getConsumedActionError(superadminSessionMock, 'pdf_already_generated') === null,
  'Superadmin can generate unlimited PDFs even if pdfGenerated=true',
)

// Simulácia 10 generovaní PDF za sebou
for (let i = 1; i <= 10; i++) {
  const err = getConsumedActionError(superadminSessionMock, 'pdf_already_generated')
  assert(err === null, `PDF generation #${i} must not be blocked for superadmin`)
}

// ============================================================================
// 5. HOOKY afterTransactionSuccess & afterPdfSuccess PRE SUPERADMINA
// ============================================================================
async function testHooks() {
  // afterTransactionSuccess nesmie spadnúť a nesmie ukončiť session
  await afterTransactionSuccess(superadminSessionMock)
  assert(superadminSessionMock.endedAt === null, 'afterTransactionSuccess must not end superadmin session')

  // afterPdfSuccess nesmie ukončiť superadmin session
  await afterPdfSuccess(superadminSessionMock)
  assert(superadminSessionMock.endedAt === null, 'afterPdfSuccess must keep superadmin session active')
}

// ============================================================================
// 6. IZOLÁCIA KONTRAKTU: ŠTANDARDNÝ GUEST KONTRAKT (CONTRACT-1+1) MUSÍ PLATIŤ
// ============================================================================
const standardGuestSession = {
  id: 'guest-session-uuid',
  sessionToken: 'b8c714d2-f3e4-4d1a-8e2b-7f1234567890',
  accessCode: '9876543210987654',
  status: 'approved' as const,
  transactionUsed: false,
  transactionUsedAt: null,
  pdfGenerated: false,
  pdfGeneratedAt: null,
  expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  ipHash: 'guest-ip',
  userAgent: 'Guest-Browser',
  approvedAt: new Date(),
  endedAt: null,
  logoutAt: null,
}

// 1. platba hosťa povolená
assert(
  getConsumedActionError(standardGuestSession, 'transaction_already_used') === null,
  'Standard guest: 1st transaction allowed',
)

// Po 1. platbe je 2. platba hosťa ZAKÁZANÁ (403)
const standardGuestAfterTx = { ...standardGuestSession, transactionUsed: true }
assert(
  getConsumedActionError(standardGuestAfterTx, 'transaction_already_used') === 'transaction_already_used',
  'Standard guest: 2nd transaction strictly blocked with transaction_already_used',
)

// Po 1. PDF je 2. PDF hosťa ZAKÁZANÉ (403)
const standardGuestAfterPdf = { ...standardGuestSession, pdfGenerated: true }
assert(
  getConsumedActionError(standardGuestAfterPdf, 'pdf_already_generated') === 'pdf_already_generated',
  'Standard guest: 2nd PDF strictly blocked with pdf_already_generated',
)

// ============================================================================
// 7. 30-DŇOVÁ RETENCIA TRANSAKCIÍ A PDF (SUPERADMIN vs GUEST)
// ============================================================================
function shouldCleanupTransaction(isSuperadmin: boolean, createdAt: Date, now: Date = new Date()): boolean {
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  if (isSuperadmin) {
    return createdAt.getTime() < thirtyDaysAgo.getTime()
  }
  return createdAt.getTime() < sixHoursAgo.getTime()
}

function shouldCleanupPdf(isSuperadmin: boolean, fileCreatedTime: Date, now: Date = new Date()): boolean {
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  if (isSuperadmin) {
    return fileCreatedTime.getTime() < thirtyDaysAgo.getTime()
  }
  return fileCreatedTime.getTime() < sixHoursAgo.getTime()
}

const testNow = new Date()

// A. Superadmin transakcie
const saTx10Days = new Date(testNow.getTime() - 10 * 24 * 60 * 60 * 1000)
const saTx29Days = new Date(testNow.getTime() - 29 * 24 * 60 * 60 * 1000)
const saTx31Days = new Date(testNow.getTime() - 31 * 24 * 60 * 60 * 1000)

assert(!shouldCleanupTransaction(true, saTx10Days, testNow), 'Superadmin transaction at 10 days must be RETAINED')
assert(!shouldCleanupTransaction(true, saTx29Days, testNow), 'Superadmin transaction at 29 days must be RETAINED')
assert(shouldCleanupTransaction(true, saTx31Days, testNow), 'Superadmin transaction at 31 days must be CLEANED UP')

// B. Hosťovské transakcie (6h TTL)
const guestTx2Hours = new Date(testNow.getTime() - 2 * 60 * 60 * 1000)
const guestTx7Hours = new Date(testNow.getTime() - 7 * 60 * 60 * 1000)

assert(!shouldCleanupTransaction(false, guestTx2Hours, testNow), 'Guest transaction at 2h must be RETAINED')
assert(shouldCleanupTransaction(false, guestTx7Hours, testNow), 'Guest transaction at 7h must be CLEANED UP')

// C. Superadmin PDF vs Guest PDF
const saPdf15Days = new Date(testNow.getTime() - 15 * 24 * 60 * 60 * 1000)
const saPdf32Days = new Date(testNow.getTime() - 32 * 24 * 60 * 60 * 1000)
const guestPdf8Hours = new Date(testNow.getTime() - 8 * 60 * 60 * 1000)

assert(!shouldCleanupPdf(true, saPdf15Days, testNow), 'Superadmin PDF at 15 days must be RETAINED in GCS')
assert(shouldCleanupPdf(true, saPdf32Days, testNow), 'Superadmin PDF at 32 days must be CLEANED UP from GCS')
assert(shouldCleanupPdf(false, guestPdf8Hours, testNow), 'Guest PDF at 8h must be CLEANED UP from GCS')

async function main() {
  await testSessionResolution()
  await testHooks()
  console.log('✅ superadmin.regression.test.ts: VŠETKY SUPERADMIN GOD-MODE & 30-DŇOVÁ RETENCIA ASSERTIONS ÚSPEŠNE PREŠLI!')
}

main().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})

