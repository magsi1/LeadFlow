import type { Request, Response } from 'express'

import { supabase } from '../lib/supabaseAdmin.js'
import { maybeSuggestLlmIntent, scoreLeadMessage } from '../services/leadScoringService.js'
import { sendWhatsAppReply } from '../services/whatsappReplyService.js'

const WHATSAPP_VERIFY_TOKEN = 'leadflow123'

export function verifyWhatsAppWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode']?.toString()
  const token = req.query['hub.verify_token']?.toString()
  const challenge = req.query['hub.challenge']?.toString()
  console.log('QUERY:', req.query)

  // Temporary reachability check for manual browser hits.
  if (challenge == null || challenge.length === 0) {
    res.status(200).send('OK')
    return
  }

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verification success')
    res.status(200).send(challenge)
    return
  }

  console.warn('WhatsApp webhook verification failed', {
    mode,
    token,
  })
  res.sendStatus(403)
}

export async function handleWhatsAppWebhook(req: Request, res: Response): Promise<void> {
  try {
    const data = (req.body as Record<string, unknown> | null) ?? {}
    const messageNode = ((req.body as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) as
      | Record<string, unknown>
      | undefined
    const contactNode = ((req.body as any)?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]) as
      | Record<string, unknown>
      | undefined

    const fallbackMessageNode =
      (data['whatsappMessage'] as Record<string, unknown> | undefined) ??
      (data['whatsapp_message'] as Record<string, unknown> | undefined)

    const name =
      ((contactNode?.['profile'] as Record<string, unknown> | undefined)?.['name'])?.toString() ??
      contactNode?.['wa_id']?.toString() ??
      fallbackMessageNode?.['senderName']?.toString() ??
      fallbackMessageNode?.['sender_name']?.toString() ??
      data['senderName']?.toString() ??
      data['sender_name']?.toString() ??
      data['name']?.toString()
    const phone =
      messageNode?.['from']?.toString() ??
      fallbackMessageNode?.['from']?.toString() ??
      fallbackMessageNode?.['waId']?.toString() ??
      fallbackMessageNode?.['wa_id']?.toString() ??
      data['from']?.toString() ??
      data['waId']?.toString() ??
      data['wa_id']?.toString() ??
      data['phone']?.toString()
    const message =
      ((messageNode?.['text'] as Record<string, unknown> | undefined)?.['body'])?.toString() ??
      messageNode?.['text']?.toString() ??
      fallbackMessageNode?.['text']?.toString() ??
      data['text']?.toString() ??
      data['message']?.toString()

    if (phone == null || phone.trim().length === 0 || message == null || message.trim().length === 0) {
      console.log('WhatsApp webhook received without message payload; ignored')
      res.status(200).json({ success: true, ignored: true })
      return
    }

    const cleanPhone = phone.trim()
    const cleanMessage = message.trim()
    console.log('Incoming message:', cleanPhone, cleanMessage)
    const normalizedName = name?.trim() ?? ''

    const scoring = scoreLeadMessage(cleanMessage)
    const llmSuggestion = await maybeSuggestLlmIntent(cleanMessage)
    const { error } = await supabase.from('leads').insert({
      name: normalizedName.length > 0 ? normalizedName : 'Unknown',
      phone: cleanPhone,
      source: 'WHATSAPP',
      message: cleanMessage,
      intent: 'HOT',
      status: 'new',
      score: scoring.score,
      score_category: scoring.category,
      deal_status: 'open',
      deal_value: 0,
      notes: llmSuggestion ? `LLM intent hint: ${llmSuggestion}` : undefined,
    })

    if (error) {
      console.error('Failed to save incoming lead:', error.message)
      res.status(500).json({ success: false, error: error.message })
      return
    }

    await sendWhatsAppReply(cleanPhone, 'Thanks for contacting LeadFlow. We will respond shortly.')

    console.log('Real WhatsApp lead received:', normalizedName.length > 0 ? normalizedName : 'Unknown', cleanPhone)
    console.log('Incoming lead saved')
    res.sendStatus(200)
  } catch (err) {
    console.error('Webhook handler error:', err)
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
