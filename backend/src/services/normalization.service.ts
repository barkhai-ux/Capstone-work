import { v4 as uuidv4 } from 'uuid';
import { duckdbService } from './duckdb.service.js';
import { groqService } from './groq.service.js';
import {
  NormalizationCandidate,
  NormalizationDimensionGroup,
  NormalizationAnalysis,
  NormalizationResult,
} from '../types/index.js';
import logger from '../utils/logger.js';
import { findIdColumn } from '../utils/key-detection.js';

class NormalizationService {
  async analyzeTable(tableId: string): Promise<NormalizationAnalysis> {
    const table = await duckdbService.getTableById(tableId);
    if (!table) {
      throw new Error(`Table with ID ${tableId} not found`);
    }

    // Gather column stats for AI context
    const columnStats: { column: string; uniqueCount: number; totalRows: number; topValues: { value: string; count: number }[] }[] = [];
    for (const column of table.columns) {
      const stats = await duckdbService.getColumnStats(table.name, column.name);
      columnStats.push({ column: column.name, ...stats });
    }

    // Get sample data
    const paginated = await duckdbService.getTableData(table.name, 1, 20);

    // Ask Groq AI for recommendations
    const aiResult = await groqService.analyzeForNormalization(
      table.name,
      table.columns,
      paginated.data,
      columnStats
    );

    // Merge AI recommendations with actual stats for legacy candidates
    const candidates: NormalizationCandidate[] = aiResult.candidates.map((c) => {
      const stats = columnStats.find((s) => s.column === c.column);
      const totalRows = stats?.totalRows || 0;
      const uniqueCount = stats?.uniqueCount || 0;
      const repetitionRate = totalRows > 0
        ? ((totalRows - uniqueCount) / totalRows) * 100
        : 0;

      return {
        column: c.column,
        repetitionRate: Math.round(repetitionRate * 100) / 100,
        uniqueCount,
        totalRows,
        confidence: c.confidence,
        suggestedLookupTable: c.suggestedLookupTable,
        estimatedSavings: 0,
        topValues: stats?.topValues || [],
      };
    });

    // Build dimension groups with stats from actual data
    const dimensions: NormalizationDimensionGroup[] = aiResult.dimensions.map((dim) => {
      // Filter to only columns that actually exist in the table
      const validColumns = dim.columns.filter((colName) =>
        table.columns.some((c) => c.name === colName)
      );

      // Calculate per-column stats
      const dimColumnStats = validColumns.map((colName) => {
        const stats = columnStats.find((s) => s.column === colName);
        const totalRows = stats?.totalRows || 0;
        const uniqueCount = stats?.uniqueCount || 0;
        const repetitionRate = totalRows > 0
          ? Math.round(((totalRows - uniqueCount) / totalRows) * 10000) / 100
          : 0;
        return { column: colName, uniqueCount, totalRows, repetitionRate };
      });

      // Group repetition rate = avg of individual columns
      const avgRepetition = dimColumnStats.length > 0
        ? Math.round(
            (dimColumnStats.reduce((sum, s) => sum + s.repetitionRate, 0) / dimColumnStats.length) * 100
          ) / 100
        : 0;

      return {
        name: dim.name,
        columns: validColumns,
        primaryKey: dim.primaryKey || undefined,
        repetitionRate: avgRepetition,
        confidence: dim.confidence,
        description: dim.description,
        columnStats: dimColumnStats,
      };
    }).filter((dim) => dim.columns.length > 0);

    return {
      tableId,
      tableName: table.name,
      candidates,
      dimensions,
      factColumns: aiResult.factColumns,
      overallRecommendation: aiResult.overallRecommendation,
    };
  }

  async applyNormalization(
    tableId: string,
    columns: string[]
  ): Promise<NormalizationResult> {
    const table = await duckdbService.getTableById(tableId);
    if (!table) {
      throw new Error(`Table with ID ${tableId} not found`);
    }

    const lookupTablesCreated: string[] = [];
    const columnsNormalized: string[] = [];
    const lookupTableMap: Map<string, string> = new Map(); // columnName -> lookupTableName

    // Step 1: Create lookup tables for each column (or reuse existing ones)
    for (const columnName of columns) {
      const column = table.columns.find((c) => c.name === columnName);
      if (!column) {
        logger.warn(`Column ${columnName} not found in table ${table.name}`);
        continue;
      }

      const lookupTableName = `lkp_${columnName.toLowerCase()}`;

      // Check if lookup table already exists
      if (await duckdbService.tableExists(lookupTableName)) {
        logger.info(`Reusing existing lookup table ${lookupTableName}`);
        // Still add to map for fact table creation
        columnsNormalized.push(columnName);
        lookupTableMap.set(columnName, lookupTableName);
        continue;
      }

      // Create lookup table with unique values
      await duckdbService.run(`
        CREATE TABLE "${lookupTableName}" AS
        SELECT
          ROW_NUMBER() OVER (ORDER BY "${columnName}") as id,
          "${columnName}" as value
        FROM (SELECT DISTINCT "${columnName}" FROM "${table.name}" WHERE "${columnName}" IS NOT NULL)
      `);

      // Register lookup table in metadata
      const lookupId = uuidv4();
      await duckdbService.registerTable(lookupId, lookupTableName, `normalized_from_${table.name}`);

      lookupTablesCreated.push(lookupTableName);
      columnsNormalized.push(columnName);
      lookupTableMap.set(columnName, lookupTableName);

      logger.info(`Created lookup table: ${lookupTableName} for column ${columnName}`);
    }

    // Step 2: Replace original table with normalized version (foreign keys instead of strings)
    if (columnsNormalized.length > 0) {
      const tempTableName = `_temp_normalized_${table.name}`;
      const originalTableName = table.name;

      // Build the SELECT clause for the normalized table
      const selectColumns: string[] = [];
      const joinClauses: string[] = [];

      for (const col of table.columns) {
        if (lookupTableMap.has(col.name)) {
          // Replace with foreign key ID from lookup table
          const lookupTable = lookupTableMap.get(col.name)!;
          const alias = `lkp_${col.name}`;
          selectColumns.push(`${alias}.id as ${col.name}_id`);
          joinClauses.push(`LEFT JOIN "${lookupTable}" ${alias} ON t."${col.name}" = ${alias}.value`);
        } else {
          // Keep original column
          selectColumns.push(`t."${col.name}"`);
        }
      }

      // Create the normalized table with a temp name
      const createNormalizedSQL = `
        CREATE TABLE "${tempTableName}" AS
        SELECT ${selectColumns.join(', ')}
        FROM "${originalTableName}" t
        ${joinClauses.join('\n        ')}
      `;

      await duckdbService.run(createNormalizedSQL);
      logger.info(`Created temporary normalized table: ${tempTableName}`);

      // Drop the original table
      await duckdbService.run(`DROP TABLE "${originalTableName}"`);
      logger.info(`Dropped original table: ${originalTableName}`);

      // Rename temp table to original name
      await duckdbService.run(`ALTER TABLE "${tempTableName}" RENAME TO "${originalTableName}"`);
      logger.info(`Renamed ${tempTableName} to ${originalTableName}`);

      // Update metadata - the table ID stays the same, just the structure changed
      logger.info(`Normalized table ${originalTableName} - replaced string columns with foreign keys`);
    }

    // Get total rows affected
    const tableInfo = await duckdbService.getTableById(tableId);
    const rowsAffected = tableInfo?.rowCount || 0;

    return {
      success: true,
      originalTable: table.name,
      lookupTablesCreated,
      columnsNormalized,
      rowsAffected,
    };
  }
  /**
   * Apply normalization with dimension tables (grouping related columns together)
   * Example: User_Name + Age -> dim_customer table
   */
  async applyDimensionNormalization(
    tableId: string,
    dimensions: { name: string; columns: string[]; primaryKey?: string }[]
  ): Promise<NormalizationResult> {
    const table = await duckdbService.getTableById(tableId);
    if (!table) {
      throw new Error(`Table with ID ${tableId} not found`);
    }

    const dimensionTablesCreated: string[] = [];
    const columnsNormalized: string[] = [];
    // Map from original column name to { dimTable, keyColumn, existingPK }
    const columnToDimension: Map<string, { dimTable: string; keyColumn: string; existingPK: string | null }> = new Map();
    // Track which dimension tables have existing PKs
    const dimExistingPKs: Map<string, string | null> = new Map();

    // Step 1: Create dimension tables for each group
    for (const dim of dimensions) {
      const dimTableName = dim.name;
      const dimColumns = dim.columns.filter(colName =>
        table.columns.some(c => c.name === colName)
      );

      if (dimColumns.length === 0) {
        logger.warn(`No valid columns found for dimension ${dimTableName}`);
        continue;
      }

      // Check if dimension has an existing primary key:
      // 1. Use explicitly provided primaryKey if valid
      // 2. Otherwise, auto-detect from column names (e.g., "Customer ID", "Product_ID")
      // 3. Otherwise, data-driven: find a column whose unique count matches the group's distinct count
      let existingPK = (dim.primaryKey && dimColumns.includes(dim.primaryKey))
        ? dim.primaryKey
        : (findIdColumn(dimColumns) || null);

      if (!existingPK && dimColumns.length > 1) {
        existingPK = await duckdbService.findNaturalKey(table.name, dimColumns);
        if (existingPK) {
          logger.info(`Data-driven PK detected for ${dimTableName}: "${existingPK}"`);
        }
      }

      // Check if dimension table already exists
      if (await duckdbService.tableExists(dimTableName)) {
        logger.info(`Reusing existing dimension table ${dimTableName}`);
        dimExistingPKs.set(dimTableName, existingPK);
        for (const colName of dimColumns) {
          columnsNormalized.push(colName);
          columnToDimension.set(colName, { dimTable: dimTableName, keyColumn: existingPK || `${dimTableName}_id`, existingPK });
        }
        continue;
      }

      const selectCols = dimColumns.map(c => `"${c}"`).join(', ');
      const whereClause = dimColumns.map(c => `"${c}" IS NOT NULL`).join(' AND ');

      let createDimSQL: string;
      if (existingPK) {
        // Use existing primary key — no surrogate key needed
        createDimSQL = `
          CREATE TABLE "${dimTableName}" AS
          SELECT DISTINCT ${selectCols}
          FROM "${table.name}" WHERE ${whereClause}
        `;
      } else {
        // No existing key — generate surrogate key
        createDimSQL = `
          CREATE TABLE "${dimTableName}" AS
          SELECT
            ROW_NUMBER() OVER (ORDER BY ${selectCols}) as id,
            ${selectCols}
          FROM (SELECT DISTINCT ${selectCols} FROM "${table.name}" WHERE ${whereClause})
        `;
      }

      await duckdbService.run(createDimSQL);

      // Register dimension table in metadata
      const dimId = uuidv4();
      await duckdbService.registerTable(dimId, dimTableName, `dimension_from_${table.name}`);

      dimensionTablesCreated.push(dimTableName);
      dimExistingPKs.set(dimTableName, existingPK);

      for (const colName of dimColumns) {
        columnsNormalized.push(colName);
        columnToDimension.set(colName, { dimTable: dimTableName, keyColumn: existingPK || `${dimTableName}_id`, existingPK });
      }

      logger.info(`Created dimension table: ${dimTableName} with columns: ${dimColumns.join(', ')}${existingPK ? ` (using existing PK: ${existingPK})` : ' (surrogate key)'}`);

    }

    // Step 2: Replace original table with normalized version
    if (columnsNormalized.length > 0) {
      const tempTableName = `_temp_normalized_${table.name}`;
      const originalTableName = table.name;

      // Group columns by their dimension table for JOIN clauses
      const dimTableJoins: Map<string, { columns: string[]; alias: string }> = new Map();
      for (const [colName, dimInfo] of columnToDimension) {
        if (!dimTableJoins.has(dimInfo.dimTable)) {
          dimTableJoins.set(dimInfo.dimTable, { columns: [], alias: `dim_${dimTableJoins.size}` });
        }
        dimTableJoins.get(dimInfo.dimTable)!.columns.push(colName);
      }

      // Build SELECT and JOIN clauses
      const selectColumns: string[] = [];
      const joinClauses: string[] = [];
      const processedDimTables = new Set<string>();

      for (const col of table.columns) {
        if (columnToDimension.has(col.name)) {
          const dimInfo = columnToDimension.get(col.name)!;

          // Only add the foreign key once per dimension table
          if (!processedDimTables.has(dimInfo.dimTable)) {
            const existingPK = dimExistingPKs.get(dimInfo.dimTable);

            if (existingPK) {
              // Existing PK found — keep the FK column as-is, no join needed
              selectColumns.push(`t."${existingPK}"`);
            } else {
              // No existing key — join and use surrogate id
              const joinInfo = dimTableJoins.get(dimInfo.dimTable)!;
              selectColumns.push(`${joinInfo.alias}.id as ${dimInfo.keyColumn}`);

              const joinConditions = joinInfo.columns
                .map(c => `t."${c}" = ${joinInfo.alias}."${c}"`)
                .join(' AND ');
              joinClauses.push(`LEFT JOIN "${dimInfo.dimTable}" ${joinInfo.alias} ON ${joinConditions}`);
            }

            processedDimTables.add(dimInfo.dimTable);
          }
          // Skip individual columns that are now in dimension tables
        } else {
          // Keep original column
          selectColumns.push(`t."${col.name}"`);
        }
      }

      // Create the normalized table
      const createNormalizedSQL = `
        CREATE TABLE "${tempTableName}" AS
        SELECT ${selectColumns.join(', ')}
        FROM "${originalTableName}" t
        ${joinClauses.join('\n        ')}
      `;

      await duckdbService.run(createNormalizedSQL);
      logger.info(`Created temporary normalized table: ${tempTableName}`);

      // Drop the original table
      await duckdbService.run(`DROP TABLE "${originalTableName}"`);
      logger.info(`Dropped original table: ${originalTableName}`);

      // Rename temp table to original name
      await duckdbService.run(`ALTER TABLE "${tempTableName}" RENAME TO "${originalTableName}"`);
      logger.info(`Renamed ${tempTableName} to ${originalTableName}`);

      logger.info(`Normalized table ${originalTableName} with dimension tables`);
    }

    // Get total rows affected
    const tableInfo = await duckdbService.getTableById(tableId);
    const rowsAffected = tableInfo?.rowCount || 0;

    return {
      success: true,
      originalTable: table.name,
      lookupTablesCreated: dimensionTablesCreated,
      columnsNormalized,
      rowsAffected,
    };
  }
}

export const normalizationService = new NormalizationService();
export default normalizationService;
