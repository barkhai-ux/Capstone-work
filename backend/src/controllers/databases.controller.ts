import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendCreated, sendBadRequest, sendNotFound } from '../utils/response.js';
import { supabaseAdmin } from '../services/supabase.service.js';
import { getCurrentUserId } from '../middleware/auth.js';
import { duckdbService } from '../services/duckdb.service.js';
import logger from '../utils/logger.js';

const idParam = z.object({ databaseId: z.string().uuid() });
const writeSchema = z.object({ name: z.string().min(1).max(120).trim() });

/** Get-or-create the user's first database. Used at sign-in time so the UI is
 *  never empty. */
export async function ensureDefaultDatabase(userId: string): Promise<{ id: string; name: string }> {
  const { data: existing } = await supabaseAdmin
    .from('databases')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as { id: string; name: string };

  const { data, error } = await supabaseAdmin
    .from('databases')
    .insert({ user_id: userId, name: 'My Database' })
    .select('id, name')
    .single();

  if (error || !data) throw new Error(`Failed to create default database: ${error?.message ?? 'unknown'}`);
  return data;
}

export const listDatabases = asyncHandler(async (_req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const def = await ensureDefaultDatabase(userId);

  const { data, error } = await supabaseAdmin
    .from('databases')
    .select('id, name, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return sendBadRequest(res, error.message);

  return sendSuccess(res, {
    databases: data ?? [],
    defaultDatabaseId: def.id,
  });
});

export const createDatabase = asyncHandler(async (req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const parsed = writeSchema.safeParse(req.body);
  if (!parsed.success) return sendBadRequest(res, parsed.error.message);

  const { data, error } = await supabaseAdmin
    .from('databases')
    .insert({ user_id: userId, name: parsed.data.name })
    .select('id, name, created_at, updated_at')
    .single();

  if (error) {
    // Friendlier message for the unique-name constraint.
    if ((error as { code?: string }).code === '23505') {
      return sendBadRequest(res, `A database named "${parsed.data.name}" already exists.`);
    }
    return sendBadRequest(res, error.message);
  }

  return sendCreated(res, { database: data });
});

export const renameDatabase = asyncHandler(async (req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const params = idParam.safeParse(req.params);
  if (!params.success) return sendBadRequest(res, params.error.message);
  const parsed = writeSchema.safeParse(req.body);
  if (!parsed.success) return sendBadRequest(res, parsed.error.message);

  const { data, error } = await supabaseAdmin
    .from('databases')
    .update({ name: parsed.data.name })
    .eq('user_id', userId)
    .eq('id', params.data.databaseId)
    .select('id, name, created_at, updated_at')
    .single();

  if (error) return sendBadRequest(res, error.message);
  if (!data) return sendNotFound(res, 'Database not found');
  return sendSuccess(res, { database: data });
});

export const deleteDatabase = asyncHandler(async (req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const params = idParam.safeParse(req.params);
  if (!params.success) return sendBadRequest(res, params.error.message);

  const databaseId = params.data.databaseId;

  // Refuse to delete the user's last database — the UI assumes at least one.
  const { count } = await supabaseAdmin
    .from('databases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if ((count ?? 0) <= 1) {
    return sendBadRequest(res, 'You must have at least one database. Rename this one instead.');
  }

  // Drop physical DuckDB tables + their metadata rows.
  await duckdbService.deleteTablesForDatabase(databaseId).catch((e) => {
    logger.warn(`Failed to drop DuckDB tables for database ${databaseId}: ${(e as Error).message}`);
  });

  // Cascade delete user_tables (ON DELETE CASCADE) + storage objects beneath them.
  const { data: storagePaths } = await supabaseAdmin
    .from('user_tables')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('database_id', databaseId);

  const paths = (storagePaths ?? [])
    .map((r) => r.storage_path as string | null)
    .filter((p): p is string => !!p);
  if (paths.length > 0) {
    await supabaseAdmin.storage.from('user-files').remove(paths);
  }

  const { error } = await supabaseAdmin
    .from('databases')
    .delete()
    .eq('user_id', userId)
    .eq('id', databaseId);
  if (error) return sendBadRequest(res, error.message);

  return sendSuccess(res, { deleted: true });
});
