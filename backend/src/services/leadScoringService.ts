export type LeadScoreCategory = 'HOT' | 'WARM' | 'COLD'

export type LeadScoreResult = {
  score: number
  category: LeadScoreCategory
  llmSuggestion?: string
}

const POSITIVE_KEYWORDS = ['price', 'buy', 'urgent', 'quotation', 'quote', 'order', 'install', 'visit', 'deal']
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

export async function maybeSuggestLlmIntent(message: string): Promise<string | undefined> {
  const enabled = (process.env.AI_LEAD_SCORING_ENABLED ?? '').toLowerCase() === 'true'
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!enabled || !apiKey) return undefined

  const quickIntent = message.trim().length > 50 ? 'high_context_inquiry' : 'short_inquiry'
  return quickIntent
}
