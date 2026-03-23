import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendBadRequest } from '../utils/response.js';
import { duckdbService } from '../services/duckdb.service.js';
import { groqService } from '../services/groq.service.js';
import logger from '../utils/logger.js';

export const generateChart = asyncHandler(
  async (req: Request, res: Response) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return sendBadRequest(res, 'prompt is required');
    }

    const allTables = await duckdbService.listTables();
    if (allTables.length === 0) {
      return sendBadRequest(res, 'No tables available');
    }

    const tablesContext: { name: string; id: string; columns: { name: string; type: string }[]; sampleData: Record<string, unknown>[] }[] = [];

    for (const t of allTables) {
      const paginated = await duckdbService.getTableData(t.name, 1, 5);
      tablesContext.push({
        name: t.name,
        id: t.id,
        columns: t.columns.map(c => ({ name: c.name, type: c.type })),
        sampleData: paginated.data,
      });
    }

    const chartConfig = await groqService.generateChartConfig(tablesContext, prompt);

    // Resolve tableId: AI might return the table name instead of UUID
    if (chartConfig.tableId && typeof chartConfig.tableId === 'string') {
      const match = allTables.find(t => t.id === chartConfig.tableId || t.name === chartConfig.tableId);
      if (match) {
        chartConfig.tableId = match.id;
        // Validate columns exist
        const colNames = match.columns.map(c => c.name);
        if (chartConfig.labelColumn && !colNames.includes(chartConfig.labelColumn as string)) {
          const cat = match.columns.find(c => c.type.toUpperCase() === 'VARCHAR');
          chartConfig.labelColumn = cat?.name ?? colNames[0];
        }
        if (chartConfig.valueColumn && !colNames.includes(chartConfig.valueColumn as string)) {
          const num = match.columns.find(c => ['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(c.type.toUpperCase()));
          chartConfig.valueColumn = num?.name ?? colNames[0];
        }
      }
    }

    logger.info(`AI chart generated for: "${prompt}"`);

    return sendSuccess(res, chartConfig);
  }
);

export const generateDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return sendBadRequest(res, 'prompt is required');
    }

    const allTables = await duckdbService.listTables();
    if (allTables.length === 0) {
      return sendBadRequest(res, 'No tables available');
    }

    const tablesContext: { name: string; id: string; columns: { name: string; type: string }[]; sampleData: Record<string, unknown>[] }[] = [];

    for (const t of allTables) {
      const paginated = await duckdbService.getTableData(t.name, 1, 5);
      tablesContext.push({
        name: t.name,
        id: t.id,
        columns: t.columns.map(c => ({ name: c.name, type: c.type })),
        sampleData: paginated.data,
      });
    }

    const widgets = await groqService.generateDashboard(tablesContext, prompt);

    // Resolve tableId and validate columns for each widget
    for (const w of widgets) {
      if (w.tableId && typeof w.tableId === 'string') {
        const match = allTables.find(t => t.id === w.tableId || t.name === w.tableId);
        if (match) {
          w.tableId = match.id;
          const colNames = match.columns.map(c => c.name);
          if (w.labelColumn && !colNames.includes(w.labelColumn as string)) {
            const cat = match.columns.find(c => c.type.toUpperCase() === 'VARCHAR');
            w.labelColumn = cat?.name ?? colNames[0];
          }
          if (w.valueColumn && !colNames.includes(w.valueColumn as string)) {
            const num = match.columns.find(c => ['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(c.type.toUpperCase()));
            w.valueColumn = num?.name ?? colNames[0];
          }
        } else {
          // Fallback to first table if AI returned an invalid table
          w.tableId = allTables[0].id;
        }
      } else if (w.widgetType !== 'text' && !w.tableId) {
        w.tableId = allTables[0].id;
      }
    }

    logger.info(`AI dashboard generated with ${widgets.length} widgets for: "${prompt}"`);

    return sendSuccess(res, { widgets });
  }
);
