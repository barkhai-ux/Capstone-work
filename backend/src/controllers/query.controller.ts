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

    const { question, history } = validation.data;

    // Get ALL tables with their schemas and 10-row samples
    const allTables = await duckdbService.listTables();

    if (allTables.length === 0) {
      return sendBadRequest(res, 'No tables available. Please upload some data first.');
    }

    const tablesContext: { name: string; columns: { name: string; type: string }[]; sampleData: Record<string, unknown>[] }[] = [];

    for (const t of allTables) {
      const sampleData = await duckdbService.getRandomSample(t.name, 10);
      tablesContext.push({
        name: t.name,
        columns: t.columns.map(c => ({ name: c.name, type: c.type })),
        sampleData,
      });
    }

    // Generate SQL from natural language (with classification)
    const aiResult = await groqService.generateSQL(
      tablesContext,
      question,
      history
    );

    // Execute the generated query
    const rows = await duckdbService.all(aiResult.sql);
    const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

    logger.info(`Query executed: "${question}" — [${aiResult.responseType}] ${rows.length} rows`);

    return sendSuccess(res, {
      columns,
      rows,
      totalRows: rows.length,
      responseType: aiResult.responseType,
      chartConfig: aiResult.chartConfig,
      insight: aiResult.insight,
    });
  }
);
