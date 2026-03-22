import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { asyncHandler, AppError } from '../middleware/error-handler.js';
import { sendSuccess, sendCreated, sendBadRequest, sendNotFound } from '../utils/response.js';
import { fileParserService } from '../services/file-parser.service.js';
import { schemaDetectorService } from '../services/schema-detector.service.js';
import { duckdbService } from '../services/duckdb.service.js';
import { uploadFileSchema, fileIdSchema } from '../services/validation.service.js';
import { config, getAbsolutePath } from '../config/index.js';
import { FilePreview } from '../types/index.js';
import logger from '../utils/logger.js';

// In-memory store for file previews (in production, use Redis or similar)
const filePreviews = new Map<string, FilePreview & { filePath: string }>();

export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return sendBadRequest(res, 'No file uploaded');
  }

  const validation = uploadFileSchema.safeParse(req.body);
  if (!validation.success) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    return sendBadRequest(res, validation.error.message);
  }

  const fileId = uuidv4();
  const filePath = req.file.path;

  try {
    // Parse the file
    const parseResult = await fileParserService.parseFile(filePath);

    // Detect schema
    const schema = schemaDetectorService.detectSchema(parseResult.data, parseResult.columns);

    // Generate suggested table name
    const suggestedTableName =
      validation.data?.tableName ||
      schemaDetectorService.sanitizeTableName(req.file.originalname);

    // Store preview data
    const preview: FilePreview & { filePath: string } = {
      fileId,
      fileName: req.file.originalname,
      fileType: parseResult.fileType,
      schema,
      preview: fileParserService.getPreviewData(parseResult.data, 10),
      totalRows: parseResult.totalRows,
      filePath,
    };

    filePreviews.set(fileId, preview);

    logger.info(`File uploaded: ${req.file.originalname}, fileId: ${fileId}`);

    return sendCreated(res, {
      fileId,
      fileName: req.file.originalname,
      fileType: parseResult.fileType,
      suggestedTableName,
      schema,
      previewRows: preview.preview,
      totalRows: parseResult.totalRows,
    });
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
});

export const getPreview = asyncHandler(async (req: Request, res: Response) => {
  const validation = fileIdSchema.safeParse(req.params);
  if (!validation.success) {
    return sendBadRequest(res, 'Invalid file ID');
  }

  const { fileId } = validation.data;
  const preview = filePreviews.get(fileId);

  if (!preview) {
    return sendNotFound(res, 'File preview not found. It may have expired or been committed.');
  }

  return sendSuccess(res, {
    fileId: preview.fileId,
    fileName: preview.fileName,
    fileType: preview.fileType,
    schema: preview.schema,
    previewRows: preview.preview,
    totalRows: preview.totalRows,
  });
});

export const commitUpload = asyncHandler(async (req: Request, res: Response) => {
  const validation = fileIdSchema.safeParse(req.params);
  if (!validation.success) {
    return sendBadRequest(res, 'Invalid file ID');
  }

  const { fileId } = validation.data;
  const preview = filePreviews.get(fileId);

  if (!preview) {
    return sendNotFound(res, 'File preview not found. It may have expired.');
  }

  const { tableName } = req.body;
  const finalTableName =
    tableName || schemaDetectorService.sanitizeTableName(preview.fileName);

  // Check if table already exists
  if (await duckdbService.tableExists(finalTableName)) {
    return sendBadRequest(res, `Table "${finalTableName}" already exists. Choose a different name.`);
  }

  try {
    // For CSV files, use DuckDB's native CSV import for better performance
    if (preview.fileType === 'csv') {
      await duckdbService.importCSV(preview.filePath, finalTableName);
    } else {
      // For Excel/JSON, use parsed data
      const parseResult = await fileParserService.parseFile(preview.filePath);
      await duckdbService.createTableFromData(finalTableName, preview.schema, parseResult.data);
    }

    // Register table in metadata
    const tableId = uuidv4();
    await duckdbService.registerTable(tableId, finalTableName, preview.fileName);

    // Clean up
    filePreviews.delete(fileId);
    if (fs.existsSync(preview.filePath)) {
      fs.unlinkSync(preview.filePath);
    }

    const tableInfo = await duckdbService.getTableById(tableId);

    logger.info(`Table created: ${finalTableName}, tableId: ${tableId}`);

    return sendCreated(res, {
      tableId,
      tableName: finalTableName,
      columnCount: tableInfo?.columnCount,
      rowCount: tableInfo?.rowCount,
    });
  } catch (error) {
    logger.error('Failed to commit upload:', error);
    throw new AppError(`Failed to create table: ${(error as Error).message}`, 500);
  }
});

// Cleanup expired previews (call periodically)
export const cleanupExpiredPreviews = (): void => {
  const uploadDir = getAbsolutePath(config.uploadDir);

  // Remove files older than 1 hour
  const maxAge = 60 * 60 * 1000; // 1 hour in ms
  const now = Date.now();

  try {
    const files = fs.readdirSync(uploadDir);
    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up expired file: ${file}`);
      }
    }
  } catch (error) {
    logger.error('Error cleaning up expired previews:', error);
  }
};
