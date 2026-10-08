import type { devices as PlaywrightDevices } from '@playwright/test'

type DeviceDescriptor = (typeof PlaywrightDevices)[string]

/**
 * iPhone 18 Pro — Next-gen 6.3" Pro OLED display (402 × 874 pt @ DPR 3.0).
 * Dynamic Island / Under-display Face ID, iOS 19+ Safari engine.
 */
export const iphone18Pro: DeviceDescriptor = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  defaultBrowserType: 'webkit',
}

export const IPHONE_18_PRO_VIEWPORT = {
  width: 402,
  height: 874,
  dpr: 3,
} as const
