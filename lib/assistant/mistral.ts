import { buildAssistantSystemPrompt } from '@/lib/assistant/context'
import { isWebSearchEnabled, searchWeb } from '@/lib/assistant/web-search'
import type {
  AssistantChatMessage,
  AssistantContext,
  AssistantProviderResult,
  AssistantSource,
} from '@/lib/assistant/types'

const defaultModel = 'mistral-small-latest'

function getMistralApiKey() {
  const key = process.env.MISTRAL_API_KEY?.trim() || ''
  // CI / placeholder keys must not hit the real Mistral API
  if (!key || key.startsWith('ci-dummy') || key === 'dummy' || key === 'test') {
    return null
  }
  return key
}

export function getAssistantConfigStatus() {
  const key = getMistralApiKey()
  return {
    // UI may still show "configured" when a non-empty env is set (incl. CI dummy)
    mistralConfigured: Boolean(process.env.MISTRAL_API_KEY?.trim()),
    model: process.env.MISTRAL_MODEL || defaultModel,
    webSearchEnabled: isWebSearchEnabled(),
    // real key usable for live calls
    mistralLive: Boolean(key),
  }
}

function looksLikeWebQuestion(message: string) {
  return /\b(internet|web|online|google|vyhľadaj|vyhladaj|najdi|aktuálne|aktualne|správy|spravy)\b/i.test(message)
}

function buildDemoAnswer(message: string, context: AssistantContext, sources: AssistantSource[]) {
  const primaryAccount = context.accounts[0]
  const balanceLine = primaryAccount
    ? `Vidím tvoj hlavný demo účet so zostatkom ${primaryAccount.balance} ${primaryAccount.currency}.`
    : 'Zatiaľ pri tvojom profile nevidím aktívny účet.'

  const webLine = looksLikeWebQuestion(message) && !isWebSearchEnabled()
    ? 'Internetové vyhľadávanie ešte nie je zapnuté.'
    : sources.length > 0
      ? 'Internetové vyhľadávanie je pripravené cez provider hook.'
      : ''

  return [
    'Som George asistent v demo režime. Mistral API ešte nie je nakonfigurované, takže odpovedám lokálne a bezpečne.',
    balanceLine,
    'Môžem pomôcť vysvetliť zostatky, posledné transakcie alebo postup platby, ale platbu za teba nevykonám.',
    webLine,
  ].filter(Boolean).join(' ')
}

function normalizeSources(sources: AssistantSource[]) {
  return sources.filter((source) => source.title.trim()).slice(0, 5)
}

export async function runAssistant({
  message,
  context,
  history,
}: {
  message: string
  context: AssistantContext
  history: AssistantChatMessage[]
}): Promise<AssistantProviderResult> {
  const config = getAssistantConfigStatus()
  const webSources = looksLikeWebQuestion(message) ? await searchWeb(message) : []
  const sources = normalizeSources(webSources)

  const apiKey = getMistralApiKey()

  if (!apiKey) {
    return {
      content: buildDemoAnswer(message, context, sources),
      sources,
      provider: 'demo',
      model: config.model,
    }
  }

  let response: Response
  try {
    response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: buildAssistantSystemPrompt(context) },
          ...history.slice(-12).map((item) => ({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: item.content,
          })),
          {
            role: 'user',
            content: sources.length > 0
              ? `${message}\n\nDostupné zdroje:\n${sources.map((source) => `- ${source.title}: ${source.snippet ?? source.url ?? ''}`).join('\n')}`
              : message,
          },
        ],
      }),
    })
  } catch {
    // Network failure → demo fallback (keeps chat UI usable in CI / offline)
    return {
      content: buildDemoAnswer(message, context, sources),
      sources,
      provider: 'demo',
      model: config.model,
    }
  }

  if (!response.ok) {
    // Invalid/expired key or rate limit → demo fallback instead of hard 500
    return {
      content: buildDemoAnswer(message, context, sources),
      sources,
      provider: 'demo',
      model: config.model,
    }
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('Mistral API nevrátilo odpoveď.')
  }

  return {
    content,
    sources,
    provider: 'mistral',
    model: config.model,
  }
}
