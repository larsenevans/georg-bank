'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/**
 * Lightweight shared balance store for the Horizon bank shell so that any
 * tab (overview, admin sheet, settings) can mutate the live balance and have
 * every other tab update immediately without prop-drilling.
 */

export interface HorizonBalanceState {
  balanceEur: number
  hideBalance: boolean
  /** Set a known balance (EUR). */
  setBalanceEur: (value: number) => void
  /** Apply a delta in EUR (positive = add, negative = subtract). */
  applyDeltaEur: (delta: number) => void
  /** Toggle the masked balance (€ •••••). */
  setHideBalance: (value: boolean) => void
}

const HorizonBalanceContext = createContext<HorizonBalanceState | null>(null)

export function HorizonBalanceProvider({
  initialBalanceEur,
  initialHideBalance = false,
  children,
}: {
  initialBalanceEur: number
  initialHideBalance?: boolean
  children: ReactNode
}) {
  const [balanceEur, setBalanceEur] = useState<number>(initialBalanceEur)
  const [hideBalance, setHideBalance] = useState<boolean>(initialHideBalance)

  const applyDeltaEur = useCallback((delta: number) => {
    setBalanceEur((prev) => Math.max(0, prev + delta))
  }, [])

  const toggleHideBalance = useCallback((value: boolean) => {
    setHideBalance(value)
    try {
      localStorage.setItem('hb.hideBalance', value ? '1' : '0')
    } catch {
      // Storage may be unavailable; persistence is best-effort.
    }
  }, [])

  return (
    <HorizonBalanceContext.Provider
      value={{
        balanceEur,
        hideBalance,
        setBalanceEur,
        applyDeltaEur,
        setHideBalance: toggleHideBalance,
      }}
    >
      {children}
    </HorizonBalanceContext.Provider>
  )
}

export function useHorizonBalance(): HorizonBalanceState {
  const ctx = useContext(HorizonBalanceContext)
  if (!ctx) {
    throw new Error('useHorizonBalance must be used within HorizonBalanceProvider')
  }
  return ctx
}

/** Reusable EUR formatter (sk-SK locale). */
export function formatEur(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('sk-SK', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(value)
}