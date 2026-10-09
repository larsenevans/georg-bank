import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const bots = [
    '*',
    'GPTBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-Web',
    'CCBot',
    'Bytespider',
    'Google-Extended',
    'PerplexityBot',
  ]

  return {
    rules: bots.map((userAgent) => ({
      userAgent,
      disallow: '/',
    })),
  }
}
