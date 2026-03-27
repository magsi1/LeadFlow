import type { Request, Response } from 'express'

import { supabase } from '../lib/supabaseAdmin.js'
import { generateAiSalesReply, getFallbackReply } from '../services/aiReplyService.js'
import { classifyLeadIntent } from '../services/leadScoringService.js'
import { notifyN8nLeadTemperatureAutomation } from '../services/n8nLeadTemperatureService.js'
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

    const requestedUserId =
      data['user_id']?.toString()?.trim() ??
      data['userId']?.toString()?.trim() ??
      undefined

    const { data: existingLead, error: existingLeadError } = await supabase
      .from('leads')
      .select('id, user_id, auto_reply')
      .eq('phone', cleanPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingLeadError != null) {
      console.error('Failed to query lead by phone:', existingLeadError.message)
      res.status(500).json({ success: false, error: existingLeadError.message })
      return
    }

    let leadId = existingLead?.id?.toString() ?? ''
    let userId = existingLead?.user_id?.toString() ?? ''
    let autoReplyEnabled = existingLead?.auto_reply == null ? true : Boolean(existingLead?.auto_reply)

    if ((leadId.length === 0 || userId.length === 0) && (requestedUserId == null || requestedUserId.length === 0)) {
      console.warn('Incoming WhatsApp message has no matching lead and no user_id provided; skipped')
      res.status(200).json({ success: true, ignored: true, reason: 'lead_not_found' })
      return
    }

    const classification = await classifyLeadIntent(cleanMessage)
    console.log('[whatsapp] lead intent', {
      phone: cleanPhone,
      status: classification.status,
      reason: classification.reason,
    })

    if (leadId.length === 0 || userId.length === 0) {
      const { data: createdLead, error: createLeadError } = await supabase
        .from('leads')
        .insert({
          user_id: requestedUserId,
          assigned_to: requestedUserId,
          name: normalizedName.length > 0 ? normalizedName : 'Unknown',
          phone: cleanPhone,
          message: cleanMessage,
          status: classification.dbStatus,
          score: classification.suggestedScore,
          stage: 'new',
          priority: 'new',
          auto_reply: true,
        })
        .select('id, user_id, auto_reply')
        .single()

      if (createLeadError != null || createdLead == null) {
        console.error('Failed to create lead for inbound message:', createLeadError?.message)
        res.status(500).json({ success: false, error: createLeadError?.message ?? 'create_lead_failed' })
        return
      }

      leadId = createdLead.id?.toString() ?? ''
      userId = createdLead.user_id?.toString() ?? ''
      autoReplyEnabled = createdLead.auto_reply == null ? true : Boolean(createdLead.auto_reply)
    } else {
      const { error: leadUpdateError } = await supabase
        .from('leads')
        .update({
          message: cleanMessage,
          status: classification.dbStatus,
          score: classification.suggestedScore,
        })
        .eq('id', leadId)

      if (leadUpdateError != null) {
        console.error('Failed to update lead intent:', leadUpdateError.message)
      }
    }

    notifyN8nLeadTemperatureAutomation({
      phone: cleanPhone.replace(/\D/g, ''),
      name: normalizedName.length > 0 ? normalizedName : 'Unknown',
      lead_id: leadId,
      user_id: userId,
      status: classification.status,
      message: cleanMessage,
      reason: classification.reason,
    })

    const { error: inboundError } = await supabase.from('messages').insert({
      user_id: userId,
      lead_id: leadId,
      phone: cleanPhone,
      message: cleanMessage,
      is_from_customer: true,
    })

    if (inboundError != null) {
      console.error('Failed to save inbound message:', inboundError.message)
      res.status(500).json({ success: false, error: inboundError.message })
      return
    }

    if (!autoReplyEnabled) {
      res.status(200).json({
        success: true,
        auto_reply: false,
        status: classification.status,
        reason: classification.reason,
      })
      return
    }

    let reply = getFallbackReply()
    try {
      reply = await generateAiSalesReply(cleanMessage)
    } catch (aiError) {
      console.error('AI reply failed; using fallback:', aiError)
    }

    await sendWhatsAppReply(cleanPhone, reply)

    const { error: outboundError } = await supabase.from('messages').insert({
      user_id: userId,
      lead_id: leadId,
      phone: cleanPhone,
      message: reply,
      is_from_customer: false,
    })

    if (outboundError != null) {
      console.error('Failed to save outbound message:', outboundError.message)
    }

    res.status(200).json({
      success: true,
      status: classification.status,
      reason: classification.reason,
    })
  } catch (err) {
    console.error('Webhook handler error:', err)
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
