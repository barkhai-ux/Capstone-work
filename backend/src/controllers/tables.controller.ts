import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendNotFound, sendBadRequest } from '../utils/response.js';
import { duckdbService } from '../services/duckdb.service.js';
import { tableIdSchema, getTableDataSchema } from '../services/validation.service.js';
import logger from '../utils/logger.js';

export const listTables = asyncHandler(async (_req: Request, res: Response) => {
  const tables = await duckdbService.listTables();
  return sendSuccess(res, { tables });
});

export const getTable = asyncHandler(async (req: Request, res: Response) => {
  const validation = tableIdSchema.safeParse(req.params);
  if (!validation.success) {
    return sendBadRequest(res, 'Invalid table ID');
  }

  const { tableId } = validation.data;
  const table = await duckdbService.getTableById(tableId);

  if (!table) {
    return sendNotFound(res, 'Table not found');
  }

  return sendSuccess(res, { table });
});

export const getTableData = asyncHandler(async (req: Request, res: Response) => {
  const paramsValidation = tableIdSchema.safeParse(req.params);
  if (!paramsValidation.success) {
    return sendBadRequest(res, 'Invalid table ID');
  }

  const queryValidation = getTableDataSchema.safeParse(req.query);
  if (!queryValidation.success) {
    return sendBadRequest(res, queryValidation.error.message);
  }

  const { tableId } = paramsValidation.data;
  const { page, pageSize } = queryValidation.data;

  const table = await duckdbService.getTableById(tableId);
  if (!table) {
    return sendNotFound(res, 'Table not found');
  }

  const paginatedData = await duckdbService.getTableData(table.name, page, pageSize);

  return sendSuccess(res, {
    tableId,
    tableName: table.name,
    ...paginatedData,
  });
});

export const deleteTable = asyncHandler(async (req: Request, res: Response) => {
  const validation = tableIdSchema.safeParse(req.params);
  if (!validation.success) {
    return sendBadRequest(res, 'Invalid table ID');
  }

  const { tableId } = validation.data;
  const deleted = await duckdbService.deleteTable(tableId);

  if (!deleted) {
    return sendNotFound(res, 'Table not found');
  }

  logger.info(`Table deleted: ${tableId}`);

  return sendSuccess(res, { deleted: true }, 'Table deleted successfully');
});
