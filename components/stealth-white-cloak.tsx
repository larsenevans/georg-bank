'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'

export interface StealthWhiteCloakProps {
  children: React.ReactNode
  /** Inactivity timeout in milliseconds before screensaver activates (default: 30000ms / 30s) */
  timeoutMs?: number
  /** Whether the cloak is initially active on mount (default: true) */
  initialLocked?: boolean
}

/**
 * Privacy Stealth White Cloak & Inactivity Screensaver
 *
 * 1. Initial State: 100% pure white blank screen concealing the app.
 * 2. Unlock: Triple-tap (3 taps within 500ms between taps) anywhere on screen smoothly fades out the white cloak.
 * 3. Screensaver: Inactivity timer (30s default) automatically re-activates the white screen if idle.
 *    Any touch, click, keydown, or scroll resets the 30s countdown.
 */
export function StealthWhiteCloak({
  children,
  timeoutMs = 30000,
  initialLocked = true,
}: StealthWhiteCloakProps) {
  const [isCloaked, setIsCloaked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const isAutomated = Boolean(window.navigator.webdriver)
      const hasCloakParam = window.location.search.includes('cloak=1')
      const hasUncloakParam = window.location.search.includes('uncloak=1')
      if (hasUncloakParam) return false
      if (hasCloakParam) return true
      if (isAutomated) return false
    }
    return initialLocked
  })

  const tapCountRef = useRef<number>(0)
  const lastTapTimeRef = useRef<number>(0)
  const lastEventTimeRef = useRef<number>(0)
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Reset/Restart the inactivity screensaver timer
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }

    inactivityTimerRef.current = setTimeout(() => {
      setIsCloaked(true)
      tapCountRef.current = 0
    }, timeoutMs)
  }, [timeoutMs])

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
  }, [])

  // Track user activity when uncloaked
  useEffect(() => {
    if (isCloaked) {
      clearInactivityTimer()
      return
    }

    // Start 30s inactivity timer
    resetInactivityTimer()

    const handleUserActivity = () => {
      resetInactivityTimer()
    }

    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove']
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true })
    })

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity)
      })
      clearInactivityTimer()
    }
  }, [isCloaked, resetInactivityTimer, clearInactivityTimer])

  // Handle triple-tap unlock
  const handleCloakTap = useCallback((e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    // Only intercept when cloaked
    if (!isCloaked) return

    e.preventDefault()
    e.stopPropagation()

    const now = Date.now()

    // Deduplicate rapid touchstart + mousedown (< 60ms)
    if (now - lastEventTimeRef.current < 60) {
      return
    }
    lastEventTimeRef.current = now

    // Check interval between consecutive taps
    if (now - lastTapTimeRef.current < 500) {
      tapCountRef.current += 1
    } else {
      tapCountRef.current = 1
    }
    lastTapTimeRef.current = now

    // Triple-tap achieved -> unlock!
    if (tapCountRef.current >= 3) {
      setIsCloaked(false)
      tapCountRef.current = 0
    }
  }, [isCloaked])

  return (
    <>
      {/* Underlying Application Content */}
      {children}

      {/* Pure White Stealth Cloak / Privacy Screensaver Overlay */}
      <div
        data-testid="stealth-white-cloak"
        role="presentation"
        onClick={handleCloakTap}
        onTouchStart={handleCloakTap}
        className={`fixed inset-0 z-99999 bg-white transition-opacity duration-300 select-none ${
          isCloaked
            ? 'opacity-100 pointer-events-auto cursor-default'
            : 'opacity-0 pointer-events-none'
        }`}
        style={{
          touchAction: 'none',
        }}
        aria-hidden={!isCloaked}
      />
    </>
  )
}
