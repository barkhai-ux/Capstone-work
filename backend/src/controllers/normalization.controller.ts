import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendBadRequest } from '../utils/response.js';
import { normalizationService } from '../services/normalization.service.js';
import { normalizeAnalyzeSchema, normalizeApplySchema } from '../services/validation.service.js';
import logger from '../utils/logger.js';

export const analyzeTable = asyncHandler(async (req: Request, res: Response) => {
  const validation = normalizeAnalyzeSchema.safeParse(req.body);
  if (!validation.success) {
    return sendBadRequest(res, validation.error.message);
  }

  const { tableId } = validation.data;

  const analysis = await normalizationService.analyzeTable(tableId);

  logger.info(`Normalization analysis completed for table: ${tableId}`);

  return sendSuccess(res, { analysis });
});

export const applyNormalization = asyncHandler(async (req: Request, res: Response) => {
  const validation = normalizeApplySchema.safeParse(req.body);
  if (!validation.success) {
    return sendBadRequest(res, validation.error.message);
  }

  const { tableId, dimensions } = validation.data;

  const result = await normalizationService.applyDimensionNormalization(tableId, dimensions);

  const dimNames = dimensions.map((d) => d.name).join(', ');
  logger.info(`Dimension normalization applied to table: ${tableId}, dimensions: ${dimNames}`);

  return sendSuccess(res, { result });
});
