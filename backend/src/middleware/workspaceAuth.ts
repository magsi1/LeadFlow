import type { NextFunction, Request, Response } from 'express';

import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabaseAdmin.js';

type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'sales';

export type WorkspaceAuthContext = {
  profileId: string;
  workspaceId: string;
  role: WorkspaceRole;
};

declare module 'express-serve-static-core' {
  interface Request {
    workspaceAuth?: WorkspaceAuthContext;
  }
}

export async function requireWorkspaceMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const workspaceId =
    req.header('x-workspace-id')?.trim() ??
    req.params.workspaceId?.trim() ??
    (req.body as { workspaceId?: string } | undefined)?.workspaceId?.trim() ??
    (req.query.workspaceId as string | undefined)?.trim();
  if (!workspaceId) {
    res.status(400).json({ ok: false, error: 'x-workspace-id_header_required' });
    return;
  }

  if (!env.enforceWorkspaceAuth) {
    const fallbackProfileId = req.header('x-profile-id')?.trim() ?? 'system';
    req.workspaceAuth = {
      profileId: fallbackProfileId,
      workspaceId,
      role: (req.header('x-workspace-role') as WorkspaceRole | null) ?? 'owner',
    };
    next();
    return;
  }

  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  if (!token) {
    res.status(401).json({ ok: false, error: 'bearer_token_required' });
    return;
  }

  const authResponse = await supabase.auth.getUser(token);
  const authUser = authResponse.data.user;
  if (!authUser) {
    res.status(401).json({ ok: false, error: 'invalid_auth_token' });
    return;
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, status')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', authUser.id)
    .maybeSingle();
  if (error || !data) {
    logger.warn('Workspace membership check failed', {
      profile_id: authUser.id,
      workspace_id: workspaceId,
      error: error?.message,
    });
    res.status(403).json({ ok: false, error: 'workspace_membership_required' });
    return;
  }
  if (data.status !== 'active') {
    res.status(403).json({ ok: false, error: 'workspace_membership_not_active' });
    return;
  }

  req.workspaceAuth = {
    profileId: authUser.id,
    workspaceId,
    role: (data.role as WorkspaceRole | undefined) ?? 'sales',
  };
  next();
}

export async function requireAuthenticatedProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!env.enforceWorkspaceAuth) {
    req.workspaceAuth = {
      profileId: req.header('x-profile-id')?.trim() ?? 'system',
      workspaceId: req.header('x-workspace-id')?.trim() ?? 'dev-workspace',
      role: (req.header('x-workspace-role') as WorkspaceRole | null) ?? 'owner',
    };
    next();
    return;
  }

  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  if (!token) {
    res.status(401).json({ ok: false, error: 'bearer_token_required' });
    return;
  }

  const authResponse = await supabase.auth.getUser(token);
  const authUser = authResponse.data.user;
  if (!authUser) {
    res.status(401).json({ ok: false, error: 'invalid_auth_token' });
    return;
  }

  req.workspaceAuth = {
    profileId: authUser.id,
    workspaceId: req.header('x-workspace-id')?.trim() ?? 'unknown',
    role: (req.header('x-workspace-role') as WorkspaceRole | null) ?? 'sales',
  };
  next();
}

export function requireWorkspaceRole(
  allowed: WorkspaceRole[],
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.workspaceAuth?.role;
    if (!role || !allowed.includes(role)) {
      res.status(403).json({ ok: false, error: 'insufficient_workspace_role' });
      return;
    }
    next();
  };
}
