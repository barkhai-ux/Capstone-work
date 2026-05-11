import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

// Attach the current Supabase access token (if any) as a Bearer auth header,
// plus the active database id when one has been selected by the user.
let activeDatabaseId: string | null = null;

export function setActiveDatabaseId(id: string | null): void {
  activeDatabaseId = id;
}

async function withAuth(init?: RequestInit): Promise<RequestInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (activeDatabaseId) headers.set('X-Database-Id', activeDatabaseId);
  return { ...init, headers };
}

// ── Shared types ──

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableInfo {
  id: string;
  name: string;
  rowCount: number;
  columnCount?: number;
  columns: ColumnInfo[];
  createdAt: string;
}

export interface TableData {
  columns: string[];
  rows: Record<string, unknown>[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
}

export interface UploadPreview {
  fileId: string;
  fileName: string;
  suggestedTableName: string;
  columns: ColumnInfo[];
  preview: Record<string, unknown>[];
  totalRows: number;
}

// ── Normalization types ──

export interface NormalizationColumnStat {
  column: string;
  uniqueCount: number;
  totalRows: number;
  repetitionRate: number;
}

export interface NormalizationDimension {
  name: string;
  columns: string[];
  primaryKey?: string;
  repetitionRate: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  columnStats: NormalizationColumnStat[];
}

export interface NormalizationAnalysis {
  tableId: string;
  tableName: string;
  dimensions: NormalizationDimension[];
  factColumns: string[];
  overallRecommendation: string;
}

export interface NormalizationResult {
  success: boolean;
  originalTable: string;
  lookupTablesCreated: string[];
  columnsNormalized: string[];
  rowsAffected: number;
}

// ── Star Schema types ──

export interface DimensionRecommendation {
  dimensionName: string;
  columns: string[];
  primaryKey?: string;
  description?: string;
}

export interface StarSchemaRecommendation {
  tableId: string;
  tableName: string;
  factTable: {
    name: string;
    measures: string[];
    foreignKeys: string[];
    description: string;
  };
  dimensions: DimensionRecommendation[];
  aiExplanation: string;
}

export type CleaningKind =
  | 'fill_missing'
  | 'remove_duplicates'
  | 'standardize_dates'
  | 'cap_outliers'
  | 'coerce_types';

export interface CleaningColumnAnalysis {
  name: string;
  type: string;
  nullCount: number;
  distinctCount: number;
  samples: string[];
  issues: { kind: CleaningKind; affected: number }[];
}

export interface CleaningAnalysis {
  tableId: string;
  tableName: string;
  rowCount: number;
  duplicateCount: number;
  qualityScore: number;
  totalIssues: number;
  byKind: Record<CleaningKind, number>;
  columns: CleaningColumnAnalysis[];
  recommendations: {
    kind: CleaningKind;
    title: string;
    description: string;
    affected: number;
  }[];
  aiSummary?: string;
}

export interface StarSchemaResult {
  success: boolean;
  factTable: string;
  dimensionTables: string[];
  columnsProcessed: string[];
  rowsAffected: number;
}

// ── Query types ──

export interface QueryChartConfig {
  chartType: string;
  labelColumn: string;
  valueColumn: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  responseType?: 'chart' | 'table';
  chartConfig?: QueryChartConfig;
  insight?: string;
}

// ── Database (workspace) types ──

export interface DatabaseRecord {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

// ── Dashboard types ──

export interface DashboardRecord {
  id: string;
  name: string;
  widgets: unknown[];
  layouts: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Snippet types ──

export interface SnippetSummary {
  id: string;
  name: string;
  question: string;
  rowCount: number;
  createdAt: string;
}

export interface SnippetDetail extends SnippetSummary {
  columns: string[];
  rows: Record<string, unknown>[];
}

// ── API helpers ──

const COLD_START_MAX_RETRIES = 6;
const COLD_START_BASE_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function publicRequest<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  // Public endpoint — no Authorization or X-Database-Id headers. Visitors
  // hitting a /share/:token link aren't logged in.
  return rawRequest<T>(url, { cache: 'no-store', ...options });
}

async function rawRequest<T>(url: string, init: RequestInit): Promise<ApiResponse<T>> {
  let attempt = 0;
  while (true) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt < COLD_START_MAX_RETRIES) {
        await sleep(COLD_START_BASE_DELAY_MS * Math.pow(2, attempt));
        attempt++;
        continue;
      }
      throw err;
    }

    const contentType = res.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const isColdStart = !isJson && (res.status === 404 || res.status >= 500);
    if (isColdStart && attempt < COLD_START_MAX_RETRIES) {
      await sleep(COLD_START_BASE_DELAY_MS * Math.pow(2, attempt));
      attempt++;
      continue;
    }
    if (isJson) return res.json();
    const text = await res.text();
    return { success: false, error: text || `HTTP ${res.status}` } as ApiResponse<T>;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  let attempt = 0;
  // Bypass the HTTP cache. We do our own stale-while-revalidate in
  // localStorage; with HTTP caching on, Express's ETag layer can return a
  // bodyless 304 that fetch surfaces as a non-JSON failure.
  const authedOptions = await withAuth({ cache: 'no-store', ...options });
  while (true) {
    let res: Response;
    try {
      res = await fetch(url, authedOptions);
    } catch (err) {
      if (attempt < COLD_START_MAX_RETRIES) {
        await sleep(COLD_START_BASE_DELAY_MS * Math.pow(2, attempt));
        attempt++;
        continue;
      }
      throw err;
    }

    const contentType = res.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');

    // Render free-tier cold start: Cloudflare returns a plain-text 404 "Not Found"
    // before the upstream service is up. Retry with backoff instead of surfacing it.
    const isColdStart = !isJson && (res.status === 404 || res.status >= 500);
    if (isColdStart && attempt < COLD_START_MAX_RETRIES) {
      await sleep(COLD_START_BASE_DELAY_MS * Math.pow(2, attempt));
      attempt++;
      continue;
    }

    if (isJson) return res.json();

    const text = await res.text();
    return {
      success: false,
      error: text || `HTTP ${res.status}`,
    } as ApiResponse<T>;
  }
}

// ── API client ──

export const api = {
  // Health
  checkHealth(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
    return request(`${API_BASE}/health`);
  },

  // Upload
  async uploadFile(file: File): Promise<ApiResponse<UploadPreview>> {
    const formData = new FormData();
    formData.append('file', file);
    const json = await request<{ fileId: string; fileName: string; suggestedTableName: string; schema: ColumnInfo[]; previewRows: Record<string, unknown>[]; totalRows: number }>(
      `${API_BASE}/upload`,
      { method: 'POST', body: formData }
    );
    if (json.success && json.data) {
      return {
        ...json,
        data: {
          fileId: json.data.fileId,
          fileName: json.data.fileName,
          suggestedTableName: json.data.suggestedTableName,
          columns: json.data.schema ?? [],
          preview: json.data.previewRows ?? [],
          totalRows: json.data.totalRows,
        },
      };
    }
    return json as unknown as ApiResponse<UploadPreview>;
  },

  async commitUpload(fileId: string, opts: { tableName?: string; databaseId: string }): Promise<ApiResponse<{ tableId: string; tableName: string; columnCount: number; rowCount: number }>> {
    return request(`${API_BASE}/upload/commit/${fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
  },

  // Tables
  async listTables(): Promise<ApiResponse<TableInfo[]>> {
    const json = await request<{ tables: TableInfo[] }>(`${API_BASE}/tables`);
    if (json.success && json.data?.tables) {
      return { ...json, data: json.data.tables };
    }
    return json as unknown as ApiResponse<TableInfo[]>;
  },

  getTable(tableId: string): Promise<ApiResponse<{ table: TableInfo }>> {
    return request(`${API_BASE}/tables/${tableId}`);
  },

  async getTableData(tableId: string, page = 1, pageSize = 50): Promise<ApiResponse<TableData>> {
    const json = await request<{ data: Record<string, unknown>[]; page: number; pageSize: number; totalRows: number; totalPages: number }>(
      `${API_BASE}/tables/${tableId}/data?page=${page}&pageSize=${pageSize}`
    );
    if (json.success && json.data) {
      const d = json.data;
      const rows = d.data ?? [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return {
        ...json,
        data: {
          columns,
          rows,
          pagination: { page: d.page, pageSize: d.pageSize, totalRows: d.totalRows, totalPages: d.totalPages },
        },
      };
    }
    return json as unknown as ApiResponse<TableData>;
  },

  deleteTable(tableId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return request(`${API_BASE}/tables/${tableId}`, { method: 'DELETE' });
  },

  // Normalization
  async analyzeNormalization(tableId: string): Promise<ApiResponse<NormalizationAnalysis>> {
    const json = await request<{ analysis: NormalizationAnalysis }>(
      `${API_BASE}/normalization/analyze`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableId }) }
    );
    if (json.success && json.data?.analysis) {
      return { ...json, data: json.data.analysis };
    }
    return json as unknown as ApiResponse<NormalizationAnalysis>;
  },

  async applyNormalization(
    tableId: string,
    dimensions: { name: string; columns: string[]; primaryKey?: string }[]
  ): Promise<ApiResponse<NormalizationResult>> {
    const json = await request<{ result: NormalizationResult }>(
      `${API_BASE}/normalization/apply`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableId, dimensions }) }
    );
    if (json.success && json.data?.result) {
      return { ...json, data: json.data.result };
    }
    return json as unknown as ApiResponse<NormalizationResult>;
  },

  // Star Schema
  async analyzeStarSchema(tableId: string): Promise<ApiResponse<StarSchemaRecommendation>> {
    const json = await request<{ recommendation: StarSchemaRecommendation }>(
      `${API_BASE}/star-schema/analyze`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tableId }) }
    );
    if (json.success && json.data?.recommendation) {
      return { ...json, data: json.data.recommendation };
    }
    return json as unknown as ApiResponse<StarSchemaRecommendation>;
  },

  async applyStarSchema(
    tableId: string,
    factTableName: string,
    measures: string[],
    dimensions: DimensionRecommendation[]
  ): Promise<ApiResponse<StarSchemaResult>> {
    const json = await request<{ result: StarSchemaResult }>(
      `${API_BASE}/star-schema/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, factTableName, measures, dimensions }),
      }
    );
    if (json.success && json.data?.result) {
      return { ...json, data: json.data.result };
    }
    return json as unknown as ApiResponse<StarSchemaResult>;
  },

  async analyzeCleaning(tableId: string): Promise<ApiResponse<CleaningAnalysis>> {
    const json = await request<{ analysis: CleaningAnalysis }>(
      `${API_BASE}/cleaning/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId }),
      }
    );
    if (json.success && json.data?.analysis) {
      return { ...json, data: json.data.analysis };
    }
    return json as unknown as ApiResponse<CleaningAnalysis>;
  },

  async applyCleaning(
    tableId: string,
    kinds: CleaningKind[]
  ): Promise<ApiResponse<{ applied: { kind: CleaningKind; affected: number }[]; tableName: string }>> {
    const json = await request<{ applied: { kind: CleaningKind; affected: number }[]; tableName: string }>(
      `${API_BASE}/cleaning/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, kinds }),
      }
    );
    return json as ApiResponse<{ applied: { kind: CleaningKind; affected: number }[]; tableName: string }>;
  },

  // AI chart generation
  generateChart(prompt: string): Promise<ApiResponse<Record<string, unknown>>> {
    return request(`${API_BASE}/chart/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  },

  // AI dashboard generation
  generateDashboard(prompt: string): Promise<ApiResponse<{ widgets: Record<string, unknown>[] }>> {
    return request(`${API_BASE}/chart/dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  },

  // Joined chart data: aggregate value from fact table grouped by label from a (possibly different) table
  getChartData(body: {
    factTableId: string;
    labelTableId?: string;
    labelColumn: string;
    valueColumn?: string;
    aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
    topN?: number;
    dateGrouping?: 'none' | 'yearly' | 'quarterly' | 'monthly';
    chartType?: string;
  }): Promise<ApiResponse<{ rows: Record<string, unknown>[]; labelColumn: string; valueColumn: string }>> {
    return request(`${API_BASE}/chart/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  // Natural language query (no table selection needed — AI picks from all tables)
  queryData(question: string, history?: { role: 'user' | 'assistant'; content: string }[]): Promise<ApiResponse<QueryResult>> {
    return request(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
    });
  },

  // Snippets
  async listSnippets(): Promise<ApiResponse<SnippetSummary[]>> {
    const json = await request<{ snippets: SnippetSummary[] }>(`${API_BASE}/snippets`);
    if (json.success && json.data?.snippets) {
      return { ...json, data: json.data.snippets };
    }
    return json as unknown as ApiResponse<SnippetSummary[]>;
  },

  getSnippet(snippetId: string): Promise<ApiResponse<SnippetDetail>> {
    return request(`${API_BASE}/snippets/${snippetId}`);
  },

  saveSnippet(name: string, question: string, columns: string[], rows: Record<string, unknown>[]): Promise<ApiResponse<{ id: string; name: string; rowCount: number }>> {
    return request(`${API_BASE}/snippets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, question, columns, rows }),
    });
  },

  deleteSnippet(snippetId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return request(`${API_BASE}/snippets/${snippetId}`, { method: 'DELETE' });
  },

  // Dashboards
  async listDashboards(): Promise<ApiResponse<DashboardRecord[]>> {
    const json = await request<{ dashboards: DashboardRecord[] }>(`${API_BASE}/dashboards`);
    if (json.success && json.data?.dashboards) {
      return { ...json, data: json.data.dashboards };
    }
    return json as unknown as ApiResponse<DashboardRecord[]>;
  },

  async createDashboard(payload: { id?: string; name: string; widgets: unknown[]; layouts: Record<string, unknown> }): Promise<ApiResponse<DashboardRecord>> {
    const json = await request<{ dashboard: DashboardRecord }>(`${API_BASE}/dashboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (json.success && json.data?.dashboard) return { ...json, data: json.data.dashboard };
    return json as unknown as ApiResponse<DashboardRecord>;
  },

  async updateDashboard(id: string, payload: Partial<{ name: string; widgets: unknown[]; layouts: Record<string, unknown> }>): Promise<ApiResponse<DashboardRecord>> {
    const json = await request<{ dashboard: DashboardRecord }>(`${API_BASE}/dashboards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (json.success && json.data?.dashboard) return { ...json, data: json.data.dashboard };
    return json as unknown as ApiResponse<DashboardRecord>;
  },

  deleteDashboard(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return request(`${API_BASE}/dashboards/${id}`, { method: 'DELETE' });
  },

  // Dashboard sharing (auth-gated)
  getDashboardShare(dashboardId: string): Promise<ApiResponse<{ share: { token: string; created_at: string } | null }>> {
    return request(`${API_BASE}/dashboards/${dashboardId}/share`);
  },

  createDashboardShare(dashboardId: string): Promise<ApiResponse<{ share: { token: string; created_at: string } }>> {
    return request(`${API_BASE}/dashboards/${dashboardId}/share`, { method: 'POST' });
  },

  revokeDashboardShare(dashboardId: string): Promise<ApiResponse<{ revoked: boolean }>> {
    return request(`${API_BASE}/dashboards/${dashboardId}/share`, { method: 'DELETE' });
  },

  // Public share viewer (no auth)
  getPublicSharedDashboard(token: string): Promise<ApiResponse<{ name: string; widgets: Record<string, unknown>[]; layouts: Record<string, unknown> }>> {
    return publicRequest(`${API_BASE}/public/share/${encodeURIComponent(token)}`);
  },

  getPublicSharedWidgetData(
    token: string,
    widgetId: string
  ): Promise<ApiResponse<
    | { type: 'joined'; rows: Record<string, unknown>[]; labelColumn: string; valueColumn: string }
    | { type: 'raw'; rows: Record<string, unknown>[]; partialData: boolean }
  >> {
    return publicRequest(`${API_BASE}/public/share/${encodeURIComponent(token)}/widget-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetId }),
    });
  },

  // Databases (user-named workspaces)
  async listDatabases(): Promise<ApiResponse<{ databases: DatabaseRecord[]; defaultDatabaseId: string }>> {
    return request(`${API_BASE}/databases`);
  },

  async createDatabase(name: string): Promise<ApiResponse<DatabaseRecord>> {
    const json = await request<{ database: DatabaseRecord }>(`${API_BASE}/databases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (json.success && json.data?.database) return { ...json, data: json.data.database };
    return json as unknown as ApiResponse<DatabaseRecord>;
  },

  async renameDatabase(id: string, name: string): Promise<ApiResponse<DatabaseRecord>> {
    const json = await request<{ database: DatabaseRecord }>(`${API_BASE}/databases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (json.success && json.data?.database) return { ...json, data: json.data.database };
    return json as unknown as ApiResponse<DatabaseRecord>;
  },

  deleteDatabase(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return request(`${API_BASE}/databases/${id}`, { method: 'DELETE' });
  },
};
