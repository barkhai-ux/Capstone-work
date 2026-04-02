import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendCreated, sendBadRequest, sendNotFound } from '../utils/response.js';
import { duckdbService } from '../services/duckdb.service.js';
import { saveSnippetSchema, snippetIdSchema } from '../services/validation.service.js';
import logger from '../utils/logger.js';

// Ensure snippets table exists
async function ensureSnippetsTable(): Promise<void> {
  await duckdbService.run(`
    CREATE TABLE IF NOT EXISTS _saved_snippets (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      question VARCHAR NOT NULL,
      columns_json VARCHAR NOT NULL,
      rows_json VARCHAR NOT NULL,
      row_count INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export const listSnippets = asyncHandler(
  async (_req: Request, res: Response) => {
    await ensureSnippetsTable();
    const snippets = await duckdbService.all<{
      id: string;
      name: string;
      question: string;
      row_count: number;
      created_at: string;
    }>(`SELECT id, name, question, row_count, created_at FROM _saved_snippets ORDER BY created_at DESC`);

    return sendSuccess(res, {
      snippets: snippets.map(s => ({
        id: s.id,
        name: s.name,
        question: s.question,
        rowCount: Number(s.row_count),
        createdAt: String(s.created_at),
      })),
    });
  }
);

export const getSnippet = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = snippetIdSchema.safeParse(req.params);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.message);
    }

    await ensureSnippetsTable();
    const rows = await duckdbService.all<{
      id: string;
      name: string;
      question: string;
      columns_json: string;
      rows_json: string;
      row_count: number;
      created_at: string;
    }>(`SELECT * FROM _saved_snippets WHERE id = $1`, { '1': validation.data.snippetId });

    if (rows.length === 0) {
      return sendNotFound(res);
    }

    const s = rows[0];
    return sendSuccess(res, {
      id: s.id,
      name: s.name,
      question: s.question,
      columns: JSON.parse(s.columns_json),
      rows: JSON.parse(s.rows_json),
      rowCount: Number(s.row_count),
      createdAt: String(s.created_at),
    });
  }
);

export const saveSnippet = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = saveSnippetSchema.safeParse(req.body);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.message);
    }

    const { name, question, columns, rows } = validation.data;
    const id = uuidv4();

    await ensureSnippetsTable();
    await duckdbService.run(
      `INSERT INTO _saved_snippets (id, name, question, columns_json, rows_json, row_count) VALUES ($1, $2, $3, $4, $5, $6)`,
      {
        '1': id,
        '2': name,
        '3': question,
        '4': JSON.stringify(columns),
        '5': JSON.stringify(rows),
        '6': rows.length,
      }
    );

    logger.info(`Saved snippet: "${name}" (${rows.length} rows)`);

    return sendCreated(res, { id, name, rowCount: rows.length });
  }
);

export const deleteSnippet = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = snippetIdSchema.safeParse(req.params);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.message);
    }

    await ensureSnippetsTable();
    const rows = await duckdbService.all<{ id: string }>(
      `SELECT id FROM _saved_snippets WHERE id = $1`,
      { '1': validation.data.snippetId }
    );

    if (rows.length === 0) {
      return sendNotFound(res);
    }

    await duckdbService.run(
      `DELETE FROM _saved_snippets WHERE id = $1`,
      { '1': validation.data.snippetId }
    );

    logger.info(`Deleted snippet: ${validation.data.snippetId}`);
    return sendSuccess(res, { deleted: true });
  }
);
