import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendCreated, sendBadRequest, sendNotFound } from '../utils/response.js';
import { supabaseAdmin } from '../services/supabase.service.js';
import { getCurrentUserId } from '../middleware/auth.js';

const dashboardWriteSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  widgets: z.array(z.unknown()).default([]),
  layouts: z.record(z.unknown()).default({}),
});

const dashboardIdParam = z.object({ dashboardId: z.string().uuid() });

export const listDashboards = asyncHandler(async (_req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const { data, error } = await supabaseAdmin
    .from('dashboards')
    .select('id, name, widgets, layouts, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return sendBadRequest(res, error.message);
  return sendSuccess(res, { dashboards: data ?? [] });
});

export const createDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const parsed = dashboardWriteSchema.safeParse(req.body);
  if (!parsed.success) return sendBadRequest(res, parsed.error.message);

  const insert = {
    user_id: userId,
    name: parsed.data.name,
    widgets: parsed.data.widgets,
    layouts: parsed.data.layouts,
    ...(parsed.data.id ? { id: parsed.data.id } : {}),
  };

  const { data, error } = await supabaseAdmin
    .from('dashboards')
    .insert(insert)
    .select('id, name, widgets, layouts, created_at, updated_at')
    .single();

  if (error) return sendBadRequest(res, error.message);
  return sendCreated(res, { dashboard: data });
});

export const updateDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const params = dashboardIdParam.safeParse(req.params);
  if (!params.success) return sendBadRequest(res, params.error.message);

  const parsed = dashboardWriteSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendBadRequest(res, parsed.error.message);

  const { data, error } = await supabaseAdmin
    .from('dashboards')
    .update({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.widgets !== undefined ? { widgets: parsed.data.widgets } : {}),
      ...(parsed.data.layouts !== undefined ? { layouts: parsed.data.layouts } : {}),
    })
    .eq('user_id', userId)
    .eq('id', params.data.dashboardId)
    .select('id, name, widgets, layouts, created_at, updated_at')
    .single();

  if (error) return sendBadRequest(res, error.message);
  if (!data) return sendNotFound(res, 'Dashboard not found');
  return sendSuccess(res, { dashboard: data });
});

export const deleteDashboard = asyncHandler(async (req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const params = dashboardIdParam.safeParse(req.params);
  if (!params.success) return sendBadRequest(res, params.error.message);

  const { error } = await supabaseAdmin
    .from('dashboards')
    .delete()
    .eq('user_id', userId)
    .eq('id', params.data.dashboardId);

  if (error) return sendBadRequest(res, error.message);
  return sendSuccess(res, { deleted: true });
});
