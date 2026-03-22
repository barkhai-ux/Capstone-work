import { ColumnSchema } from '../types/index.js';
import logger from '../utils/logger.js';

class SchemaDetectorService {
  detectSchema(
    data: Record<string, unknown>[],
    columns: string[]
  ): ColumnSchema[] {
    if (data.length === 0) {
      return columns.map((name) => ({
        name,
        type: 'VARCHAR',
        nullable: true,
        sample: [],
      }));
    }

    // Sample up to 1000 rows for type inference
    const sampleSize = Math.min(data.length, 1000);
    const sampleData = data.slice(0, sampleSize);

    return columns.map((columnName) => {
      const values = sampleData
        .map((row) => row[columnName])
        .filter((v) => v !== null && v !== undefined && v !== '');

      const sample = values.slice(0, 5);
      const type = this.inferType(values);
      const nullable = values.length < sampleData.length;

      return {
        name: columnName,
        type,
        nullable,
        sample,
      };
    });
  }

  private inferType(values: unknown[]): ColumnSchema['type'] {
    if (values.length === 0) return 'VARCHAR';

    const typeCounts = {
      INTEGER: 0,
      DECIMAL: 0,
      BOOLEAN: 0,
      DATE: 0,
      TIMESTAMP: 0,
      VARCHAR: 0,
    };

    for (const value of values) {
      const type = this.detectValueType(value);
      typeCounts[type]++;
    }

    // Determine majority type (need at least 80% agreement)
    const total = values.length;
    const threshold = total * 0.8;

    if (typeCounts.INTEGER >= threshold) return 'INTEGER';
    if (typeCounts.DECIMAL >= threshold) return 'DECIMAL';
    if (typeCounts.INTEGER + typeCounts.DECIMAL >= threshold) return 'DECIMAL';
    if (typeCounts.BOOLEAN >= threshold) return 'BOOLEAN';
    if (typeCounts.TIMESTAMP >= threshold) return 'TIMESTAMP';
    if (typeCounts.DATE >= threshold) return 'DATE';

    return 'VARCHAR';
  }

  private detectValueType(value: unknown): ColumnSchema['type'] {
    if (typeof value === 'boolean') return 'BOOLEAN';

    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'INTEGER' : 'DECIMAL';
    }

    if (typeof value !== 'string') return 'VARCHAR';

    const str = value.trim();

    // Check for boolean strings
    if (['true', 'false', 'yes', 'no', '1', '0'].includes(str.toLowerCase())) {
      return 'BOOLEAN';
    }

    // Check for integer
    if (/^-?\d+$/.test(str)) {
      const num = parseInt(str, 10);
      if (num >= -2147483648 && num <= 2147483647) {
        return 'INTEGER';
      }
    }

    // Check for decimal
    if (/^-?\d*\.?\d+$/.test(str)) {
      return 'DECIMAL';
    }

    // Check for timestamp (ISO format with time)
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/.test(str)) {
      return 'TIMESTAMP';
    }

    // Check for date formats
    if (this.isValidDate(str)) {
      return 'DATE';
    }

    return 'VARCHAR';
  }

  private isValidDate(str: string): boolean {
    // ISO date format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const date = new Date(str);
      return !isNaN(date.getTime());
    }

    // US format: MM/DD/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const [month, day, year] = str.split('/').map(Number);
      const date = new Date(year, month - 1, day);
      return !isNaN(date.getTime());
    }

    // EU format: DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const [day, month, year] = str.split('/').map(Number);
      const date = new Date(year, month - 1, day);
      return !isNaN(date.getTime());
    }

    return false;
  }

  generateCreateTableSQL(tableName: string, columns: ColumnSchema[]): string {
    const columnDefs = columns
      .map((col) => {
        const nullConstraint = col.nullable ? '' : ' NOT NULL';
        return `  "${col.name}" ${col.type}${nullConstraint}`;
      })
      .join(',\n');

    return `CREATE TABLE "${tableName}" (\n${columnDefs}\n);`;
  }

  sanitizeTableName(name: string): string {
    // Remove file extension
    let sanitized = name.replace(/\.[^.]+$/, '');

    // Replace spaces and special chars with underscores
    sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');

    // Remove consecutive underscores
    sanitized = sanitized.replace(/_+/g, '_');

    // Remove leading/trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');

    // Ensure it starts with a letter
    if (!/^[a-zA-Z]/.test(sanitized)) {
      sanitized = 't_' + sanitized;
    }

    // Truncate if too long
    if (sanitized.length > 63) {
      sanitized = sanitized.substring(0, 63);
    }

    return sanitized.toLowerCase();
  }
}

export const schemaDetectorService = new SchemaDetectorService();
export default schemaDetectorService;
