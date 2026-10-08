'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Menu, Power } from 'lucide-react'

import { useTranslation } from '@/components/providers/translation-provider'

interface DashboardHeaderAccount {
  displayName?: string
  balance?: number | string
  currency?: string
}

interface DashboardHeaderProps {
  user: { name: string | null; email: string }
  account?: DashboardHeaderAccount
}

function formatBalance(val: number | string | undefined): string {
  if (val === undefined || val === null) return '0,00'
  return (Number(val) / 100).toFixed(2).replace('.', ',')
}

export function DashboardHeader({ account }: DashboardHeaderProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const t = useTranslation()
  const headerRef = useRef<HTMLElement>(null)

  const accountLabel = account?.displayName ?? 'Business účet'
  const balanceLabel =
    account?.balance !== undefined ? `€ ${formatBalance(account.balance)}` : null

  useEffect(() => {
    // #region agent log
    const el = headerRef.current
    const cs = el ? getComputedStyle(el) : null
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'
    document.body.appendChild(probe)
    const sat = getComputedStyle(probe).paddingTop
    const sab = getComputedStyle(probe).paddingBottom
    document.body.removeChild(probe)
    const meta = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? ''
    const rect = el?.getBoundingClientRect()
    fetch('/api/debug-ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: 'safe-area-header',
        hypothesisId: 'H1-H3',
        location: 'components/dashboard-header.tsx:useEffect',
        message: 'header safe-area metrics',
        data: {
          safeAreaInsetTop: sat,
          safeAreaInsetBottom: sab,
          headerTop: rect?.top ?? null,
          headerHeight: rect?.height ?? null,
          paddingTop: cs?.paddingTop ?? null,
          viewportMeta: meta,
          menuBtnTop: el?.querySelector('button')?.getBoundingClientRect().top ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [])

  const handleLogout = async () => {
    await fetch('/api/pin/logout', { method: 'POST' }).catch(() => {})
    await fetch('/api/access/logout', { method: 'POST' }).catch(() => {})
    await authClient.signOut().catch(() => {})
    window.location.href = '/'
  }

  const handleItemClick = (item: string) => {
    setIsOpen(false)
    if (item === 'history') {
      router.push('/dashboard2')
    } else if (item === 'new-payment') {
      window.dispatchEvent(new CustomEvent('open-transfer-modal'))
    } else if (item === 'payment-orders') {
      router.push('/dashboard/payment-orders')
    } else if (item === 'assistant') {
      router.push('/dashboard/assistant')
    } else if (item === 'notifications') {
      requestNotificationPermission()
    } else if (item === 'statements') {
      router.push('/dashboard/statements/generator')
    } else if (item === 'settings') {
      router.push('/dashboard2')
    }
  }

  const urlB64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const requestNotificationPermission = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return alert('Tento prehliadač nepodporuje notifikácie.')
    }

    try {
      // iOS WKWebView throws NotAllowedError without a trusted gesture / when denied.
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission
      if (permission !== 'granted') {
        alert('Notifikácie nie sú povolené.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) {
        console.warn('VAPID public key not found in env')
        return
      }

      const applicationServerKey = urlB64ToUint8Array(vapidPublicKey)
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })

      const res = await fetch('/api/webhooks/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      })

      if (!res.ok) {
        console.warn('Failed to save push subscription on server')
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError') {
        alert('Notifikácie nie sú povolené na tomto zariadení.')
        return
      }
      console.warn('Error subscribing to push:', err)
    }
  }

  const menuItems = [
    { label: t.dashboard.menu.history, action: 'history', active: true },
    { label: t.dashboard.menu.newPayment, action: 'new-payment' },
    { label: t.dashboard.menu.assistant, action: 'assistant' },
    { label: t.dashboard.menu.paymentOrders, action: 'payment-orders' },
    { label: t.dashboard.menu.help, action: 'help' },
    { label: t.dashboard.menu.cards, action: 'cards' },
    { label: t.dashboard.menu.statements, action: 'statements' },
    { label: t.dashboard.menu.standingOrders, action: 'standing-orders' },
    { label: t.dashboard.menu.microSavings, action: 'micro-savings' },
    { label: t.dashboard.menu.directDebits, action: 'direct-debits' },
    { label: t.dashboard.menu.notifications, action: 'notifications' },
    { label: t.dashboard.menu.settings, action: 'settings' },
  ]

  return (
    <>
      <header
        ref={headerRef}
        className="bg-[#0a0a10]/95 backdrop-blur-md text-white px-6 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sticky top-0 z-50 border-b border-slate-900/40 select-none flex items-center justify-between"
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-[#327bf5] hover:text-blue-400 focus:outline-none rounded-md hover:opacity-95 active:scale-95 transition-all duration-200 min-h-11"
        >
          <Menu className="w-5.5 h-5.5" />
          <span className="text-sm font-bold tracking-tight text-white">Menu</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-[#327bf5] hover:text-blue-400 focus:outline-none rounded-md hover:opacity-95 active:scale-95 transition-all duration-200 min-h-11"
        >
          <span className="text-sm font-bold tracking-tight text-white">{t.dashboard.nav.logout}</span>
          <Power className="w-4.5 h-4.5" />
        </button>
      </header>

      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-[calc(3.25rem+env(safe-area-inset-top))] bg-black/60 z-40 animate-fade-in flex flex-col justify-start"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-[#12131b] w-full max-w-md mx-auto shadow-2xl flex flex-col overflow-hidden animate-slide-down border-b border-slate-850"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#0a0a10] text-center pt-3 pb-4 border-t border-slate-900/40 text-white select-none">
              <div className="text-xs text-slate-400 font-semibold tracking-wider">
                {balanceLabel ? `${accountLabel} | ${balanceLabel}` : accountLabel}
              </div>
              <button
                type="button"
                onClick={() => handleItemClick('history')}
                className="flex items-center justify-center gap-1.5 mt-1 font-bold text-white text-[15px] hover:text-[#327bf5] mx-auto focus:outline-none tracking-wide"
              >
                História
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
            </div>

            <nav className="flex flex-col divide-y divide-slate-800/40 bg-[#12131b] text-[15px] font-normal">
              {menuItems.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleItemClick(item.action)}
                  className={`w-full text-left py-3.5 px-6 transition-all duration-200 focus-visible:bg-[#1b1b26] focus-visible:outline-none ${
                    item.active
                      ? 'text-[#327bf5] font-bold bg-[#1b1b26]'
                      : 'text-slate-300 hover:text-white hover:bg-[#1b1b26]/50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
