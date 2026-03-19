import { Router } from 'express'

import { supabase } from '../lib/supabaseAdmin.js'

export const leadsRouter = Router()

function normalizeLeadStatus(statusRaw: string): string {
  const status = statusRaw.trim().toLowerCase()
  if (status === 'new') return 'new'
  if (status === 'contacted') return 'contacted'
  if (status === 'interested') return 'qualified'
  if (status === 'followup' || status === 'follow_up' || status === 'follow-up') return 'proposal_sent'
  if (status === 'won' || status === 'closed_won') return 'won'
  if (status === 'lost' || status === 'closed_lost') return 'lost'
  if (status === 'closed') return 'won'
  return status
}

leadsRouter.get('/', async (req, res) => {
  const workspaceId =
    req.header('x-workspace-id')?.trim() ??
    (req.query.workspaceId as string | undefined)?.trim()
  const assignedTo = (req.query.assigned_to as string | undefined)?.trim()
  const myLeads = (req.query.my_leads as string | undefined)?.trim().toLowerCase() === 'true'
  const requesterProfileId = req.header('x-profile-id')?.trim()

  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (workspaceId != null && workspaceId.trim().length > 0) {
    query = query.eq('workspace_id', workspaceId)
  }
  if (assignedTo != null && assignedTo.length > 0) {
    query = query.eq('assigned_to', assignedTo)
  }
  if (myLeads && requesterProfileId != null && requesterProfileId.length > 0) {
    query = query.eq('assigned_to', requesterProfileId)
  }

  const { data, error } = await query
  if (error) {
    res.status(500).json({ ok: false, error: `list_leads_failed:${error.message}` })
    return
  }

  res.status(200).json({
    ok: true,
    leads: data ?? [],
  })
})

leadsRouter.patch('/:id/status', async (req, res) => {
  const id = req.params.id?.trim()
  const statusRaw = (req.body as { status?: string } | undefined)?.status
  const status = statusRaw?.toString().trim()

  if (id == null || id.length === 0) {
    res.status(400).json({ ok: false, error: 'lead_id_required' })
    return
  }

  if (status == null || status.length === 0) {
    res.status(400).json({ ok: false, error: 'status_required' })
    return
  }

  const normalizedStatus = normalizeLeadStatus(status)

  const { data, error } = await supabase
    .from('leads')
    .update({ status: normalizedStatus })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    res.status(500).json({ ok: false, error: `update_lead_status_failed:${error.message}` })
    return
  }

  res.status(200).json({
    ok: true,
    lead: data,
  })
})

leadsRouter.patch('/:id/assign', async (req, res) => {
  const id = req.params.id?.trim()
  const assignedTo = (req.body as { assigned_to?: string; assignedTo?: string } | undefined)?.assigned_to ??
    (req.body as { assigned_to?: string; assignedTo?: string } | undefined)?.assignedTo

  if (id == null || id.length === 0) {
    res.status(400).json({ ok: false, error: 'lead_id_required' })
    return
  }
  if (assignedTo == null || assignedTo.trim().length === 0) {
    res.status(400).json({ ok: false, error: 'assigned_to_required' })
    return
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ assigned_to: assignedTo.trim() })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    res.status(500).json({ ok: false, error: `assign_lead_failed:${error.message}` })
    return
  }

  res.status(200).json({
    ok: true,
    lead: data,
  })
})

leadsRouter.patch('/:id/deal', async (req, res) => {
  const id = req.params.id?.trim()
  const body = (req.body as { deal_value?: number; dealValue?: number; deal_status?: string; dealStatus?: string } | undefined) ?? {}
  const dealValueRaw = body.deal_value ?? body.dealValue
  const dealStatusRaw = body.deal_status ?? body.dealStatus

  if (id == null || id.length === 0) {
    res.status(400).json({ ok: false, error: 'lead_id_required' })
    return
  }

  const patch: Record<string, unknown> = {}
  if (dealValueRaw != null) {
    patch.deal_value = Number(dealValueRaw) || 0
  }
  if (dealStatusRaw != null && dealStatusRaw.trim().length > 0) {
    patch.deal_status = dealStatusRaw.trim().toLowerCase()
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ ok: false, error: 'deal_patch_required' })
    return
  }

  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    res.status(500).json({ ok: false, error: `update_lead_deal_failed:${error.message}` })
    return
  }

  res.status(200).json({
    ok: true,
    lead: data,
  })
})
