import { v4 as uuidv4 } from 'uuid';
import { duckdbService } from './duckdb.service.js';
import { groqService } from './groq.service.js';
import {
  StarSchemaRecommendation,
  StarSchemaResult,
  DimensionRecommendation,
} from '../types/index.js';
import logger from '../utils/logger.js';
import { findIdColumn } from '../utils/key-detection.js';
import { getCurrentDatabaseId } from '../middleware/auth.js';

/**
 * Find a table name that isn't taken by any existing table in the user's
 * DuckDB. Tries the requested name first, then appends `_2`, `_3`, ... until
 * an unused name is found.
 */
async function findUnusedTableName(desiredName: string): Promise<string> {
  if (!(await duckdbService.tableExists(desiredName))) return desiredName;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${desiredName}_${n}`;
    if (!(await duckdbService.tableExists(candidate))) return candidate;
  }
  throw new Error(`Could not find an unused name for "${desiredName}"`);
}

class StarSchemaService {
  async analyze(tableId: string): Promise<StarSchemaRecommendation> {
    const table = await duckdbService.getTableById(tableId);
    if (!table) {
      throw new Error(`Table with ID ${tableId} not found`);
    }

    // Random sample + per-column stats give the AI a representative picture
    // of cardinality and value distribution rather than just the first N rows.
    const [sampleRows, columnStats] = await Promise.all([
      duckdbService.getRandomSample(table.name, 15),
      duckdbService.getMultiColumnStats(table.name, table.columns.map(c => c.name)),
    ]);

    const aiResult = await groqService.analyzeForStarSchema(
      table.name,
      table.columns,
      sampleRows,
      columnStats
    );

    // Build foreign key list (one per dimension)
    // Use existing PK column name if detected, otherwise use surrogate <dim>_id
    const foreignKeys = aiResult.dimensions.map(
      (d) => d.primaryKey || `${d.dimensionName}_id`
    );

    return {
      tableId,
      tableName: table.name,
      factTable: {
        name: aiResult.factTable.name,
        measures: aiResult.factTable.measures,
        foreignKeys,
        description: aiResult.factTable.description,
      },
      dimensions: aiResult.dimensions,
      aiExplanation: aiResult.explanation,
    };
  }

  async apply(
    tableId: string,
    factTableName: string,
    measures: string[],
    dimensions: DimensionRecommendation[]
  ): Promise<StarSchemaResult> {
    const table = await duckdbService.getTableById(tableId);
    if (!table) {
      throw new Error(`Table with ID ${tableId} not found`);
    }

    const originalTableName = table.name;
    const dimensionTablesCreated: string[] = [];
    const allDimColumns: string[] = [];
    const databaseId = getCurrentDatabaseId();

    // Step 0: Preserve a snapshot of the original table for charting
    const snapshotName = `original_${originalTableName}`;
    if (!(await duckdbService.tableExists(snapshotName))) {
      await duckdbService.run(
        `CREATE TABLE "${snapshotName}" AS SELECT * FROM "${originalTableName}"`
      );
      const snapshotId = uuidv4();
      await duckdbService.registerTable(snapshotId, snapshotName, `snapshot_of_${originalTableName}`, databaseId);
      logger.info(`Preserved original table as "${snapshotName}" for charting`);
    }

    // Track dimension info for building the fact table
    const dimJoinInfo: {
      dimTable: string;
      columns: string[];
      alias: string;
      existingPK: string | null;
    }[] = [];

    // Step 1: Create dimension tables
    for (let i = 0; i < dimensions.length; i++) {
      const dim = dimensions[i];

      // Filter to only columns that exist in the source table
      const validColumns = dim.columns.filter((colName) =>
        table.columns.some((c) => c.name === colName)
      );

      if (validColumns.length === 0) {
        logger.warn(`No valid columns for dimension ${dim.dimensionName}, skipping`);
        continue;
      }

      // Resolve a unique name. Table names are unique per-user across the
      // whole DuckDB file, so a collision can come from a sibling database or
      // an orphan left by an earlier failed apply. Auto-suffix instead of
      // silently skipping (which leaves the new database with zero dims).
      const resolvedDimName = await findUnusedTableName(dim.dimensionName);
      if (resolvedDimName !== dim.dimensionName) {
        logger.info(
          `Dimension name "${dim.dimensionName}" already exists — using "${resolvedDimName}" instead`
        );
      }
      dim.dimensionName = resolvedDimName;

      const selectCols = validColumns.map((c) => `"${c}"`).join(', ');
      const whereClause = validColumns
        .map((c) => `"${c}" IS NOT NULL`)
        .join(' OR ');

      // Check if the dimension has an existing primary key column:
      // 1. Use explicitly provided primaryKey if valid
      // 2. Otherwise, auto-detect from column names (e.g., "Customer ID", "Product_ID")
      // 3. Otherwise, data-driven: find a column whose unique count matches the group's distinct count
      let existingPK = (dim.primaryKey && validColumns.includes(dim.primaryKey))
        ? dim.primaryKey
        : (findIdColumn(validColumns) || null);

      if (!existingPK && validColumns.length > 1) {
        existingPK = await duckdbService.findNaturalKey(originalTableName, validColumns);
        if (existingPK) {
          logger.info(`Data-driven PK detected for ${dim.dimensionName}: "${existingPK}"`);
        }
      }

      if (existingPK) {
        // Use existing primary key — no surrogate key needed
        await duckdbService.run(`
          CREATE TABLE "${dim.dimensionName}" AS
          SELECT DISTINCT ${selectCols}
          FROM "${originalTableName}" WHERE ${whereClause}
        `);
      } else {
        // No existing key — generate surrogate key
        await duckdbService.run(`
          CREATE TABLE "${dim.dimensionName}" AS
          SELECT
            ROW_NUMBER() OVER (ORDER BY ${selectCols}) as id,
            ${selectCols}
          FROM (SELECT DISTINCT ${selectCols} FROM "${originalTableName}" WHERE ${whereClause})
        `);
      }

      // Register in metadata
      const dimId = uuidv4();
      await duckdbService.registerTable(
        dimId,
        dim.dimensionName,
        `dimension_from_${originalTableName}`,
        databaseId
      );

      dimensionTablesCreated.push(dim.dimensionName);
      allDimColumns.push(...validColumns);
      dimJoinInfo.push({
        dimTable: dim.dimensionName,
        columns: validColumns,
        alias: `dim_${i}`,
        existingPK: existingPK,
      });

      logger.info(
        `Created dimension table: ${dim.dimensionName} with columns: ${validColumns.join(', ')}`
      );
    }

    // Step 2: Create the fact table (original table transformed)
    // Measures stay as-is, dimension columns get replaced with foreign keys
    const selectColumns: string[] = [];
    const joinClauses: string[] = [];
    const processedCols = new Set<string>();

    // Add foreign keys for each dimension
    for (const info of dimJoinInfo) {
      if (info.existingPK) {
        // Use the existing primary key as the foreign key — no join needed
        // The FK column stays in the fact table as-is, other dim columns are removed
        for (const c of info.columns) {
          if (c === info.existingPK) {
            // Keep the existing FK column in the fact table
            selectColumns.push(`t."${c}"`);
          }
          processedCols.add(c);
        }
      } else {
        // No existing key — join on dimension columns and use surrogate id
        selectColumns.push(`${info.alias}.id as ${info.dimTable}_id`);

        const joinConditions = info.columns
          .map((c) => `t."${c}" = ${info.alias}."${c}"`)
          .join(' AND ');
        joinClauses.push(
          `LEFT JOIN "${info.dimTable}" ${info.alias} ON ${joinConditions}`
        );

        for (const c of info.columns) {
          processedCols.add(c);
        }
      }
    }

    // Add measures and any remaining columns
    for (const col of table.columns) {
      if (!processedCols.has(col.name)) {
        selectColumns.push(`t."${col.name}"`);
      }
    }

    const tempFactName = `_temp_${factTableName}`;

    await duckdbService.run(`
      CREATE TABLE "${tempFactName}" AS
      SELECT ${selectColumns.join(', ')}
      FROM "${originalTableName}" t
      ${joinClauses.join('\n      ')}
    `);

    // Drop the original table
    await duckdbService.run(`DROP TABLE "${originalTableName}"`);

    // Rename fact table to the desired name
    await duckdbService.run(
      `ALTER TABLE "${tempFactName}" RENAME TO "${factTableName}"`
    );

    // Update metadata: the original table ID now points to the fact table
    await duckdbService.run(
      `UPDATE _table_metadata SET name = $1 WHERE id = $2`,
      { '1': factTableName, '2': tableId }
    );

    logger.info(
      `Star schema created: fact table "${factTableName}" with ${dimensionTablesCreated.length} dimension tables`
    );

    const factInfo = await duckdbService.getTableById(tableId);

    return {
      success: true,
      factTable: factTableName,
      dimensionTables: dimensionTablesCreated,
      columnsProcessed: [...allDimColumns, ...measures],
      rowsAffected: factInfo?.rowCount || 0,
    };
  }
}

export const starSchemaService = new StarSchemaService();
export default starSchemaService;
