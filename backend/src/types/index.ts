export interface ColumnSchema {
  name: string;
  type: 'INTEGER' | 'DECIMAL' | 'DATE' | 'VARCHAR' | 'BOOLEAN' | 'TIMESTAMP';
  nullable: boolean;
  sample: unknown[];
}

export interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
  rowCount: number;
}

export interface FilePreview {
  fileId: string;
  fileName: string;
  fileType: 'csv' | 'excel' | 'json';
  schema: ColumnSchema[];
  preview: Record<string, unknown>[];
  totalRows: number;
}

export interface TableInfo {
  id: string;
  name: string;
  columnCount: number;
  rowCount: number;
  createdAt: string;
  columns: ColumnSchema[];
}

export interface PaginatedData {
  data: Record<string, unknown>[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export interface NormalizationCandidate {
  column: string;
  repetitionRate: number;
  uniqueCount: number;
  totalRows: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedLookupTable: string;
  estimatedSavings: number;
  topValues: { value: string; count: number }[];
}

export interface NormalizationDimensionGroup {
  name: string;
  columns: string[];
  primaryKey?: string;
  repetitionRate: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  columnStats: {
    column: string;
    uniqueCount: number;
    totalRows: number;
    repetitionRate: number;
  }[];
}

export interface NormalizationAnalysis {
  tableId: string;
  tableName: string;
  candidates: NormalizationCandidate[];
  dimensions: NormalizationDimensionGroup[];
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

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadedFile {
  id: string;
  originalName: string;
  path: string;
  size: number;
  mimeType: string;
}

// Star Schema types

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
