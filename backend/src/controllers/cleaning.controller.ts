import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendBadRequest } from '../utils/response.js';
import { cleaningService, CleaningKind } from '../services/cleaning.service.js';
import logger from '../utils/logger.js';

const VALID_KINDS: CleaningKind[] = [
  'fill_missing',
  'remove_duplicates',
  'standardize_dates',
  'cap_outliers',
  'coerce_types',
];

export const analyzeCleaning = asyncHandler(async (req: Request, res: Response) => {
  const tableId = (req.body?.tableId ?? req.query?.tableId) as unknown;
  if (typeof tableId !== 'string' || !tableId) {
    return sendBadRequest(res, 'tableId is required');
  }
  const analysis = await cleaningService.analyze(tableId);
  logger.info(`Cleaning analysis for table ${tableId}: ${analysis.totalIssues} issues, score ${analysis.qualityScore}%`);
  return sendSuccess(res, { analysis });
});

export const applyCleaning = asyncHandler(async (req: Request, res: Response) => {
  const { tableId, kinds } = req.body as { tableId?: unknown; kinds?: unknown };
  if (typeof tableId !== 'string' || !tableId) {
    return sendBadRequest(res, 'tableId is required');
  }
  if (!Array.isArray(kinds) || kinds.length === 0) {
    return sendBadRequest(res, 'kinds must be a non-empty array');
  }
  const filtered = kinds.filter((k): k is CleaningKind =>
    typeof k === 'string' && (VALID_KINDS as string[]).includes(k)
  );
  if (filtered.length === 0) {
    return sendBadRequest(res, 'no valid cleaning kinds provided');
  }
  const result = await cleaningService.apply(tableId, filtered);
  logger.info(`Cleaning applied to table ${tableId}: ${filtered.join(', ')}`);
  return sendSuccess(res, result);
});
