import { env } from '../lib/env.js'

export type LeadScoreCategory = 'HOT' | 'WARM' | 'COLD'

export type LeadScoreResult = {
  score: number
  category: LeadScoreCategory
  llmSuggestion?: string
}

export type LeadIntentClassification = {
  /** Display label for API responses */
  status: 'Hot' | 'Warm' | 'Cold'
  reason: string
  /** Supabase `leads.status` (hot / warm / cold) */
  dbStatus: 'hot' | 'warm' | 'cold'
  /** Optional 0–100 score aligned with tier */
  suggestedScore: number
}

const POSITIVE_KEYWORDS = [
  'price',
  'buy',
  'urgent',
  'quotation',
  'quote',
  'order',
  'install',
  'visit',
  'deal',
]
const NEGATIVE_KEYWORDS = ['hello', 'hi', 'ok', 'okay', 'hmm', 'info']

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function categoryFromScore(score: number): LeadScoreCategory {
  if (score >= 70) return 'HOT'
  if (score >= 40) return 'WARM'
  return 'COLD'
}

export function scoreLeadMessage(message: string): LeadScoreResult {
  const normalized = message.trim().toLowerCase()
  let score = 25

  if (normalized.length >= 45) score += 12
  if (normalized.length >= 80) score += 10
  if (normalized.length <= 8) score -= 10
  if (normalized.length <= 3) score -= 8

  for (const keyword of POSITIVE_KEYWORDS) {
    if (normalized.includes(keyword)) score += 12
  }

  for (const keyword of NEGATIVE_KEYWORDS) {
    if (normalized === keyword) score -= 10
  }

  if (normalized.includes('?')) score += 5
  if (normalized.includes('!')) score += 2

  const finalScore = clampScore(score)
  return {
    score: finalScore,
    category: categoryFromScore(finalScore),
  }
}

function dbStatusFromCategory(c: LeadScoreCategory): 'hot' | 'warm' | 'cold' {
  if (c === 'HOT') return 'hot'
  if (c === 'WARM') return 'warm'
  return 'cold'
}

function displayStatusFromDb(db: 'hot' | 'warm' | 'cold'): 'Hot' | 'Warm' | 'Cold' {
  if (db === 'hot') return 'Hot'
  if (db === 'cold') return 'Cold'
  return 'Warm'
}

function suggestedScoreFromDb(db: 'hot' | 'warm' | 'cold'): number {
  if (db === 'hot') return 80
  if (db === 'warm') return 55
  return 30
}

/**
 * Fast, deterministic rules (product): price/buy/urgent → hot; details/info → warm;
 * just looking / later → cold.
 */
export function classifyByKeywordRules(message: string): {
  tier: 'hot' | 'warm' | 'cold' | null
  reason: string
} {
  const lower = message.trim().toLowerCase()
  if (lower.includes('just looking') || lower.includes('later')) {
    return {
      tier: 'cold',
      reason: 'Browsing or deferring language (e.g. just looking / later).',
    }
  }
  if (/\b(price|buy|urgent)\b/i.test(message)) {
    return {
      tier: 'hot',
      reason: 'Strong purchase signals (price, buy, or urgent).',
    }
  }
  if (/\b(details|info)\b/i.test(message)) {
    return {
      tier: 'warm',
      reason: 'Seeks more information (details or info).',
    }
  }
  return { tier: null, reason: '' }
}

function parseOpenAiClassification(
  raw: string,
): { status: string; reason: string } | null {
  try {
    const parsed = JSON.parse(raw) as { status?: unknown; reason?: unknown }
    const status = typeof parsed.status === 'string' ? parsed.status.trim() : ''
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : ''
    if (status.length === 0) return null
    return { status, reason: reason.length > 0 ? reason : 'Classified by model.' }
  } catch {
    return null
  }
}

function normalizeAiStatusToDb(
  raw: string,
): 'hot' | 'warm' | 'cold' | null {
  const s = raw.trim().toLowerCase()
  if (s === 'hot') return 'hot'
  if (s === 'cold') return 'cold'
  if (s === 'warm') return 'warm'
  return null
}

/**
 * OpenAI JSON classification (gpt-4o-mini). Returns null if disabled or on failure.
 */
export async function classifyWithOpenAi(
  message: string,
): Promise<LeadIntentClassification | null> {
  const apiKey = env.openAiApiKey?.trim()
  const scoringOff =
    (process.env.AI_LEAD_SCORING_ENABLED ?? '').toLowerCase() === 'false'
  if (scoringOff || !apiKey) return null

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 120,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You classify inbound CRM leads. Hot = ready to buy or strong intent. Warm = interested, needs more info. Cold = browsing, vague, or deferring. Respond with JSON only: {"status":"Hot"|"Warm"|"Cold","reason":"one short sentence"}.',
        },
        {
          role: 'user',
          content: `Message:\n${message.trim()}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error('[leadScoring] OpenAI HTTP error', response.status, body.slice(0, 400))
    return null
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content?.trim()
  if (content == null || content.length === 0) {
    console.error('[leadScoring] OpenAI empty content')
    return null
  }

  const parsed = parseOpenAiClassification(content)
  if (parsed == null) {
    console.error('[leadScoring] OpenAI JSON parse failed:', content.slice(0, 200))
    return null
  }

  const db = normalizeAiStatusToDb(parsed.status)
  if (db == null) {
    console.error('[leadScoring] invalid status from model:', parsed.status)
    return null
  }

  return {
    status: displayStatusFromDb(db),
    reason: parsed.reason,
    dbStatus: db,
    suggestedScore: suggestedScoreFromDb(db),
  }
}

function fromHeuristic(message: string): LeadIntentClassification {
  const { score, category } = scoreLeadMessage(message)
  const db = dbStatusFromCategory(category)
  return {
    status: displayStatusFromDb(db),
    reason: `Heuristic score ${score} (${category}).`,
    dbStatus: db,
    suggestedScore: score,
  }
}

/**
 * Classifies a lead message: keyword rules first (fast), then OpenAI when enabled,
 * then length/keyword heuristic. Persists via `dbStatus` + `suggestedScore`.
 */
export async function classifyLeadIntent(
  message: string,
): Promise<LeadIntentClassification> {
  const trimmed = message.trim()
  if (trimmed.length === 0) {
    return {
      status: 'Cold',
      reason: 'Empty message.',
      dbStatus: 'cold',
      suggestedScore: suggestedScoreFromDb('cold'),
    }
  }

  const kw = classifyByKeywordRules(trimmed)
  if (kw.tier != null) {
    return {
      status: displayStatusFromDb(kw.tier),
      reason: kw.reason,
      dbStatus: kw.tier,
      suggestedScore: suggestedScoreFromDb(kw.tier),
    }
  }

  const ai = await classifyWithOpenAi(trimmed)
  if (ai != null) {
    return ai
  }

  return fromHeuristic(trimmed)
}
