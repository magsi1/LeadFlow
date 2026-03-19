import { Router } from 'express'

import { requirePlanAccess } from '../middleware/subscriptionPlan.js'
import { supabase } from '../lib/supabaseAdmin.js'

export const analyticsRouter = Router()

analyticsRouter.get('/summary', requirePlanAccess(['pro', 'agency']), async (_req, res) => {
  const startOfTodayUtc = new Date()
  startOfTodayUtc.setUTCHours(0, 0, 0, 0)
  const startOfTomorrowUtc = new Date(startOfTodayUtc.getTime() + 24 * 60 * 60 * 1000)

  const [{ count: totalLeads, error: totalError }, { count: hotLeads, error: hotError }, { count: closedLeads, error: closedError }, { count: todayLeads, error: todayError }, { data: wonRevenueRows, error: revenueError }, { count: wonDeals, error: wonDealsError }] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }).or('intent.eq.HOT,score_category.eq.HOT,status.eq.contacted'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).or('status.eq.CLOSED,status.eq.closed,status.eq.won'),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfTodayUtc.toISOString())
      .lt('created_at', startOfTomorrowUtc.toISOString()),
    supabase.from('leads').select('deal_value').eq('deal_status', 'won'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('deal_status', 'won'),
  ])

  const firstError = totalError ?? hotError ?? closedError ?? todayError ?? revenueError ?? wonDealsError
  if (firstError) {
    res.status(500).json({ ok: false, error: `analytics_summary_failed:${firstError.message}` })
    return
  }

  const totalRevenue = (wonRevenueRows ?? []).reduce((sum, row) => {
    const value = Number((row as Record<string, unknown>)['deal_value'] ?? 0)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)
  const normalizedTotalLeads = totalLeads ?? 0
  const normalizedWonDeals = wonDeals ?? 0
  const conversionPercentage = normalizedTotalLeads === 0 ? 0 : (normalizedWonDeals / normalizedTotalLeads) * 100

  res.status(200).json({
    totalLeads: totalLeads ?? 0,
    hotLeads: hotLeads ?? 0,
    closedLeads: closedLeads ?? 0,
    todayLeads: todayLeads ?? 0,
    wonDeals: normalizedWonDeals,
    totalRevenue,
    conversionPercentage: Number(conversionPercentage.toFixed(2)),
  })
})
