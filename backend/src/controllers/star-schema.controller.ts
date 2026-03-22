import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendBadRequest } from '../utils/response.js';
import { starSchemaService } from '../services/star-schema.service.js';
import {
  starSchemaAnalyzeSchema,
  starSchemaApplySchema,
} from '../services/validation.service.js';
import logger from '../utils/logger.js';

export const analyzeStarSchema = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = starSchemaAnalyzeSchema.safeParse(req.body);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.message);
    }

    const { tableId } = validation.data;

    const recommendation = await starSchemaService.analyze(tableId);

    logger.info(`Star schema analysis completed for table: ${tableId}`);

    return sendSuccess(res, { recommendation });
  }
);

export const applyStarSchema = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = starSchemaApplySchema.safeParse(req.body);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.message);
    }

    const { tableId, factTableName, measures, dimensions } = validation.data;

    const result = await starSchemaService.apply(
      tableId,
      factTableName,
      measures,
      dimensions
    );

    logger.info(`Star schema applied to table: ${tableId}`);

    return sendSuccess(res, { result });
  }
);
