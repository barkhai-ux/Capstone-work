import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { asyncHandler } from '../middleware/error-handler.js';
import {
  sendSuccess,
  sendCreated,
  sendBadRequest,
  sendNotFound,
} from '../utils/response.js';
import { supabaseAdmin } from '../services/supabase.service.js';
import {
  getCurrentUser,
  getCurrentUserId,
  userContext,
} from '../middleware/auth.js';
import { duckdbService } from '../services/duckdb.service.js';
import { runChartDataQuery } from './chart.controller.js';
import logger from '../utils/logger.js';

const dashboardIdParam = z.object({ dashboardId: z.string().uuid() });
const tokenParam = z.object({ token: z.string().min(20).max(80) });
const widgetIdBody = z.object({ widgetId: z.string().min(1) });

function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

interface SharedWidget {
  id?: string;
  widgetType?: string;
  tableId?: string;
  tableIds?: string[];
  labelTableId?: string;
  labelColumn?: string;
  valueColumn?: string;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  topN?: number;
  dateGrouping?: 'none' | 'yearly' | 'quarterly' | 'monthly';
  chartType?: string;
}

// ── Auth-gated endpoints ──

export const getDashboardShare = asyncHandler(async (req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const params = dashboardIdParam.safeParse(req.params);
  if (!params.success) return sendBadRequest(res, params.error.message);

  const { data: dash } = await supabaseAdmin
    .from('dashboards')
    .select('id')
    .eq('id', params.data.dashboardId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!dash) return sendNotFound(res, 'Dashboard not found');

  const { data } = await supabaseAdmin
    .from('dashboard_shares')
    .select('token, created_at')
    .eq('dashboard_id', params.data.dashboardId)
    .eq('owner_user_id', userId)
    .maybeSingle();
  return sendSuccess(res, { share: data ?? null });
});

export const createDashboardShare = asyncHandler(async (req: Request, res: Response) => {
  const ctx = getCurrentUser();
  const params = dashboardIdParam.safeParse(req.params);
  if (!params.success) return sendBadRequest(res, params.error.message);
  if (!ctx.databaseId) return sendBadRequest(res, 'X-Database-Id header required');

  const { data: dash } = await supabaseAdmin
    .from('dashboards')
    .select('id')
    .eq('id', params.data.dashboardId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (!dash) return sendNotFound(res, 'Dashboard not found');

  const token = generateToken();

  // One share per dashboard. Re-issuing rotates the token.
  const { data, error } = await supabaseAdmin
    .from('dashboard_shares')
    .upsert(
      {
        dashboard_id: params.data.dashboardId,
        owner_user_id: ctx.userId,
        owner_database_id: ctx.databaseId,
        token,
      },
      { onConflict: 'dashboard_id' }
    )
    .select('token, created_at')
    .single();
  if (error) return sendBadRequest(res, error.message);

  return sendCreated(res, { share: data });
});

export const revokeDashboardShare = asyncHandler(async (req: Request, res: Response) => {
  const userId = getCurrentUserId();
  const params = dashboardIdParam.safeParse(req.params);
  if (!params.success) return sendBadRequest(res, params.error.message);

  const { error } = await supabaseAdmin
    .from('dashboard_shares')
    .delete()
    .eq('dashboard_id', params.data.dashboardId)
    .eq('owner_user_id', userId);
  if (error) return sendBadRequest(res, error.message);
  return sendSuccess(res, { revoked: true });
});

// ── Public endpoints ──

interface ShareRow {
  dashboard_id: string;
  owner_user_id: string;
  owner_database_id: string;
}

async function lookupShare(token: string): Promise<ShareRow | null> {
  const { data } = await supabaseAdmin
    .from('dashboard_shares')
    .select('dashboard_id, owner_user_id, owner_database_id')
    .eq('token', token)
    .maybeSingle();
  return data as ShareRow | null;
}

interface DashboardRow {
  id: string;
  name: string;
  widgets: SharedWidget[];
  layouts: Record<string, unknown>;
}

async function lookupDashboard(dashboardId: string): Promise<DashboardRow | null> {
  const { data } = await supabaseAdmin
    .from('dashboards')
    .select('id, name, widgets, layouts')
    .eq('id', dashboardId)
    .maybeSingle();
  return data as DashboardRow | null;
}

export const getPublicSharedDashboard = asyncHandler(async (req: Request, res: Response) => {
  const params = tokenParam.safeParse(req.params);
  if (!params.success) return sendNotFound(res, 'Share not found');

  const share = await lookupShare(params.data.token);
  if (!share) return sendNotFound(res, 'Share not found');

  const dash = await lookupDashboard(share.dashboard_id);
  if (!dash) return sendNotFound(res, 'Dashboard not found');

  // Strip table widgets — shared view is "interactive charts and textbox" only.
  const widgets = (dash.widgets ?? []).filter(
    (w) => w?.widgetType === 'chart' || w?.widgetType === 'text'
  );

  return sendSuccess(res, {
    name: dash.name,
    widgets,
    layouts: dash.layouts ?? {},
  });
});

export const getPublicWidgetData = asyncHandler(async (req: Request, res: Response) => {
  const params = tokenParam.safeParse(req.params);
  if (!params.success) return sendNotFound(res, 'Share not found');
  const body = widgetIdBody.safeParse(req.body);
  if (!body.success) return sendBadRequest(res, body.error.message);

  const share = await lookupShare(params.data.token);
  if (!share) return sendNotFound(res, 'Share not found');

  const dash = await lookupDashboard(share.dashboard_id);
  if (!dash) return sendNotFound(res, 'Dashboard not found');

  const widget = (dash.widgets ?? []).find((w) => w?.id === body.data.widgetId);
  if (!widget) return sendNotFound(res, 'Widget not found');
  if (widget.widgetType !== 'chart') {
    return sendBadRequest(res, 'Only chart widget data is exposed via share links');
  }

  // Impersonate the owner so duckdb.service picks the right per-user file
  // and the right database scope. The share row is the *only* source of
  // truth for which user/database we run as — the visitor never supplies it.
  const result = await userContext.run(
    {
      userId: share.owner_user_id,
      token: '',
      databaseId: share.owner_database_id,
    },
    async (): Promise<
      | { type: 'joined'; rows: Record<string, unknown>[]; labelColumn: string; valueColumn: string }
      | { type: 'raw'; rows: Record<string, unknown>[]; partialData: boolean }
      | { error: string }
    > => {
      const factTableId = widget.tableId ?? widget.tableIds?.[0];
      if (!factTableId || !widget.labelColumn) {
        return { error: 'Widget is missing table or label configuration' };
      }

      const labelTableId =
        widget.labelTableId && widget.labelTableId !== factTableId
          ? widget.labelTableId
          : undefined;

      // Joined / aggregated path — preferred for star-schema dashboards.
      if (labelTableId) {
        const r = await runChartDataQuery({
          factTableId,
          labelTableId,
          labelColumn: widget.labelColumn,
          valueColumn: widget.valueColumn,
          aggregation: widget.aggregation ?? 'sum',
          topN: widget.topN ?? 0,
          dateGrouping: widget.dateGrouping ?? 'none',
          chartType: widget.chartType,
        });
        if ('error' in r) return r;
        return { type: 'joined', ...r };
      }

      // Raw path — return up to 500 rows from the fact table for the
      // client-side reducer (matches the auth path).
      const fact = await duckdbService.getTableById(factTableId);
      if (!fact) return { error: 'Fact table not found' };
      const paged = await duckdbService.getTableData(fact.name, 1, 500);
      return {
        type: 'raw',
        rows: paged.data,
        partialData: paged.totalRows > 500,
      };
    }
  );

  if ('error' in result) return sendBadRequest(res, result.error);
  logger.info(
    `[share] widget ${body.data.widgetId} for dashboard ${share.dashboard_id} → ${result.type}, ${result.rows.length} rows`
  );
  return sendSuccess(res, result);
});
