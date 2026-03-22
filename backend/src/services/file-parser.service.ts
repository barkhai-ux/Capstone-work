import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import logger from '../utils/logger.js';

export interface ParseResult {
  data: Record<string, unknown>[];
  columns: string[];
  totalRows: number;
  fileType: 'csv' | 'excel' | 'json';
}

class FileParserService {
  async parseFile(filePath: string): Promise<ParseResult> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.csv':
        return this.parseCSV(filePath);
      case '.xlsx':
      case '.xls':
        return this.parseExcel(filePath);
      case '.json':
        return this.parseJSON(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  private async parseCSV(filePath: string): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const rawBuffer = fs.readFileSync(filePath);
      let fileContent: string;
      try {
        // Try UTF-8 first; throw on invalid sequences
        const decoder = new TextDecoder('utf-8', { fatal: true });
        fileContent = decoder.decode(rawBuffer);
      } catch {
        // Fallback: decode as Windows-1252 and rewrite file as UTF-8
        fileContent = new TextDecoder('windows-1252').decode(rawBuffer);
        fs.writeFileSync(filePath, fileContent, 'utf-8');
        logger.warn(`CSV file re-encoded from Windows-1252 to UTF-8: ${filePath}`);
      }

      Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          const data = results.data as Record<string, unknown>[];
          const columns = results.meta.fields || [];

          logger.info(`Parsed CSV: ${data.length} rows, ${columns.length} columns`);

          resolve({
            data,
            columns,
            totalRows: data.length,
            fileType: 'csv',
          });
        },
        error: (error: Error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        },
      });
    });
  }

  private async parseExcel(filePath: string): Promise<ParseResult> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

    if (data.length === 0) {
      return {
        data: [],
        columns: [],
        totalRows: 0,
        fileType: 'excel',
      };
    }

    const columns = Object.keys(data[0]);
    logger.info(`Parsed Excel: ${data.length} rows, ${columns.length} columns`);

    return {
      data,
      columns,
      totalRows: data.length,
      fileType: 'excel',
    };
  }

  private async parseJSON(filePath: string): Promise<ParseResult> {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(fileContent);

    let data: Record<string, unknown>[];

    if (Array.isArray(parsed)) {
      data = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Handle object with array property
      const arrayKey = Object.keys(parsed).find((key) => Array.isArray(parsed[key]));
      if (arrayKey) {
        data = parsed[arrayKey];
      } else {
        // Single object, wrap in array
        data = [parsed];
      }
    } else {
      throw new Error('JSON must be an array or object');
    }

    if (data.length === 0) {
      return {
        data: [],
        columns: [],
        totalRows: 0,
        fileType: 'json',
      };
    }

    // Flatten nested objects (one level deep)
    data = data.map((row) => this.flattenObject(row));

    const columns = this.extractAllColumns(data);
    logger.info(`Parsed JSON: ${data.length} rows, ${columns.length} columns`);

    return {
      data,
      columns,
      totalRows: data.length,
      fileType: 'json',
    };
  }

  private flattenObject(
    obj: Record<string, unknown>,
    prefix = ''
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}_${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value as Record<string, unknown>, newKey));
      } else if (Array.isArray(value)) {
        result[newKey] = JSON.stringify(value);
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  private extractAllColumns(data: Record<string, unknown>[]): string[] {
    const columnSet = new Set<string>();
    for (const row of data) {
      Object.keys(row).forEach((key) => columnSet.add(key));
    }
    return Array.from(columnSet);
  }

  getPreviewData(data: Record<string, unknown>[], limit = 10): Record<string, unknown>[] {
    return data.slice(0, limit);
  }
}

export const fileParserService = new FileParserService();
export default fileParserService;
