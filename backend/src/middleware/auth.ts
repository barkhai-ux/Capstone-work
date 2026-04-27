import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { verifyJwt } from '../services/supabase.service.js';
import { sendError } from '../utils/response.js';

export interface UserContext {
  userId: string;
  email?: string;
  token: string;
  /** Active database id, taken from the `X-Database-Id` request header. May be unset
   *  for endpoints that operate on the whole account (e.g. listing databases). */
  databaseId?: string;
}

// Ambient user context — set by requireAuth, read by services that need to
// know which user is making the call (e.g. duckdb.service to pick the
// per-user database file).
export const userContext = new AsyncLocalStorage<UserContext>();

export function getCurrentUser(): UserContext {
  const ctx = userContext.getStore();
  if (!ctx) throw new Error('No authenticated user in context');
  return ctx;
}

export function getCurrentUserId(): string {
  return getCurrentUser().userId;
}

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) {
    sendError(res, 'Authentication required', 401);
    return;
  }

  const user = await verifyJwt(token);
  if (!user) {
    sendError(res, 'Invalid or expired session', 401);
    return;
  }

  req.user = user;
  const databaseHeader = req.headers['x-database-id'];
  const databaseId = typeof databaseHeader === 'string' && databaseHeader.length > 0
    ? databaseHeader
    : undefined;
  userContext.run({ userId: user.id, email: user.email, token, databaseId }, () => next());
}

export function getCurrentDatabaseId(): string | undefined {
  return userContext.getStore()?.databaseId;
}
