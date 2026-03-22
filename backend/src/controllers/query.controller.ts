import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendBadRequest } from '../utils/response.js';
import { duckdbService } from '../services/duckdb.service.js';
import { groqService } from '../services/groq.service.js';
import { querySchema } from '../services/validation.service.js';
import logger from '../utils/logger.js';

export const queryTable = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = querySchema.safeParse(req.body);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.message);
    }

    const { tableId, question } = validation.data;

    // Verify the selected table exists
    const table = await duckdbService.getTableById(tableId);
    if (!table) {
      return sendBadRequest(res, 'Table not found');
    }

    // Get ALL tables with their schemas and 10-row samples
    const allTables = await duckdbService.listTables();
    const tablesContext: { name: string; columns: { name: string; type: string }[]; sampleData: Record<string, unknown>[] }[] = [];

    for (const t of allTables) {
      const paginated = await duckdbService.getTableData(t.name, 1, 10);
      tablesContext.push({
        name: t.name,
        columns: t.columns.map(c => ({ name: c.name, type: c.type })),
        sampleData: paginated.data,
      });
    }

    // Generate SQL from natural language
    const sql = await groqService.generateSQL(
      tablesContext,
      question
    );

    // Execute the generated query
    const rows = await duckdbService.all(sql);
    const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

    logger.info(`Query executed: "${question}" — ${rows.length} rows`);

    return sendSuccess(res, {
      columns,
      rows,
      totalRows: rows.length,
    });
  }
);
