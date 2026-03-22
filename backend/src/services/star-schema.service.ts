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

class StarSchemaService {
  async analyze(tableId: string): Promise<StarSchemaRecommendation> {
    const table = await duckdbService.getTableById(tableId);
    if (!table) {
      throw new Error(`Table with ID ${tableId} not found`);
    }

    // Get sample data for AI analysis
    const paginated = await duckdbService.getTableData(table.name, 1, 20);

    // Call Groq AI for recommendations
    const aiResult = await groqService.analyzeForStarSchema(
      table.name,
      table.columns,
      paginated.data
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

      // Check if dimension table already exists
      if (await duckdbService.tableExists(dim.dimensionName)) {
        logger.warn(`Dimension table ${dim.dimensionName} already exists, skipping`);
        continue;
      }

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
        `dimension_from_${originalTableName}`
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
