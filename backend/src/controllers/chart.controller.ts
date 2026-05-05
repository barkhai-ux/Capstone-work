import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendSuccess, sendBadRequest } from '../utils/response.js';
import { duckdbService } from '../services/duckdb.service.js';
import { groqService } from '../services/groq.service.js';
import { extractBaseNameFromId, isIdColumn } from '../utils/key-detection.js';
import { TableInfo } from '../types/index.js';
import logger from '../utils/logger.js';

const chartRequestSchema = z.object({
  prompt: z.string().min(1, 'prompt must not be empty').max(500, 'prompt must be 500 characters or fewer'),
});

export const generateChart = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = chartRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.errors[0]?.message ?? 'Invalid request');
    }
    const { prompt } = validation.data;

    const allTables = await duckdbService.listTables();
    if (allTables.length === 0) {
      return sendBadRequest(res, 'No tables available');
    }

    const tablesContext: {
      name: string; id: string;
      columns: { name: string; type: string }[];
      sampleData: Record<string, unknown>[];
      columnStats: { column: string; uniqueCount: number; totalRows: number; nullCount: number; topValues: { value: string; count: number }[] }[];
    }[] = [];

    for (const t of allTables) {
      const [sampleData, columnStats] = await Promise.all([
        duckdbService.getRandomSample(t.name, 8),
        duckdbService.getMultiColumnStats(t.name, t.columns.map(c => c.name)),
      ]);
      tablesContext.push({
        name: t.name,
        id: t.id,
        columns: t.columns.map(c => ({ name: c.name, type: c.type })),
        sampleData,
        columnStats,
      });
    }

    const chartConfig = await groqService.generateChartConfig(tablesContext, prompt);

    resolveWidgetTables(chartConfig, allTables);

    logger.info(`AI chart generated for: "${prompt}"`);

    return sendSuccess(res, chartConfig);
  }
);

export const generateDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = chartRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.errors[0]?.message ?? 'Invalid request');
    }
    const { prompt } = validation.data;

    const allTables = await duckdbService.listTables();
    if (allTables.length === 0) {
      return sendBadRequest(res, 'No tables available');
    }

    const tablesContext: {
      name: string; id: string;
      columns: { name: string; type: string }[];
      sampleData: Record<string, unknown>[];
      columnStats: { column: string; uniqueCount: number; totalRows: number; nullCount: number; topValues: { value: string; count: number }[] }[];
    }[] = [];

    for (const t of allTables) {
      const [sampleData, columnStats] = await Promise.all([
        duckdbService.getRandomSample(t.name, 10),
        duckdbService.getMultiColumnStats(t.name, t.columns.map(c => c.name)),
      ]);
      tablesContext.push({
        name: t.name,
        id: t.id,
        columns: t.columns.map(c => ({ name: c.name, type: c.type })),
        sampleData,
        columnStats,
      });
    }

    const widgets = await groqService.generateDashboard(tablesContext, prompt);

    logger.info(`[DEBUG] Available tables: ${allTables.map(t => `${t.name}(id=${t.id.slice(0,8)}, cols=[${t.columns.map(c => c.name).join(',')}])`).join(' | ')}`);
    logger.info(`[DEBUG] Raw AI widgets: ${JSON.stringify(widgets, null, 2)}`);

    for (const w of widgets) {
      if (w.widgetType !== 'text') resolveWidgetTables(w, allTables);
    }

    logger.info(`[DEBUG] Resolved widgets: ${JSON.stringify(widgets, null, 2)}`);
    logger.info(`AI dashboard generated with ${widgets.length} widgets for: "${prompt}"`);

    return sendSuccess(res, { widgets });
  }
);

/**
 * Normalize a widget config returned by the AI:
 * - Resolve tableId / tableIds / labelTableId from name → UUID
 * - Validate label and value columns exist in their respective tables
 * - If labelTableId is missing but the labelColumn is an FK id, try to redirect
 *   it to a matching dim table's descriptive column (so charts show names, not ids)
 */
function resolveWidgetTables(
  w: Record<string, unknown>,
  allTables: TableInfo[]
): void {
  const findTable = (idOrName: unknown): TableInfo | undefined => {
    if (typeof idOrName !== 'string') return undefined;
    return allTables.find(t => t.id === idOrName || t.name === idOrName);
  };

  // Normalize tableIds: prefer array, fall back to single tableId
  let factTable: TableInfo | undefined;
  const idsRaw = w.tableIds;
  if (Array.isArray(idsRaw) && idsRaw.length > 0) {
    factTable = findTable(idsRaw[0]);
    w.tableIds = factTable ? [factTable.id] : [allTables[0].id];
  } else if (w.tableId) {
    factTable = findTable(w.tableId);
    if (factTable) {
      w.tableId = factTable.id;
      w.tableIds = [factTable.id];
    }
  }
  if (!factTable) {
    factTable = allTables[0];
    w.tableIds = [factTable.id];
    w.tableId = factTable.id;
  }

  // Resolve labelTableId
  let labelTable: TableInfo | undefined;
  if (w.labelTableId) {
    labelTable = findTable(w.labelTableId);
    if (labelTable) w.labelTableId = labelTable.id;
    else delete w.labelTableId;
  }

  const labelCol = typeof w.labelColumn === 'string' ? w.labelColumn : '';
  const valCol = typeof w.valueColumn === 'string' ? w.valueColumn : '';

  // If AI didn't pick a labelTable but labelColumn looks like an FK id and a
  // matching dim table exists, redirect to that dim's first descriptive column.
  if (!labelTable && labelCol && isIdColumn(labelCol)) {
    let dimMatch: TableInfo | undefined;

    // Strategy 1 (existing-PK star schema): some other table has labelColumn
    // as a column — that's where the FK points.
    dimMatch = allTables.find(t =>
      t.id !== factTable!.id && t.columns.some(c => c.name === labelCol)
    );

    // Strategy 2 (surrogate-key convention): labelColumn = "<dimTable>_id".
    // e.g., "dim_date_id" → look for a table named "dim_date".
    if (!dimMatch && labelCol.toLowerCase().endsWith('_id')) {
      const dimNameGuess = labelCol.slice(0, -3);
      dimMatch = allTables.find(t =>
        t.id !== factTable!.id && t.name.toLowerCase() === dimNameGuess.toLowerCase()
      );
    }

    // Strategy 3 (fuzzy name match): use the base entity name from the FK
    // (e.g., "Postal Code" → "postal", "Customer ID" → "customer") and
    // find any table whose name contains it.
    if (!dimMatch) {
      const baseName = extractBaseNameFromId(labelCol)
        .replace(/^(dim_|lkp_)/, '')
        .replace(/s$/, '');
      if (baseName) {
        dimMatch = allTables.find(t => {
          if (t.id === factTable!.id) return false;
          const tn = t.name.toLowerCase().replace(/^(dim_|lkp_)/, '').replace(/s$/, '');
          return tn === baseName || tn.includes(baseName) || baseName.includes(tn);
        });
      }
    }

    if (dimMatch) {
      // Pick the most descriptive column: prefer non-id VARCHAR, then
      // DATE/TIMESTAMP (e.g., dim_date holds an actual date column), then
      // any non-id column.
      const isUsableDescriptor = (c: { name: string; type: string }) =>
        c.name !== 'id' && !isIdColumn(c.name);
      const desc =
        dimMatch.columns.find(c => c.type.toUpperCase() === 'VARCHAR' && isUsableDescriptor(c))
        ?? dimMatch.columns.find(c => ['DATE', 'TIMESTAMP'].includes(c.type.toUpperCase()) && isUsableDescriptor(c))
        ?? dimMatch.columns.find(isUsableDescriptor);
      if (desc) {
        labelTable = dimMatch;
        w.labelTableId = dimMatch.id;
        w.labelColumn = desc.name;
        logger.info(`[redirect] "${labelCol}" → ${dimMatch.name}."${desc.name}"`);
      } else {
        logger.info(`[redirect] dim "${dimMatch.name}" has no usable descriptive column for "${labelCol}"`);
      }
    } else {
      logger.info(`[redirect] no dim table found for FK-like label "${labelCol}"`);
    }
  }

  // Validate labelColumn against the chosen label table (or fact, if none)
  const labelHost = labelTable ?? factTable;
  const labelHostCols = labelHost.columns.map(c => c.name);
  if (w.labelColumn && !labelHostCols.includes(w.labelColumn as string)) {
    const cat = labelHost.columns.find(c => c.type.toUpperCase() === 'VARCHAR' && !isIdColumn(c.name))
      ?? labelHost.columns.find(c => c.type.toUpperCase() === 'VARCHAR');
    w.labelColumn = cat?.name ?? labelHostCols[0];
  }

  // Validate valueColumn against the fact table
  const factCols = factTable.columns.map(c => c.name);
  if (valCol && !factCols.includes(valCol)) {
    const num = factTable.columns.find(c =>
      ['INTEGER', 'DECIMAL', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(c.type.toUpperCase())
    );
    w.valueColumn = num?.name ?? factCols[0];
  }
}

// ── Joined chart-data endpoint ──
// Aggregates a value column from a fact table grouped by a label column from a
// (typically dimension) table, joining the two on a detected FK→PK relationship.
// Used by the dashboard chart widget so star-schema charts can show real names
// (e.g., dim_customer.customer_name) instead of bare FK ids from the fact table.

const chartDataSchema = z.object({
  factTableId: z.string().min(1),
  labelTableId: z.string().optional(),
  labelColumn: z.string().min(1),
  valueColumn: z.string().optional(),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max']).optional(),
  topN: z.number().int().min(0).max(1000).optional(),
  dateGrouping: z.enum(['none', 'yearly', 'quarterly', 'monthly']).optional(),
  chartType: z.string().optional(),
});

export type ChartDataConfig = z.infer<typeof chartDataSchema>;
export interface ChartDataResult {
  rows: Record<string, unknown>[];
  labelColumn: string;
  valueColumn: string;
}

interface JoinKey { factCol: string; dimCol: string }

/** Detect a FK→PK join key between a fact and dim table. */
function detectJoinKey(fact: TableInfo, dim: TableInfo): JoinKey | null {
  const factCols = fact.columns.map(c => c.name);
  const dimCols = dim.columns.map(c => c.name);
  const factSet = new Set(factCols);
  const dimSet = new Set(dimCols);

  // 1. Exact same column name on both sides — preferred (existing-PK star schema)
  //    Pick an id-looking column first, then any shared column.
  const sharedIdCol = factCols.find(c => dimSet.has(c) && isIdColumn(c));
  if (sharedIdCol) return { factCol: sharedIdCol, dimCol: sharedIdCol };

  // 2. Surrogate key: dim has "id", fact has "<dim.name>_id" exactly.
  //    e.g., dim "dim_date" + fact column "dim_date_id".
  if (dimSet.has('id')) {
    const exactFk = `${dim.name}_id`;
    if (factSet.has(exactFk)) return { factCol: exactFk, dimCol: 'id' };

    // Or fuzzy: any fact id-column whose base name matches the dim name's stem.
    const dimBase = dim.name.toLowerCase().replace(/^(dim_|lkp_)/, '').replace(/s$/, '');
    const factFk = factCols.find(c => {
      if (!isIdColumn(c)) return false;
      const colBase = extractBaseNameFromId(c).replace(/^(dim_|lkp_)/, '').replace(/s$/, '');
      return colBase === dimBase || colBase.includes(dimBase) || dimBase.includes(colBase);
    });
    if (factFk) return { factCol: factFk, dimCol: 'id' };
  }

  // 3. Last resort: any shared non-id column (unlikely to be useful, but try).
  const sharedAny = factCols.find(c => dimSet.has(c));
  if (sharedAny) return { factCol: sharedAny, dimCol: sharedAny };

  return null;
}

function dateGroupExpr(qualifiedCol: string, grouping: string): string {
  switch (grouping) {
    case 'yearly': return `CAST(EXTRACT(YEAR FROM ${qualifiedCol}) AS VARCHAR)`;
    case 'quarterly':
      return `CAST(EXTRACT(YEAR FROM ${qualifiedCol}) AS VARCHAR) || ' Q' || CAST(EXTRACT(QUARTER FROM ${qualifiedCol}) AS VARCHAR)`;
    case 'monthly':
      return `CAST(EXTRACT(YEAR FROM ${qualifiedCol}) AS VARCHAR) || '-' || LPAD(CAST(EXTRACT(MONTH FROM ${qualifiedCol}) AS VARCHAR), 2, '0')`;
    default: return qualifiedCol;
  }
}

/**
 * Run an aggregated chart-data query. Returns either the rows or an error
 * string. Shared between the auth-gated /chart/data endpoint and the public
 * /share/:token/widget-data endpoint, so the same validation/SQL is used in
 * both paths.
 */
export async function runChartDataQuery(
  cfg: ChartDataConfig
): Promise<ChartDataResult | { error: string }> {
  const {
    factTableId, labelTableId, labelColumn, valueColumn,
    aggregation = 'sum', topN = 0, dateGrouping = 'none', chartType,
  } = cfg;

  const fact = await duckdbService.getTableById(factTableId);
  if (!fact) return { error: 'Fact table not found' };

  const dim = labelTableId && labelTableId !== factTableId
    ? await duckdbService.getTableById(labelTableId)
    : null;

  let labelQualified: string;
  if (dim) {
    if (!dim.columns.some(c => c.name === labelColumn)) {
      return { error: `Column "${labelColumn}" not in table "${dim.name}"` };
    }
    labelQualified = `d."${labelColumn}"`;
  } else {
    if (!fact.columns.some(c => c.name === labelColumn)) {
      return { error: `Column "${labelColumn}" not in table "${fact.name}"` };
    }
    labelQualified = `f."${labelColumn}"`;
  }

  if (valueColumn && !fact.columns.some(c => c.name === valueColumn) && aggregation !== 'count') {
    return { error: `Column "${valueColumn}" not in table "${fact.name}"` };
  }

  const labelType = (dim ?? fact).columns.find(c => c.name === labelColumn)?.type;
  const isDate = labelType === 'DATE' || labelType === 'TIMESTAMP';
  const labelExpr = isDate && dateGrouping !== 'none'
    ? dateGroupExpr(labelQualified, dateGrouping)
    : labelQualified;

  let joinSql = '';
  if (dim) {
    const joinKey = detectJoinKey(fact, dim);
    if (!joinKey) {
      return { error: `Could not detect a join key between "${fact.name}" and "${dim.name}". Make sure they share a foreign-key column.` };
    }
    joinSql = `LEFT JOIN "${dim.name}" d ON f."${joinKey.factCol}" = d."${joinKey.dimCol}"`;
  }

  if (chartType === 'scatter') {
    if (!valueColumn) return { error: 'valueColumn required for scatter' };
    const limit = topN > 0 ? Math.min(topN, 5000) : 5000;
    const sql = `
      SELECT ${labelQualified} AS "${labelColumn}", f."${valueColumn}" AS "${valueColumn}"
      FROM "${fact.name}" f
      ${joinSql}
      WHERE ${labelQualified} IS NOT NULL AND f."${valueColumn}" IS NOT NULL
      LIMIT ${limit}
    `;
    const rows = await duckdbService.all(sql);
    return { rows, labelColumn, valueColumn };
  }

  const aggExpr = aggregation === 'count'
    ? 'COUNT(*)'
    : `${aggregation.toUpperCase()}(f."${valueColumn ?? '*'}")`;
  const aggAlias = valueColumn ?? 'count';
  const orderBy = isDate && dateGrouping !== 'none'
    ? `${labelExpr} ASC`
    : `${aggExpr} DESC`;
  const limitClause = topN > 0 ? `LIMIT ${Math.min(topN, 1000)}` : 'LIMIT 500';

  const sql = `
    SELECT ${labelExpr} AS "${labelColumn}", ${aggExpr} AS "${aggAlias}"
    FROM "${fact.name}" f
    ${joinSql}
    WHERE ${labelQualified} IS NOT NULL
    GROUP BY ${labelExpr}
    ORDER BY ${orderBy}
    ${limitClause}
  `;

  const rows = await duckdbService.all(sql);
  logger.info(
    `Chart data: ${fact.name}${dim ? ` ⨝ ${dim.name}` : ''} → ${rows.length} groups (${aggregation} of ${aggAlias})`
  );

  return { rows, labelColumn, valueColumn: aggAlias };
}

export const getChartData = asyncHandler(
  async (req: Request, res: Response) => {
    const validation = chartDataSchema.safeParse(req.body);
    if (!validation.success) {
      return sendBadRequest(res, validation.error.errors[0]?.message ?? 'Invalid request');
    }
    const result = await runChartDataQuery(validation.data);
    if ('error' in result) return sendBadRequest(res, result.error);
    return sendSuccess(res, result);
  }
);

