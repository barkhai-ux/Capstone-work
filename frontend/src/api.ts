const API_BASE = '/api/v1';

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

export interface StarSchemaResult {
  success: boolean;
  factTable: string;
  dimensionTables: string[];
  columnsProcessed: string[];
  rowsAffected: number;
}

// ── Query types ──

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

// ── API helpers ──

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(url, options);
  return res.json();
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

  async commitUpload(fileId: string, tableName?: string): Promise<ApiResponse<{ tableId: string; tableName: string; columnCount: number; rowCount: number }>> {
    return request(`${API_BASE}/upload/commit/${fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableName }),
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

  // Natural language query
  queryTable(tableId: string, question: string): Promise<ApiResponse<QueryResult>> {
    return request(`${API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId, question }),
    });
  },
};
