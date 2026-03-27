import type { Request, Response } from 'express'

import { supabase } from '../lib/supabaseAdmin.js'
import { classifyLeadIntent } from '../services/leadScoringService.js'
import { notifyN8nLeadTemperatureAutomation } from '../services/n8nLeadTemperatureService.js'

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * POST /webhooks/lead — ingest lead from external automation (e.g. n8n).
 * Body: { name?, phone, message, user_id | userId }
 * Optional header: x-webhook-secret (must match LEAD_WEBHOOK_SECRET when set).
 * Response: { status, reason, lead_id }
 */
export async function handleLeadIntakeWebhook(req: Request, res: Response): Promise<void> {
  try {
    const secret = process.env.LEAD_WEBHOOK_SECRET?.trim()
    if (secret != null && secret.length > 0) {
      const got = clean(req.headers['x-webhook-secret'])
      if (got !== secret) {
        res.status(401).json({ ok: false, error: 'unauthorized' })
        return
      }
    }

    const body = (req.body as Record<string, unknown> | null) ?? {}
    const userId = clean(body.user_id ?? body.userId)
    const name = clean(body.name)
    const phone = clean(body.phone)
    const message = clean(body.message)

    if (userId.length === 0 || phone.length === 0 || message.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'user_id, phone, and message are required',
      })
      return
    }

    const classification = await classifyLeadIntent(message)

    const { data, error } = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        assigned_to: userId,
        name: name.length > 0 ? name : 'Unknown',
        phone,
        message,
        status: classification.dbStatus,
        score: classification.suggestedScore,
        stage: 'new',
        priority: 'new',
      })
      .select('id')
      .single()

    if (error != null) {
      console.error('[lead-intake] insert failed', error.message)
      res.status(500).json({ ok: false, error: error.message })
      return
    }

    const leadId = data?.id?.toString() ?? ''
    if (leadId.length > 0) {
      notifyN8nLeadTemperatureAutomation({
        phone: phone.replace(/\D/g, ''),
        name: name.length > 0 ? name : 'Unknown',
        lead_id: leadId,
        user_id: userId,
        status: classification.status,
        message,
        reason: classification.reason,
      })
    }

    const payload = {
      status: classification.status,
      reason: classification.reason,
      lead_id: data?.id ?? null,
    }
    console.log('[lead-intake] classified', payload)

    res.status(200).json(payload)
  } catch (e) {
    console.error('[lead-intake]', e)
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
