import type { Page } from '@playwright/test'

export type ApiBalanceSnapshot = {
  ok: boolean
  cents: number | undefined
  accountNumber: string | undefined
  latestAfter: number | undefined
}

/** Reads balance of the Business account (label-based, not array-position-based) and latest ledger balance. */
export async function readApiBalance(page: Page): Promise<ApiBalanceSnapshot> {
  return page.evaluate(async () => {
    const res = await fetch('/api/transactions', { cache: 'no-store' })
    const data = await res.json()
    const accounts: Array<{
      balance?: number
      accountNumber?: string
      displayName?: string
      productLabel?: string
      accountType?: string
    }> = data.accounts ?? []
    const business =
      accounts.find((a) => /business/i.test(`${a.displayName ?? ''} ${a.productLabel ?? ''}`)) ??
      accounts.find((a) => a.accountType === 'checking') ??
      accounts[0]
    const txs: Array<{ createdAt?: string; balanceAfter?: number }> = (data.transactions ?? []).filter(
      (t: { balanceAfter?: unknown }) => typeof t.balanceAfter === 'number'
    )
    let latest = txs[0]
    for (const t of txs) {
      if (latest && t.createdAt && latest.createdAt && t.createdAt > latest.createdAt) latest = t
    }
    return {
      ok: Boolean(data.success),
      cents: business?.balance,
      accountNumber: business?.accountNumber,
      latestAfter:
        typeof latest?.balanceAfter === 'number' ? Math.round(latest.balanceAfter * 100) : undefined,
    }
  })
}
