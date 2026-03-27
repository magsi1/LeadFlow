import { Router, type NextFunction, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'

import { supabase } from '../lib/supabaseAdmin.js'

export const leadsRouter = Router()

const LEAD_STATUSES = ['new', 'contacted', 'closed'] as const
type LeadStatus = (typeof LEAD_STATUSES)[number]

function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value)
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

function sendError(res: Response, status: number, error: string): void {
  console.log('[leads-api:error]', { status, error })
  res.status(status).json({ ok: false, error })
}

function sendSuccess(res: Response, status: number, data: unknown): void {
  res.status(status).json({ ok: true, data })
}

function resolveUserId(req: Request): string {
  const body = (req.body as { user_id?: unknown; userId?: unknown } | undefined) ?? {}
  return (
    cleanString(req.header('x-user-id')) ||
    cleanString(req.query.user_id) ||
    cleanString(req.query.userId) ||
    cleanString(body.user_id) ||
    cleanString(body.userId)
  )
}

function requireUserId(req: Request, res: Response, next: NextFunction): void {
  const userId = resolveUserId(req)
  if (userId.length === 0) {
    sendError(res, 400, 'user_id_required')
    return
  }
  res.locals.userId = userId
  next()
}

function getRequiredUserId(res: Response): string {
  return (res.locals.userId as string) ?? ''
}

function validateNamePhoneStatus(name: string, phone: string, status: string | undefined): string | null {
  if (name.length === 0) return 'name_required'
  if (phone.length === 0) return 'phone_required'
  if (status != null && !isLeadStatus(status)) return 'invalid_status'
  return null
}

leadsRouter.use(requireUserId)

leadsRouter.get('/', async (req, res) => {
  const userId = getRequiredUserId(res)

  const status = cleanString(req.query.status).toLowerCase()
  const search = cleanString(req.query.search)
  const page = parsePositiveInt(req.query.page, 1)
  const limit = Math.min(parsePositiveInt(req.query.limit, 10), 100)
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('leads')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status.length > 0) {
    if (!isLeadStatus(status)) {
      sendError(res, 400, 'invalid_status')
      return
    }
    query = query.eq('status', status)
  }

  if (search.length > 0) {
    const escapedSearch = search.replace(/,/g, ' ')
    query = query.or(`name.ilike.%${escapedSearch}%,phone.ilike.%${escapedSearch}%`)
  }

  const { data, error } = await query
  if (error) {
    sendError(res, 500, `fetch_leads_failed:${error.message}`)
    return
  }

  sendSuccess(res, 200, data ?? [])
})

leadsRouter.post('/', async (req, res) => {
  const userId = getRequiredUserId(res)

  const body = (req.body as { name?: unknown; phone?: unknown; status?: unknown } | undefined) ?? {}
  const name = cleanString(body.name)
  const phone = cleanString(body.phone)
  const rawStatus = cleanString(body.status).toLowerCase()
  const status = rawStatus.length > 0 ? rawStatus : 'new'

  const validationError = validateNamePhoneStatus(name, phone, status)
  if (validationError != null) {
    sendError(res, 400, validationError)
    return
  }

  const payload = {
    id: randomUUID(),
    user_id: userId,
    name,
    phone,
    status,
    created_at: new Date().toISOString(),
  }

  const { data, error } = await supabase.from('leads').insert([payload]).select('*').single()
  if (error) {
    sendError(res, 500, `create_lead_failed:${error.message}`)
    return
  }

  sendSuccess(res, 201, data)
})

leadsRouter.put('/:id', async (req, res) => {
  const id = cleanString(req.params.id)
  const userId = getRequiredUserId(res)
  if (id.length === 0) {
    sendError(res, 400, 'lead_id_required')
    return
  }

  const body = (req.body as { name?: unknown; phone?: unknown; status?: unknown } | undefined) ?? {}
  const patch: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = cleanString(body.name)
    if (name.length === 0) {
      sendError(res, 400, 'name_required')
      return
    }
    patch.name = name
  }

  if (body.phone !== undefined) {
    const phone = cleanString(body.phone)
    if (phone.length === 0) {
      sendError(res, 400, 'phone_required')
      return
    }
    patch.phone = phone
  }

  if (body.status !== undefined) {
    const status = cleanString(body.status).toLowerCase()
    if (!isLeadStatus(status)) {
      sendError(res, 400, 'invalid_status')
      return
    }
    patch.status = status
  }

  if (Object.keys(patch).length === 0) {
    sendError(res, 400, 'update_payload_required')
    return
  }

  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) {
    sendError(res, 500, `update_lead_failed:${error.message}`)
    return
  }

  sendSuccess(res, 200, data)
})

leadsRouter.delete('/:id', async (req, res) => {
  const id = cleanString(req.params.id)
  const userId = getRequiredUserId(res)
  if (id.length === 0) {
    sendError(res, 400, 'lead_id_required')
    return
  }

  const { data, error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .single()

  if (error) {
    sendError(res, 500, `delete_lead_failed:${error.message}`)
    return
  }

  sendSuccess(res, 200, { deleted: true, id: data?.id ?? id })
})

// Compatibility routes used by existing clients.
leadsRouter.patch('/:id/status', async (req, res) => {
  const id = cleanString(req.params.id)
  const userId = getRequiredUserId(res)
  const status = cleanString((req.body as { status?: string } | undefined)?.status).toLowerCase()

  if (id.length === 0) {
    sendError(res, 400, 'lead_id_required')
    return
  }
  if (!isLeadStatus(status)) {
    sendError(res, 400, 'invalid_status')
    return
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) {
    sendError(res, 500, `update_lead_status_failed:${error.message}`)
    return
  }

  sendSuccess(res, 200, data)
})

leadsRouter.patch('/:id/assign', async (req, res) => {
  const id = cleanString(req.params.id)
  const userId = getRequiredUserId(res)
  const assignedTo =
    cleanString((req.body as { assigned_to?: string; assignedTo?: string } | undefined)?.assigned_to) ||
    cleanString((req.body as { assigned_to?: string; assignedTo?: string } | undefined)?.assignedTo)

  if (id.length === 0) {
    sendError(res, 400, 'lead_id_required')
    return
  }
  if (assignedTo.length === 0) {
    sendError(res, 400, 'assigned_to_required')
    return
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ assigned_to: assignedTo })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) {
    sendError(res, 500, `assign_lead_failed:${error.message}`)
    return
  }

  sendSuccess(res, 200, data)
})

leadsRouter.patch('/:id/deal', async (req, res) => {
  const id = cleanString(req.params.id)
  const userId = getRequiredUserId(res)
  const body =
    (req.body as { deal_value?: number; dealValue?: number; deal_status?: string; dealStatus?: string } | undefined) ??
    {}
  const dealValueRaw = body.deal_value ?? body.dealValue
  const dealStatusRaw = cleanString(body.deal_status ?? body.dealStatus).toLowerCase()

  if (id.length === 0) {
    sendError(res, 400, 'lead_id_required')
    return
  }
  const patch: Record<string, unknown> = {}
  if (dealValueRaw != null) patch.deal_value = Number(dealValueRaw) || 0
  if (dealStatusRaw.length > 0) patch.deal_status = dealStatusRaw
  if (Object.keys(patch).length === 0) {
    sendError(res, 400, 'deal_patch_required')
    return
  }

  const { data, error } = await supabase
    .from('leads')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) {
    sendError(res, 500, `update_lead_deal_failed:${error.message}`)
    return
  }

  sendSuccess(res, 200, data)
})

