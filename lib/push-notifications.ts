/**
 * Client-side Web Push notifications helper for George Banking.
 * Handles Android & iPhone (iOS 16.4+ PWA) subscription lifecycles.
 */

export interface PushCapabilities {
  supported: boolean
  isIos: boolean
  isStandalone: boolean
  permission: NotificationPermission | 'unsupported'
  needsHomeScreenInstall: boolean
  reason?: string
}

/**
 * Standard utility to convert a URL-safe Base64 string into a Uint8Array
 * required by `PushManager.subscribe({ applicationServerKey })`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Detect browser and OS capabilities for Web Push.
 * Specifically checks for iOS restrictions where Apple requires PWA Home Screen install.
 */
export function getPushCapabilities(): PushCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      isIos: false,
      isStandalone: false,
      permission: 'unsupported',
      needsHomeScreenInstall: false,
      reason: 'SSR prostredie',
    }
  }

  const userAgent = (navigator.userAgent || '').toLowerCase()
  const isIos = /iphone|ipad|ipod/.test(userAgent)

  // Check if running as installed standalone PWA
  const isStandalone =
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    // @ts-expect-error - iOS Safari legacy property
    Boolean(navigator.standalone)

  const hasSW = 'serviceWorker' in navigator
  const hasPush = 'PushManager' in window
  const hasNotification = 'Notification' in window

  // iOS Safari requires PWA Home Screen install for Notification & Push API
  if (isIos && (!hasNotification || !hasPush || !isStandalone)) {
    return {
      supported: false,
      isIos: true,
      isStandalone,
      permission: hasNotification ? Notification.permission : 'unsupported',
      needsHomeScreenInstall: true,
      reason: 'Na iPhone je potrebné aplikáciu najprv pridať na plochu (Zdieľať ➔ Pridať na plochu).',
    }
  }

  if (!hasSW || !hasPush || !hasNotification) {
    return {
      supported: false,
      isIos,
      isStandalone,
      permission: 'unsupported',
      needsHomeScreenInstall: false,
      reason: 'Váš prehliadač nepodporuje Web Push notifikácie.',
    }
  }

  return {
    supported: true,
    isIos,
    isStandalone,
    permission: Notification.permission,
    needsHomeScreenInstall: false,
  }
}

/**
 * Register Service Worker and subscribe the device to Web Push.
 */
export async function subscribeToPush(
  role: 'user' | 'superadmin' = 'user'
): Promise<{ success: boolean; message: string }> {
  const caps = getPushCapabilities()

  if (caps.needsHomeScreenInstall) {
    return {
      success: false,
      message: 'Na iPhone pridajte aplikáciu na plochu cez Zdieľať ➔ Pridať na plochu a otvorte ju z plochy.',
    }
  }

  if (!caps.supported) {
    return {
      success: false,
      message: caps.reason || 'Web Push nie je na tomto zariadení podporovaný.',
    }
  }

  // 1. Request notification permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      success: false,
      message: permission === 'denied'
        ? 'Upozornenia boli v prehliadači zablokované. Povoľte ich v nastaveniach stránky.'
        : 'Povolenie na upozornenia nebolo udelené.',
    }
  }

  // 2. Ensure Service Worker is registered
  let reg: ServiceWorkerRegistration
  try {
    reg = await navigator.serviceWorker.ready
  } catch {
    reg = await navigator.serviceWorker.register('/service-worker.js')
    await navigator.serviceWorker.ready
  }

  // 3. Get public VAPID key
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    return {
      success: false,
      message: 'VAPID kľúč nie je nakonfigurovaný na serveri.',
    }
  }

  // 4. Subscribe with PushManager
  try {
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const appServerKey = urlBase64ToUint8Array(vapidKey)
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      })
    }

    // 5. Send subscription to server
    const res = await fetch('/api/webhooks/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.toJSON().keys?.p256dh,
          auth: sub.toJSON().keys?.auth,
        },
        role,
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      return {
        success: false,
        message: errData.message || 'Nepodarilo sa uložiť odber notifikácií na serveri.',
      }
    }

    return {
      success: true,
      message: 'Push notifikácie boli úspešne aktivované pre toto zariadenie.',
    }
  } catch (err) {
    console.error('[Push Client] Subscription error:', err)
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Chyba pri vytváraní push odberu.',
    }
  }
}

/**
 * Unsubscribe current device from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await sub.unsubscribe()
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Trigger an immediate local demonstration notification if permitted.
 */
export async function showLocalNotification(title: string, body: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, {
        body,
        icon: '/android-chrome-192x192.png',
        badge: '/favicon-32x32.png',
        tag: 'george-test',
      })
      return true
    } else {
      new Notification(title, { body, icon: '/android-chrome-192x192.png' })
      return true
    }
  } catch {
    return false
  }
}
