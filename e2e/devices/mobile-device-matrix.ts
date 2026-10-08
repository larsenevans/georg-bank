export interface MobileDeviceSpec {
  name: string
  os: 'ios' | 'android'
  width: number
  height: number
  dpr: number
  safeTop: number
  safeBottom: number
  userAgent: string
  cutoutType: 'notch' | 'dynamic-island' | 'punch-hole'
}

export const MOBILE_DEVICE_MATRIX: MobileDeviceSpec[] = [
  // --- APPLE iOS (iPhone 13 Pro Max a vyššie) ---
  {
    name: 'iPhone 14 Plus / 13 Pro Max',
    os: 'ios',
    width: 428,
    height: 926,
    dpr: 3,
    safeTop: 47,
    safeBottom: 34,
    cutoutType: 'notch',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPhone 14 Pro / 15 / 15 Pro',
    os: 'ios',
    width: 393,
    height: 852,
    dpr: 3,
    safeTop: 59,
    safeBottom: 34,
    cutoutType: 'dynamic-island',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPhone 15 Pro Max / 16 Plus',
    os: 'ios',
    width: 430,
    height: 932,
    dpr: 3,
    safeTop: 59,
    safeBottom: 34,
    cutoutType: 'dynamic-island',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPhone 16 Pro / 17 Pro',
    os: 'ios',
    width: 402,
    height: 874,
    dpr: 3,
    safeTop: 62,
    safeBottom: 34,
    cutoutType: 'dynamic-island',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPhone 16 Pro Max / 17 Pro Max',
    os: 'ios',
    width: 440,
    height: 956,
    dpr: 3,
    safeTop: 62,
    safeBottom: 34,
    cutoutType: 'dynamic-island',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPhone 17 Air / Slim',
    os: 'ios',
    width: 412,
    height: 892,
    dpr: 3,
    safeTop: 59,
    safeBottom: 34,
    cutoutType: 'dynamic-island',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },

  // --- GOOGLE ANDROID (Top vlajkové lode) ---
  {
    name: 'Samsung Galaxy S24 Ultra',
    os: 'android',
    width: 412,
    height: 915,
    dpr: 3.5,
    safeTop: 38,
    safeBottom: 24,
    cutoutType: 'punch-hole',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  },
  {
    name: 'Samsung Galaxy S24 (Base)',
    os: 'android',
    width: 390,
    height: 844,
    dpr: 3,
    safeTop: 36,
    safeBottom: 24,
    cutoutType: 'punch-hole',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  },
  {
    name: 'Google Pixel 9 Pro',
    os: 'android',
    width: 412,
    height: 924,
    dpr: 3.5,
    safeTop: 40,
    safeBottom: 24,
    cutoutType: 'punch-hole',
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  },
  {
    name: 'Nothing Phone (1)',
    os: 'android',
    width: 412,
    height: 915,
    dpr: 2.625,
    safeTop: 36,
    safeBottom: 24,
    cutoutType: 'punch-hole',
    userAgent: 'Mozilla/5.0 (Linux; Android 13; A063) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
  {
    name: 'Xiaomi 14 Pro',
    os: 'android',
    width: 393,
    height: 851,
    dpr: 3,
    safeTop: 36,
    safeBottom: 24,
    cutoutType: 'punch-hole',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; 23116PN5BC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  },
]
