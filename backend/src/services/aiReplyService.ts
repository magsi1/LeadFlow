import { env } from '../lib/env.js'

const FALLBACK_REPLY = 'Thanks! Our team will contact you shortly.'

const SYSTEM_PROMPT =
  'You are a sales agent for a solar company. Your goal is to answer questions, encourage purchase, ask for details (location, usage), and be short and friendly.'

export function getFallbackReply(): string {
  return FALLBACK_REPLY
}

export async function generateAiSalesReply(customerMessage: string): Promise<string> {
  const apiKey = env.openAiApiKey
  if (apiKey == null || apiKey.trim().length === 0) {
    throw new Error('OPENAI_API_KEY missing')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Customer message: ${customerMessage}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`openai_failed:${response.status}:${body.slice(0, 500)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const reply = payload.choices?.[0]?.message?.content?.trim()
  if (reply == null || reply.length === 0) {
    throw new Error('openai_empty_reply')
  }
  return reply
}

