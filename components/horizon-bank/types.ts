/** A single transaction as surfaced to the Horizon bank shell. */
export interface HorizonTransaction {
  id: string
  recipient: string
  amountEur: number
  type: string
  status?: string
  note?: string
  category?: string
  date: string
  createdAt: string
  pdfUrl?: string | null
  isSuperadmin?: boolean
  userId?: string
}

/** Active user or access session monitored by the superadmin. */
export interface HorizonLiveUser {
  id: string
  requestId: string
  email: string | null
  code: string | null
  status: string
  deviceHint: string | null
  createdAt: string
  sessionToken: string | null
  transactionUsed: boolean
  pdfGenerated: boolean
  paymentsCount: number
}

/** Account shape resolved server-side and passed into the shell. */
export interface HorizonAccount {
  id: string
  userId: string
  accountNumber: string
  displayName?: string | null
  currency?: string | null
  balanceEur: number
}

export interface HorizonShellData {
  balanceEur: number
  account: HorizonAccount | null
  transactions: HorizonTransaction[]
  isSuperadmin: boolean
  displayName: string | null
  liveUsers?: HorizonLiveUser[]
}

/** Stats used by the overview MiniStatistics bar. */
export interface HorizonMonthlyStats {
  incomeEur: number
  expenseEur: number
}