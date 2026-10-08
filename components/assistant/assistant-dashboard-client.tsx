'use client'

import { useState, useEffect, useRef } from 'react'
import { Bot, CheckCircle2, Loader2, Send, Wifi, Users, MessageSquare } from 'lucide-react'
import type { AssistantConfigStatus } from '@/lib/assistant/types'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  senderId?: string
  senderName?: string
  createdAt: string
}

interface AssistantDashboardClientProps {
  config: AssistantConfigStatus
  conversationCount: number
  messageCount: number
  lastError: string | null
  currentUserId: string
  currentUserDisplayName: string
  conversations: Array<{
    id: string
    title: string
    updatedAt: string
  }>
}

export function AssistantDashboardClient({
  config,
  lastError,
  currentUserId,
  currentUserDisplayName,
}: AssistantDashboardClientProps) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isShared, setIsShared] = useState(false)
  const [activeUsers, setActiveUsers] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({})
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const isTypingRef = useRef(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load initial chat history and poll every 5 seconds (as fallback)
  useEffect(() => {
    const loadChat = async () => {
      try {
        const response = await fetch('/api/assistant/chat')
        const data = await response.json()
        if (response.ok) {
          setMessages(data.messages || [])
          setIsShared(data.isShared || false)
          setActiveUsers(data.activeUsers || 1)
        }
      } catch (err) {
        console.error('Failed to load chat history:', err)
      }
    }

    loadChat()
    const interval = setInterval(loadChat, 5000)

    return () => clearInterval(interval)
  }, [])

  // Subscribe to Supabase Realtime Channel for Broadcast events (Live chat & typing indicator)
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) {
      // CI / offline demos without NEXT_PUBLIC_SUPABASE_* — UI still works via REST polling
      return
    }

    const channel = supabase.channel('george-chat-channel')

    channel
      .on('broadcast', { event: 'new-message' }, (payload) => {
        const msg = payload.payload.message
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { senderId, senderName, isTyping } = payload.payload
        if (senderId === currentUserId) return

        setTypingUsers((prev) => {
          if (isTyping) {
            return { ...prev, [senderId]: senderName }
          } else {
            const next = { ...prev }
            delete next[senderId]
            return next
          }
        })
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId])

  // Scroll to bottom when messages or typing indicators change
  useEffect(() => {
    scrollToBottom()
  }, [messages, typingUsers])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setMessage(val)

    if (!isShared || !channelRef.current) return

    // Send typing status
    if (!isTypingRef.current && val.trim() !== '') {
      isTypingRef.current = true
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, senderName: currentUserDisplayName, isTyping: true },
      })
    }

    // Stop typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false
        channelRef.current?.send({
          type: 'broadcast',
          event: 'typing',
          payload: { senderId: currentUserId, senderName: currentUserDisplayName, isTyping: false },
        })
      }
    }, 1500)
  }

  const sendMessage = async () => {
    const text = message.trim()
    if (!text || loading) return

    setLoading(true)
    setError(null)
    setMessage('')

    // Reset typing status immediately
    if (isTypingRef.current && channelRef.current) {
      isTypingRef.current = false
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { senderId: currentUserId, senderName: currentUserDisplayName, isTyping: false },
      })
    }

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Odoslanie správy zlyhalo.')
      }

      if (data.messages && data.messages.length > 0) {
        setMessages((prev) => [...prev, ...data.messages])

        // Broadcast new messages to other connected clients via Supabase Realtime
        if (isShared && channelRef.current) {
          for (const msg of data.messages) {
            channelRef.current.send({
              type: 'broadcast',
              event: 'new-message',
              payload: { message: msg },
            })
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Odoslanie správy zlyhalo.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void sendMessage()
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 pt-4 text-white">
      {/* Header Card */}
      <div className="mb-4 rounded-[18px] border border-[#2b3347] bg-[#181921] p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#8e9bb5]">
              {isShared ? 'Skupinový modul' : 'Súkromný modul'}
            </p>
            <h1 className="mt-1 text-xl font-black">
              {isShared ? 'Spoločný čet' : 'George asistent'}
            </h1>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-full ${isShared ? 'bg-[#22c55e]' : 'bg-[#1d63ed]'}`}>
            {isShared ? <Users className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatusCard
          icon={<Users className="h-4 w-4" />}
          label="Online užívatelia"
          value={`${activeUsers}`}
          active={activeUsers >= 2}
        />
        <StatusCard
          icon={<MessageSquare className="h-4 w-4" />}
          label="Režim četu"
          value={isShared ? 'Spoločný (Live)' : 'Súkromný'}
          active={isShared}
        />
        <StatusCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Mistral API"
          value={config.mistralConfigured ? 'configured' : 'missing'}
          active={config.mistralConfigured}
        />
        <StatusCard
          icon={<Wifi className="h-4 w-4" />}
          label="Web search"
          value={config.webSearchEnabled ? 'enabled' : 'disabled'}
          active={config.webSearchEnabled}
        />
      </div>

      {/* Main Chat Area */}
      <section className="flex flex-col rounded-[18px] border border-[#2b3347] bg-[#181921] p-4 shadow-2xl grow min-h-87.5 max-h-125">
        <h2 className="text-sm font-black mb-3 border-b border-[#2b3347] pb-2 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[#8e9bb5]" />
          Konverzácia
        </h2>
        
        {/* Messages List Container */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
          {messages.length > 0 ? (
            messages.map((msg) => {
              const isAssistant = msg.role === 'assistant'
              const isCurrentUser = msg.senderId === currentUserId

              return (
                <div key={msg.id} className="flex flex-col animate-fade-in">
                  {/* Sender Name */}
                  {!isAssistant && !isCurrentUser && (
                    <span className="text-[10px] text-[#8e9bb5] mb-1 ml-2 font-semibold">
                      {msg.senderName}
                    </span>
                  )}
                  {isAssistant && (
                    <span className="text-[10px] text-[#1d63ed] mb-1 ml-2 font-semibold">
                      George Asistent
                    </span>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`rounded-[16px] px-3.5 py-2 text-sm leading-relaxed max-w-[85%] w-fit ${
                      isAssistant
                        ? 'bg-[#1b2230] text-white mr-auto rounded-tl-none border border-[#232d3f]'
                        : isCurrentUser
                        ? 'bg-[#1d63ed] text-white ml-auto rounded-tr-none'
                        : 'bg-[#2b3347] text-white mr-auto rounded-tl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-[#8e9bb5] text-center p-6">
              <Bot className="h-10 w-10 text-[#2b3347] mb-2" />
              <p className="text-sm font-semibold">Zatiaľ žiadne správy.</p>
              <p className="text-xs text-[#62708b] mt-1">Pošli prvú správu na začatie konverzácie.</p>
            </div>
          )}

          {/* Typing Indicator */}
          {Object.keys(typingUsers).length > 0 && (
            <div className="text-xs text-[#8e9bb5] italic flex items-center gap-1.5 ml-2 mt-1 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8e9bb5] animate-bounce"></span>
              <span>
                {Object.values(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'píše...' : 'píšu...'}
              </span>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="mt-4 flex gap-2 border-t border-[#2b3347] pt-3">
          <input
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isShared ? "Napíš správu ostatným..." : "Opýtaj sa Georga..."}
            className="h-11 min-w-0 flex-1 rounded-[14px] border border-[#2b3347] bg-[#0f121a] px-3.5 text-sm font-semibold outline-none focus:border-[#1d63ed] placeholder:text-[#62708b]"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={loading || !message.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1d63ed] text-white disabled:bg-[#263042] disabled:text-[#6f7a90] hover:bg-[#154fc2] transition-colors"
            aria-label="Odoslať"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        {error && <p className="mt-2 text-xs font-semibold text-red-400">{error}</p>}
      </section>

      {lastError && (
        <section className="mt-4 rounded-[18px] border border-red-500/30 bg-red-950/20 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-red-300">Posledná chyba asistenta</p>
          <p className="mt-2 text-sm text-red-100">{lastError}</p>
        </section>
      )}
    </main>
  )
}

function StatusCard({
  icon,
  label,
  value,
  active,
}: {
  icon: React.ReactNode
  label: string
  value: string
  active: boolean
}) {
  return (
    <div className="rounded-[16px] border border-[#2b3347] bg-[#181921] p-3">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full ${active ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'bg-red-500/10 text-red-300'}`}>
        {icon}
      </div>
      <p className="text-[10px] font-black uppercase tracking-wider text-[#8e9bb5]">{label}</p>
      <p className="mt-1 wrap-break-word text-sm font-black text-white">{value}</p>
    </div>
  )
}
