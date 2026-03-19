import type { NextFunction, Request, Response } from 'express'

import { supabase } from '../lib/supabaseAdmin.js'

type SubscriptionPlan = 'basic' | 'pro' | 'agency'

type SubscriptionUser = {
  email: string
  plan: SubscriptionPlan
  is_active: boolean
}

declare module 'express-serve-static-core' {
  interface Request {
    subscriptionUser?: SubscriptionUser
  }
}

async function readSubscriptionUser(req: Request): Promise<SubscriptionUser | null> {
  const email =
    req.header('x-user-email')?.trim().toLowerCase() ??
    (req.query.email as string | undefined)?.trim().toLowerCase() ??
    (req.body as { email?: string } | undefined)?.email?.trim().toLowerCase()

  if (email != null && email.length > 0) {
    const { data, error } = await supabase
      .from('users')
      .select('email, plan, is_active')
      .eq('email', email)
      .maybeSingle()
    if (error || !data) return null
    return data as SubscriptionUser
  }

  const { data, error } = await supabase
    .from('users')
    .select('email, plan, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data as SubscriptionUser
}

export function requirePlanAccess(
  allowedPlans: SubscriptionPlan[],
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = await readSubscriptionUser(req)
    if (!user) {
      res.status(403).json({ ok: false, error: 'subscription_required' })
      return
    }
    if (!user.is_active) {
      res.status(403).json({ ok: false, error: 'subscription_inactive' })
      return
    }
    if (!allowedPlans.includes(user.plan)) {
      res.status(403).json({
        ok: false,
        error: 'plan_upgrade_required',
        currentPlan: user.plan,
        allowedPlans,
      })
      return
    }

    req.subscriptionUser = user
    next()
  }
}
