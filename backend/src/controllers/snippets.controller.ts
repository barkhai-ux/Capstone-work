import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendCreated, sendBadRequest, sendNotFound } from '../utils/response.js';
import { supabaseAdmin } from '../services/supabase.service.js';
import { getCurrentUserId } from '../middleware/auth.js';
import { saveSnippetSchema, snippetIdSchema } from '../services/validation.service.js';
import logger from '../utils/logger.js';

export const listSnippets = asyncHandler(async (_req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const { data, error } = await supabaseAdmin
    .from('snippets')
    .select('id, name, question, row_count, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return sendBadRequest(res, error.message);

  return sendSuccess(res, {
    snippets: (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      question: s.question,
      rowCount: Number(s.row_count),
      createdAt: String(s.created_at),
    })),
  });
});

export const getSnippet = asyncHandler(async (req: Request, res: Response) => {
  const validation = snippetIdSchema.safeParse(req.params);
  if (!validation.success) return sendBadRequest(res, validation.error.message);

  const userId = getCurrentUserId();
  const { data, error } = await supabaseAdmin
    .from('snippets')
    .select('id, name, question, columns, rows, row_count, created_at')
    .eq('user_id', userId)
    .eq('id', validation.data.snippetId)
    .maybeSingle();

  if (error) return sendBadRequest(res, error.message);
  if (!data) return sendNotFound(res);

  return sendSuccess(res, {
    id: data.id,
    name: data.name,
    question: data.question,
    columns: data.columns,
    rows: data.rows,
    rowCount: Number(data.row_count),
    createdAt: String(data.created_at),
  });
});

export const saveSnippet = asyncHandler(async (req: Request, res: Response) => {
  const validation = saveSnippetSchema.safeParse(req.body);
  if (!validation.success) return sendBadRequest(res, validation.error.message);

  const { name, question, columns, rows } = validation.data;
  const userId = getCurrentUserId();

  const { data, error } = await supabaseAdmin
    .from('snippets')
    .insert({
      user_id: userId,
      name,
      question,
      columns,
      rows,
      row_count: rows.length,
    })
    .select('id, name, row_count')
    .single();

  if (error) return sendBadRequest(res, error.message);

  logger.info(`Saved snippet: "${name}" (${rows.length} rows)`);
  return sendCreated(res, { id: data.id, name: data.name, rowCount: Number(data.row_count) });
});

export const deleteSnippet = asyncHandler(async (req: Request, res: Response) => {
  const validation = snippetIdSchema.safeParse(req.params);
  if (!validation.success) return sendBadRequest(res, validation.error.message);

  const userId = getCurrentUserId();
  const { error } = await supabaseAdmin
    .from('snippets')
    .delete()
    .eq('user_id', userId)
    .eq('id', validation.data.snippetId);

  if (error) return sendBadRequest(res, error.message);

  logger.info(`Deleted snippet: ${validation.data.snippetId}`);
  return sendSuccess(res, { deleted: true });
});
