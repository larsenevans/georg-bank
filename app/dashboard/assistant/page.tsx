import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { guestLoginPath } from '@/lib/guest-auth'
import { db } from '@/lib/db'
import {
  assistantConversation,
  assistantMessage,
  assistantRunLog,
} from '@/lib/db/schema'
import { getBankAccounts } from '@/app/actions/banking'
import { DashboardHeader } from '@/components/dashboard-header'
import { AssistantDashboardClient } from '@/components/assistant/assistant-dashboard-client'
import { getAssistantConfigStatus } from '@/lib/assistant/mistral'
import { and, desc, eq } from 'drizzle-orm'

export const metadata = {
  title: 'George asistent - dashboard',
}

export default async function AssistantDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect(guestLoginPath('/dashboard/assistant'))

  const conversations = await db
    .select()
    .from(assistantConversation)
    .where(eq(assistantConversation.userId, session.user.id))
    .orderBy(desc(assistantConversation.updatedAt))
    .limit(6)

  const messages = await db
    .select({ id: assistantMessage.id })
    .from(assistantMessage)
    .where(eq(assistantMessage.userId, session.user.id))

  const [lastErrorLog] = await db
    .select()
    .from(assistantRunLog)
    .where(
      and(
        eq(assistantRunLog.userId, session.user.id),
        eq(assistantRunLog.status, 'error')
      )
    )
    .orderBy(desc(assistantRunLog.createdAt))
    .limit(1)

  const accounts = await getBankAccounts()
  const checkingAccount = accounts.find((acc) => acc.accountType === 'checking') ?? accounts[0]

  return (
    <div className="min-h-[100dvh] bg-[#121620]">
      <DashboardHeader
        user={session.user}
        account={checkingAccount ? {
          displayName: 'Business účet',
          balance: checkingAccount.balance,
          currency: checkingAccount.currency,
        } : undefined}
      />
      <AssistantDashboardClient
        config={getAssistantConfigStatus()}
        conversationCount={conversations.length}
        messageCount={messages.length}
        lastError={lastErrorLog?.error ?? null}
        currentUserId={session.user.id}
        currentUserDisplayName={session.user.name || session.user.email}
        conversations={conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          updatedAt: conversation.updatedAt.toISOString(),
        }))}
      />
    </div>
  )
}
