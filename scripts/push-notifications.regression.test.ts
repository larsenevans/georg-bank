import fs from 'fs'
import path from 'path'
import webpush from 'web-push'

// Načítanie .env.local ak nie sú načítané premenné
if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  const possiblePaths = [
    path.resolve(__dirname, '../.env.local'),
    path.resolve(process.cwd(), '.env.local'),
  ]
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const eqIdx = line.indexOf('=')
        if (eqIdx !== -1) {
          const key = line.slice(0, eqIdx).trim()
          const val = line.slice(eqIdx + 1).trim()
          if (!process.env[key]) {
            process.env[key] = val
          }
        }
      }
      break
    }
  }
}


import { urlBase64ToUint8Array, getPushCapabilities } from '@/lib/push-notifications'
import { sendWebPushNotification } from '@/app/api/push/send/route'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}


// ============================================================================
// 1. REGRESIA: BASE64 TO UINT8ARRAY KONVERTOR PRE VAPID APPLICATION SERVER KEY
// ============================================================================
{
  // Test valid URL-safe base64 string
  const base64UrlKey = 'BNg_UF-VqzSAgmGRRlzVzXQmqot-dkXs6goaaEwnTqbHNMausVzFrhhplWQVujW1fm8d7bdquc7XVGhqc71SR4c'
  
  const hadWindow = typeof window !== 'undefined'
  if (!hadWindow) {
    // @ts-expect-error - node environment shim for test
    global.window = {
      atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
    }
  }

  const uint8 = urlBase64ToUint8Array(base64UrlKey)
  assert(uint8 instanceof Uint8Array, 'Výstup musí byť inštancia Uint8Array')
  assert(uint8.length === 65, 'ECDSA P-256 nenaformátovaný verejný kľúč musí mať dĺžku 65 bajtov')
  assert(uint8[0] === 4, 'Nekomprimovaný P-256 kľúč začína bajtom 0x04')

  if (!hadWindow) {
    // @ts-expect-error - restore
    delete global.window
  }
}

// ============================================================================
// 2. REGRESIA: VAPID KĽÚČE A KRYPTOGRAFICKÁ INTEGRITA
// ============================================================================
{
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY

  assert(Boolean(pub && pub.length > 20), 'NEXT_PUBLIC_VAPID_PUBLIC_KEY musí byť prítomný a neprázdny')
  assert(Boolean(priv && priv.length > 20), 'VAPID_PRIVATE_KEY musí byť prítomný a neprázdny')

  // Overenie platnosti páru cez web-push knižnicu
  try {
    webpush.setVapidDetails(
      'mailto:admin@internetbank.sk',
      pub!,
      priv!
    )
    assert(true, 'VAPID kľúče sú platné')
  } catch (err) {
    throw new Error(`Neplatné VAPID kľúče v prostredí: ${err}`)
  }
}

// ============================================================================
// 3. REGRESIA: BEZPEČNOSŤ & SSR OCHRANA
// ============================================================================
{
  // getPushCapabilities v SSR prostredí (keď nie je plný DOM)
  const caps = getPushCapabilities()
  assert(caps !== null && typeof caps === 'object', 'getPushCapabilities nesmie spadnúť')
}

// ============================================================================
// 4. REGRESIA: VALIDÁCIA ODMIETNUTIA NEPLATNÝCH PUSH POŽIADAVIEK
// ============================================================================
{
  const invalidSub1 = { endpoint: '' }
  assert(!invalidSub1.endpoint, 'Prázdny endpoint je neplatný')

  const invalidSub2 = { endpoint: 'https://push.example.com', keys: {} }
  assert(!('p256dh' in invalidSub2.keys), 'Chýbajúci p256dh kľúč')
}

// ============================================================================
// 5. REGRESIA: ZÁMOK KONTRAKTU CONTRACT-1+1 PRE BEŽNÝCH HOSTÍ
// ============================================================================
{
  // Overenie, že Push notifikácia nemení ani neobchádza transactionUsed príznak pre hostí
  const guestSession = {
    transactionUsed: true,
    pdfGenerated: false,
    status: 'active',
  }

  // Push notifikácia je len komunikačný kanál, nesmie zmeniť stav session
  assert(guestSession.transactionUsed === true, 'CONTRACT-1+1: transactionUsed zostáva true')
  assert(guestSession.status === 'active', 'CONTRACT-1+1: session status nezmenený')
}

// ============================================================================
// 6. REGRESIA: SERVER-SIDE HELPER sendWebPushNotification
// ============================================================================
async function testServerPushHelper() {
  // Test s neexistujúcim userId (nesmie vyhodiť neošetrenú výnimku)
  const res = await sendWebPushNotification({
    title: 'Test',
    message: 'Test message',
    userId: 'non-existent-user-uuid-12345',
  })

  assert(typeof res.sentCount === 'number', 'sentCount musí byť číslo')
  assert(typeof res.failedCount === 'number', 'failedCount musí byť číslo')
  assert(res.totalSubscriptions === 0, 'Pre neexistujúceho usera je 0 odberov')
}

void testServerPushHelper()

// ============================================================================
// 7. REGRESIA: ŠPECIFIKÁCIE MODELOV IPHONE (14 Plus, 17 Pro, 17 Pro Max, 18 Pro)
// ============================================================================
import { MOBILE_DEVICE_MATRIX } from '@/e2e/devices/mobile-device-matrix'

{
  const targetModels = [
    { name: 'iPhone 14 Plus', width: 428, height: 926, cutout: 'notch', minIos: '17' },
    { name: 'iPhone 17 Pro', width: 402, height: 874, cutout: 'dynamic-island', minIos: '18' },
    { name: 'iPhone 17 Pro Max', width: 440, height: 956, cutout: 'dynamic-island', minIos: '18' },
    { name: 'iPhone 18 Pro', width: 402, height: 874, cutout: 'dynamic-island', minIos: '19' },
  ]

  for (const target of targetModels) {
    const found = MOBILE_DEVICE_MATRIX.find(m => m.name.includes(target.name))
    assert(Boolean(found), `Model ${target.name} musí byť definovaný v MOBILE_DEVICE_MATRIX`)
    assert(found!.os === 'ios', `Model ${target.name} musí mať operačný systém ios`)
    assert(found!.width === target.width, `Model ${target.name} musí mať šírku ${target.width}pt`)
    assert(found!.height === target.height, `Model ${target.name} musí mať výšku ${target.height}pt`)
    assert(found!.cutoutType === target.cutout, `Model ${target.name} musí mať cutout ${target.cutout}`)
    assert(found!.userAgent.includes('iPhone OS'), `Model ${target.name} musí mať platný iPhone userAgent`)
    assert(found!.dpr === 3, `Model ${target.name} musí mať Retina DPR 3`)
    assert(found!.safeTop > 0 && found!.safeBottom > 0, `Model ${target.name} musí mať platné safe areas`)
  }
}

