import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger.js';
import { sendError, sendBadRequest } from '../utils/response.js';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  logger.error(err);

  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return sendBadRequest(res, `Validation error: ${message}`);
  }

  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode);
  }

  if (err.message.includes('ENOENT')) {
    return sendError(res, 'File not found', 404);
  }

  if (err.message.includes('Catalog Error')) {
    return sendError(res, 'Table not found', 404);
  }

  const message =
    process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';

  return sendError(res, message, 500);
};

export const asyncHandler = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
