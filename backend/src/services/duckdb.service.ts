import { DuckDBInstance, DuckDBConnection, DuckDBValue } from '@duckdb/node-api';
import fs from 'fs';
import { config, getAbsolutePath } from '../config/index.js';
import logger from '../utils/logger.js';
import { TableInfo, PaginatedData, ColumnSchema } from '../types/index.js';

type Params = Record<string, DuckDBValue>;

class DuckDBService {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dbPath = getAbsolutePath(config.dbPath);
    logger.info(`Initializing DuckDB at: ${dbPath}`);

    this.instance = await DuckDBInstance.create(dbPath);
    this.connection = await this.instance.connect();

    // Create metadata table if not exists
    await this.run(`
      CREATE TABLE IF NOT EXISTS _table_metadata (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        original_file VARCHAR,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.initialized = true;
    logger.info('DuckDB initialized successfully');
  }

  private getConnection(): DuckDBConnection {
    if (!this.connection) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }
    return this.connection;
  }

  async run(sql: string, params?: Params): Promise<void> {
    const conn = this.getConnection();
    if (params) {
      await conn.run(sql, params);
    } else {
      await conn.run(sql);
    }
  }

  async all<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]> {
    const conn = this.getConnection();
    const reader = params
      ? await conn.runAndReadAll(sql, params)
      : await conn.runAndReadAll(sql);
    return reader.getRowObjects() as T[];
  }

  async importCSV(filePath: string, tableName: string): Promise<void> {
    try {
      const sql = `CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${filePath}', header=true, sample_size=-1)`;
      await this.run(sql);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('utf-8') || msg.includes('unicode') || msg.includes('byte sequence')) {
        // Sanitize: read as binary, decode with Windows-1252 (superset of latin-1), write back as UTF-8
        logger.warn(`File is not UTF-8, sanitizing encoding for: ${filePath}`);
        const buf = fs.readFileSync(filePath);
        const decoded = new TextDecoder('windows-1252').decode(buf);
        fs.writeFileSync(filePath, decoded, 'utf-8');
        const sql = `CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${filePath}', header=true, sample_size=-1)`;
        await this.run(sql);
      } else {
        throw err;
      }
    }
    logger.info(`Imported CSV to table: ${tableName}`);
  }

  async createTableFromData(
    tableName: string,
    columns: ColumnSchema[],
    data: Record<string, unknown>[]
  ): Promise<void> {
    const conn = this.getConnection();

    // Generate CREATE TABLE SQL
    const columnDefs = columns
      .map((col) => `"${col.name}" ${col.type}`)
      .join(', ');

    await conn.run(`CREATE TABLE "${tableName}" (${columnDefs})`);

    // Insert data in batches
    if (data.length > 0) {
      const colNames = columns.map((c) => `"${c.name}"`).join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`;

      for (const row of data) {
        const values: Params = {};
        columns.forEach((col, i) => {
          let val = row[col.name];
          if (val === undefined || val === '') val = null;
          values[String(i + 1)] = val as DuckDBValue;
        });
        await conn.run(insertSql, values);
      }
    }

    logger.info(`Created table ${tableName} with ${data.length} rows`);
  }

  async registerTable(id: string, name: string, originalFile?: string): Promise<void> {
    await this.run(
      `INSERT INTO _table_metadata (id, name, original_file) VALUES ($1, $2, $3)`,
      { '1': id, '2': name, '3': originalFile || null }
    );
  }

  async listTables(): Promise<TableInfo[]> {
    const tables = await this.all<{ id: string; name: string; created_at: string }>(
      `SELECT id, name, created_at FROM _table_metadata ORDER BY created_at DESC`
    );

    const result: TableInfo[] = [];

    for (const table of tables) {
      try {
        const columns = await this.getTableColumns(table.name);
        const countResult = await this.all<{ count: bigint }>(
          `SELECT COUNT(*) as count FROM "${table.name}"`
        );

        result.push({
          id: table.id,
          name: table.name,
          columnCount: columns.length,
          rowCount: Number(countResult[0]?.count || 0),
          createdAt: String(table.created_at),
          columns,
        });
      } catch (err) {
        logger.warn(`Could not get info for table ${table.name}:`, err);
      }
    }

    return result;
  }

  async getTableById(tableId: string): Promise<TableInfo | null> {
    const rows = await this.all<{ id: string; name: string; created_at: string }>(
      `SELECT id, name, created_at FROM _table_metadata WHERE id = $1`,
      { '1': tableId }
    );

    if (rows.length === 0) return null;

    const table = rows[0];
    const columns = await this.getTableColumns(table.name);
    const countResult = await this.all<{ count: bigint }>(
      `SELECT COUNT(*) as count FROM "${table.name}"`
    );

    return {
      id: table.id,
      name: table.name,
      columnCount: columns.length,
      rowCount: Number(countResult[0]?.count || 0),
      createdAt: String(table.created_at),
      columns,
    };
  }

  async getTableByName(tableName: string): Promise<TableInfo | null> {
    const rows = await this.all<{ id: string; name: string; created_at: string }>(
      `SELECT id, name, created_at FROM _table_metadata WHERE name = $1`,
      { '1': tableName }
    );

    if (rows.length === 0) return null;

    const table = rows[0];
    const columns = await this.getTableColumns(table.name);
    const countResult = await this.all<{ count: bigint }>(
      `SELECT COUNT(*) as count FROM "${table.name}"`
    );

    return {
      id: table.id,
      name: table.name,
      columnCount: columns.length,
      rowCount: Number(countResult[0]?.count || 0),
      createdAt: String(table.created_at),
      columns,
    };
  }

  async getTableColumns(tableName: string): Promise<ColumnSchema[]> {
    const columns = await this.all<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = $1`,
      { '1': tableName }
    );

    return columns.map((col) => ({
      name: col.column_name,
      type: this.mapDuckDBType(col.data_type),
      nullable: col.is_nullable === 'YES',
      sample: [],
    }));
  }

  private mapDuckDBType(duckType: string): ColumnSchema['type'] {
    const upper = duckType.toUpperCase();
    if (upper.includes('INT')) return 'INTEGER';
    if (upper.includes('DECIMAL') || upper.includes('DOUBLE') || upper.includes('FLOAT')) return 'DECIMAL';
    if (upper === 'DATE') return 'DATE';
    if (upper.includes('TIMESTAMP')) return 'TIMESTAMP';
    if (upper === 'BOOLEAN') return 'BOOLEAN';
    return 'VARCHAR';
  }

  async getTableData(
    tableName: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedData> {
    const offset = (page - 1) * pageSize;
    const limit = Math.max(1, Math.min(1000, pageSize));
    const safeOffset = Math.max(0, offset);

    const data = await this.all(
      `SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${safeOffset}`
    );

    const countResult = await this.all<{ count: bigint }>(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );
    const totalRows = Number(countResult[0]?.count || 0);

    return {
      data,
      page,
      pageSize,
      totalRows,
      totalPages: Math.ceil(totalRows / pageSize),
    };
  }

  async deleteTable(tableId: string): Promise<boolean> {
    const table = await this.getTableById(tableId);
    if (!table) return false;

    await this.run(`DROP TABLE IF EXISTS "${table.name}"`);
    await this.run(`DELETE FROM _table_metadata WHERE id = $1`, { '1': tableId });

    logger.info(`Deleted table: ${table.name}`);
    return true;
  }

  async getColumnStats(
    tableName: string,
    columnName: string
  ): Promise<{ uniqueCount: number; totalRows: number; topValues: { value: string; count: number }[] }> {
    const uniqueResult = await this.all<{ count: bigint }>(
      `SELECT COUNT(DISTINCT "${columnName}") as count FROM "${tableName}"`
    );

    const totalResult = await this.all<{ count: bigint }>(
      `SELECT COUNT(*) as count FROM "${tableName}"`
    );

    const topValues = await this.all<{ value: string; count: bigint }>(
      `SELECT CAST("${columnName}" AS VARCHAR) as value, COUNT(*) as count
       FROM "${tableName}"
       GROUP BY "${columnName}"
       ORDER BY count DESC
       LIMIT 10`
    );

    return {
      uniqueCount: Number(uniqueResult[0]?.count || 0),
      totalRows: Number(totalResult[0]?.count || 0),
      topValues: topValues.map((v) => ({ value: String(v.value), count: Number(v.count) })),
    };
  }

  /**
   * Find a natural primary key column within a group of columns.
   * A column qualifies if its unique count equals the number of distinct
   * combinations of all columns in the group — meaning it alone can
   * uniquely identify each row in the dimension.
   * Works regardless of column naming or language.
   */
  async findNaturalKey(
    tableName: string,
    columns: string[]
  ): Promise<string | null> {
    if (columns.length <= 1) return null;

    // Count distinct combinations of all columns in the group
    const allCols = columns.map(c => `"${c}"`).join(', ');
    const distinctResult = await this.all<{ count: bigint }>(
      `SELECT COUNT(*) as count FROM (SELECT DISTINCT ${allCols} FROM "${tableName}")`
    );
    const distinctCombinations = Number(distinctResult[0]?.count || 0);
    if (distinctCombinations === 0) return null;

    // Check each column: if its distinct count matches the group's distinct count,
    // it can uniquely identify each dimension row
    for (const col of columns) {
      const colResult = await this.all<{ count: bigint }>(
        `SELECT COUNT(DISTINCT "${col}") as count FROM "${tableName}" WHERE "${col}" IS NOT NULL`
      );
      const colUnique = Number(colResult[0]?.count || 0);
      if (colUnique === distinctCombinations) {
        return col;
      }
    }

    return null;
  }

  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.all<{ count: bigint }>(
      `SELECT COUNT(*) as count FROM _table_metadata WHERE name = $1`,
      { '1': tableName }
    );
    return Number(result[0]?.count || 0) > 0;
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.closeSync();
      this.connection = null;
    }
    if (this.instance) {
      this.instance = null;
    }
    this.initialized = false;
    logger.info('DuckDB connection closed');
  }
}

export const duckdbService = new DuckDBService();
export default duckdbService;
