import { z } from 'zod';

export const uploadFileSchema = z.object({
  tableName: z.string().min(1).max(63).optional(),
});

export const getTableDataSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(50),
});

export const normalizeAnalyzeSchema = z.object({
  tableId: z.string().uuid(),
});

export const normalizeApplySchema = z.object({
  tableId: z.string().uuid(),
  dimensions: z.array(
    z.object({
      name: z.string().min(1).max(63),
      columns: z.array(z.string().min(1)).min(1),
      primaryKey: z.string().min(1).optional(),
    })
  ).min(1),
});

export const tableIdSchema = z.object({
  tableId: z.string().uuid(),
});

export const fileIdSchema = z.object({
  fileId: z.string().uuid(),
});

export const starSchemaAnalyzeSchema = z.object({
  tableId: z.string().uuid(),
});

export const starSchemaApplySchema = z.object({
  tableId: z.string().uuid(),
  factTableName: z.string().min(1).max(63),
  measures: z.array(z.string().min(1)),
  dimensions: z.array(
    z.object({
      dimensionName: z.string().min(1).max(63),
      columns: z.array(z.string().min(1)).min(1),
      primaryKey: z.string().min(1).optional(),
      description: z.string().optional(),
    })
  ).min(1),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;
export type GetTableDataInput = z.infer<typeof getTableDataSchema>;
export type NormalizeAnalyzeInput = z.infer<typeof normalizeAnalyzeSchema>;
export type NormalizeApplyInput = z.infer<typeof normalizeApplySchema>;
export type StarSchemaAnalyzeInput = z.infer<typeof starSchemaAnalyzeSchema>;
export const querySchema = z.object({
  tableId: z.string().uuid(),
  question: z.string().min(1).max(1000),
});

export type StarSchemaApplyInput = z.infer<typeof starSchemaApplySchema>;
export type QueryInput = z.infer<typeof querySchema>;
