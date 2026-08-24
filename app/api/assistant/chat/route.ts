import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  assistantConversation,
  assistantMessage,
  assistantRunLog,
  session,
  user,
} from '@/lib/db/schema'
import { getAssistantContext } from '@/lib/assistant/context'
import { getAssistantConfigStatus, runAssistant } from '@/lib/assistant/mistral'
import type { AssistantChatMessage, AssistantSource } from '@/lib/assistant/types'
import { and, desc, eq, gt } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

const maxMessageLength = 1200
const maxMessagesPerMinute = 8
const SHARED_CONVERSATION_ID = 'shared-peer-to-peer-chat-id-9999'

function parseSources(value: string | null): AssistantSource[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return session.user.id
}

async function getActiveUsersCount() {
  const activeSessions = await db
    .select({ userId: session.userId })
    .from(session)
    .where(gt(session.expiresAt, new Date()))

  const uniqueUsers = Array.from(new Set(activeSessions.map((s) => s.userId)))
  return uniqueUsers.length
}

async function getLatestConversation(userId: string) {
  const [conversation] = await db
    .select()
    .from(assistantConversation)
    .where(eq(assistantConversation.userId, userId))
    .orderBy(desc(assistantConversation.updatedAt))
    .limit(1)

  return conversation
}

async function getSharedConversation(userId: string) {
  let [conversation] = await db
    .select()
    .from(assistantConversation)
    .where(eq(assistantConversation.id, SHARED_CONVERSATION_ID))
    .limit(1)

  if (!conversation) {
    // Concurrent first opens race on the fixed shared id — ignore conflict and re-read.
    const inserted = await db
      .insert(assistantConversation)
      .values({
        id: SHARED_CONVERSATION_ID,
        userId,
        title: 'Spoločný čet (Viacero používateľov online)',
      })
      .onConflictDoNothing()
      .returning()
    conversation = inserted[0]
    if (!conversation) {
      ;[conversation] = await db
        .select()
        .from(assistantConversation)
        .where(eq(assistantConversation.id, SHARED_CONVERSATION_ID))
        .limit(1)
    }
  }

  return conversation
}

async function getConversationMessages(conversationId: string) {
  const dbMessages = await db
    .select({
      id: assistantMessage.id,
      role: assistantMessage.role,
      content: assistantMessage.content,
      sources: assistantMessage.sources,
      createdAt: assistantMessage.createdAt,
      senderId: assistantMessage.userId,
      senderName: user.name,
      senderEmail: user.email,
    })
    .from(assistantMessage)
    .leftJoin(user, eq(assistantMessage.userId, user.id))
    .where(eq(assistantMessage.conversationId, conversationId))
    .orderBy(assistantMessage.createdAt)
    .limit(100)

  return dbMessages.map((msg) => ({
    id: msg.id,
    role: msg.role as AssistantChatMessage['role'],
    content: msg.content,
    sources: parseSources(msg.sources),
    createdAt: msg.createdAt.toISOString(),
    senderId: msg.senderId,
    senderName: msg.senderName || msg.senderEmail || 'Užívateľ',
  }))
}

async function assertThrottle(userId: string) {
  const recentLogs = await db
    .select()
    .from(assistantRunLog)
    .where(eq(assistantRunLog.userId, userId))
    .orderBy(desc(assistantRunLog.createdAt))
    .limit(maxMessagesPerMinute)

  const oneMinuteAgo = Date.now() - 60_000
  const recentCount = recentLogs.filter((log) => log.createdAt.getTime() > oneMinuteAgo).length

  if (recentCount >= maxMessagesPerMinute) {
    throw new Error('Asistent dostal príliš veľa správ naraz. Skúste to o chvíľu.')
  }
}

export async function GET() {
  const userId = await requireUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const activeUsersCount = await getActiveUsersCount()
  const isShared = activeUsersCount >= 2

  const conversation = isShared
    ? await getSharedConversation(userId)
    : await getLatestConversation(userId)

  const messages = conversation
    ? await getConversationMessages(conversation.id)
    : []

  return NextResponse.json({
    conversation,
    messages,
    isShared,
    activeUsers: activeUsersCount,
    config: getAssistantConfigStatus(),
  })
}

export async function POST(request: Request) {
  const userId = await requireUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message?: unknown; conversationId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Neplatný JSON request.' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json({ error: 'Správa nemôže byť prázdna.' }, { status: 400 })
  }

  if (message.length > maxMessageLength) {
    return NextResponse.json({ error: `Správa môže mať maximálne ${maxMessageLength} znakov.` }, { status: 400 })
  }

  try {
    await assertThrottle(userId)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Skúste to o chvíľu.' },
      { status: 429 }
    )
  }

  const activeUsersCount = await getActiveUsersCount()
  const isShared = activeUsersCount >= 2
  const config = getAssistantConfigStatus()

  let conversation = null

  if (isShared) {
    conversation = await getSharedConversation(userId)
  } else {
    const requestedConversationId = typeof body.conversationId === 'string'
      ? body.conversationId
      : null

    if (requestedConversationId && requestedConversationId !== SHARED_CONVERSATION_ID) {
      const [existingConversation] = await db
        .select()
        .from(assistantConversation)
        .where(
          and(
            eq(assistantConversation.id, requestedConversationId),
            eq(assistantConversation.userId, userId)
          )
        )
        .limit(1)

      conversation = existingConversation ?? null
    }

    if (!conversation) {
      const [createdConversation] = await db
        .insert(assistantConversation)
        .values({
          id: uuidv4(),
          userId,
          title: message.slice(0, 60),
        })
        .returning()

      conversation = createdConversation
    }
  }

  const [userMessage] = await db
    .insert(assistantMessage)
    .values({
      id: uuidv4(),
      conversationId: conversation.id,
      userId,
      role: 'user',
      content: message,
    })
    .returning()

  const [userInfo] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  const serializedUserMessage = {
    id: userMessage.id,
    role: userMessage.role as AssistantChatMessage['role'],
    content: userMessage.content,
    sources: [],
    createdAt: userMessage.createdAt.toISOString(),
    senderId: userId,
    senderName: userInfo?.name || userInfo?.email || 'Užívateľ',
  }

  if (isShared) {
    await db
      .update(assistantConversation)
      .set({ updatedAt: new Date() })
      .where(eq(assistantConversation.id, conversation.id))

    return NextResponse.json({
      conversation,
      messages: [serializedUserMessage],
      isShared: true,
      activeUsers: activeUsersCount,
      config,
    })
  }

  const history = await getConversationMessages(conversation.id)

  try {
    const context = await getAssistantContext(userId)
    const assistantResult = await runAssistant({
      message,
      context,
      history,
    })

    const [assistantReply] = await db
      .insert(assistantMessage)
      .values({
        id: uuidv4(),
        conversationId: conversation.id,
        userId,
        role: 'assistant',
        content: assistantResult.content,
        sources: JSON.stringify(assistantResult.sources),
      })
      .returning()

    await db
      .update(assistantConversation)
      .set({ updatedAt: new Date() })
      .where(eq(assistantConversation.id, conversation.id))

    await db.insert(assistantRunLog).values({
      id: uuidv4(),
      userId,
      status: 'success',
      provider: assistantResult.provider,
      model: assistantResult.model,
    })

    const serializedReply = {
      id: assistantReply.id,
      role: assistantReply.role as AssistantChatMessage['role'],
      content: assistantReply.content,
      sources: parseSources(assistantReply.sources),
      createdAt: assistantReply.createdAt.toISOString(),
      senderId: userId,
      senderName: 'George Asistent',
    }

    return NextResponse.json({
      conversation,
      messages: [serializedUserMessage, serializedReply],
      isShared: false,
      activeUsers: activeUsersCount,
      config,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Asistent zlyhal.'

    await db.insert(assistantRunLog).values({
      id: uuidv4(),
      userId,
      status: 'error',
      provider: config.mistralConfigured ? 'mistral' : 'demo',
      model: config.model,
      error,
    })

    return NextResponse.json(
      {
        error: 'Asistent teraz nevie odpovedať. Skúste to znova.',
        ...(process.env.NODE_ENV === 'development' ? { detail: error } : {}),
      },
      { status: 500 }
    )
  }
}
