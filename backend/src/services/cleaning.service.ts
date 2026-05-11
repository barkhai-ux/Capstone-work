import { duckdbService } from './duckdb.service.js';
import { groqService } from './groq.service.js';
import logger from '../utils/logger.js';

export type CleaningKind =
  | 'fill_missing'
  | 'remove_duplicates'
  | 'standardize_dates'
  | 'cap_outliers'
  | 'coerce_types';

const NUMERIC = ['INTEGER', 'BIGINT', 'DECIMAL', 'DOUBLE', 'FLOAT', 'NUMERIC', 'SMALLINT', 'TINYINT'];
const VARCHAR = ['VARCHAR', 'TEXT', 'STRING'];

const isNumeric = (t: string) => {
  const upper = t.toUpperCase();
  return NUMERIC.some((n) => upper.includes(n));
};
const isString = (t: string) => {
  const upper = t.toUpperCase();
  return VARCHAR.some((v) => upper.includes(v));
};

export interface ColumnAnalysis {
  name: string;
  type: string;
  nullCount: number;
  distinctCount: number;
  samples: string[];
  issues: { kind: CleaningKind; affected: number }[];
}

export interface CleaningAnalysis {
  tableId: string;
  tableName: string;
  rowCount: number;
  duplicateCount: number;
  qualityScore: number;
  totalIssues: number;
  byKind: Record<CleaningKind, number>;
  columns: ColumnAnalysis[];
  recommendations: {
    kind: CleaningKind;
    title: string;
    description: string;
    affected: number;
  }[];
  aiSummary?: string;
}

interface AppliedReport {
  kind: CleaningKind;
  affected: number;
  details?: string;
}

const RECOMMENDATION_TITLES: Record<CleaningKind, string> = {
  fill_missing: 'Fill missing values',
  remove_duplicates: 'Remove duplicate rows',
  standardize_dates: 'Standardize date format',
  cap_outliers: 'Cap statistical outliers',
  coerce_types: 'Coerce mismatched types',
};

const RECOMMENDATION_DESCRIPTIONS: Record<CleaningKind, (n: number) => string> = {
  fill_missing: (n) =>
    `Replace empty cells with "Unknown" or 0. Affects ${n} cell${n === 1 ? '' : 's'}.`,
  remove_duplicates: (n) =>
    `${n} exact duplicate row${n === 1 ? '' : 's'} can be removed safely.`,
  standardize_dates: () =>
    `Multiple date formats detected — convert all dates to YYYY-MM-DD.`,
  cap_outliers: (n) =>
    `Clamp ${n} extreme value${n === 1 ? '' : 's'} to the 99th percentile.`,
  coerce_types: (n) =>
    `Force ${n} non-numeric value${n === 1 ? '' : 's'} in numeric-looking columns to 0.`,
};

export const cleaningService = {
  async analyze(tableId: string): Promise<CleaningAnalysis> {
    const table = await duckdbService.getTableById(tableId);
    if (!table) throw new Error('Table not found');
    const tableName = table.name;
    const cols = table.columns;

    // Total row count
    const rcRes = await duckdbService.all<{ n: number | bigint }>(
      `SELECT COUNT(*) AS n FROM "${tableName}"`
    );
    const rowCount = Number(rcRes[0]?.n ?? 0);

    // Duplicate count: COUNT(*) - COUNT(DISTINCT *)
    const dupRes = await duckdbService.all<{ d: number | bigint }>(
      `SELECT (COUNT(*) - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM "${tableName}"))) AS d FROM "${tableName}"`
    );
    const duplicateCount = Number(dupRes[0]?.d ?? 0);

    const byKind: Record<CleaningKind, number> = {
      fill_missing: 0,
      remove_duplicates: duplicateCount,
      standardize_dates: 0,
      cap_outliers: 0,
      coerce_types: 0,
    };

    const columnAnalyses: ColumnAnalysis[] = [];

    for (const c of cols) {
      const issues: { kind: CleaningKind; affected: number }[] = [];

      // Null count + distinct count + samples
      const stringFilter = isString(c.type)
        ? `"${c.name}" IS NULL OR TRIM(CAST("${c.name}" AS VARCHAR)) = ''`
        : `"${c.name}" IS NULL`;

      const nullRes = await duckdbService.all<{ n: number | bigint; d: number | bigint }>(
        `SELECT
            SUM(CASE WHEN ${stringFilter} THEN 1 ELSE 0 END) AS n,
            COUNT(DISTINCT "${c.name}") AS d
         FROM "${tableName}"`
      );
      const nullCount = Number(nullRes[0]?.n ?? 0);
      const distinctCount = Number(nullRes[0]?.d ?? 0);

      if (nullCount > 0) {
        issues.push({ kind: 'fill_missing', affected: nullCount });
        byKind.fill_missing += nullCount;
      }

      // Sample values
      const sampleRes = await duckdbService.all<Record<string, unknown>>(
        `SELECT DISTINCT "${c.name}" AS v FROM "${tableName}" WHERE "${c.name}" IS NOT NULL LIMIT 5`
      );
      const samples = sampleRes.map((r) => String(r.v ?? ''));

      // Date format inconsistency (VARCHAR with multiple date patterns)
      if (isString(c.type)) {
        const fmtRes = await duckdbService.all<{ iso: number; us: number; eu: number; mmm: number; total: number }>(
          `SELECT
              SUM(CASE WHEN regexp_full_match(CAST("${c.name}" AS VARCHAR), '^\\d{4}-\\d{2}-\\d{2}.*') THEN 1 ELSE 0 END) AS iso,
              SUM(CASE WHEN regexp_full_match(CAST("${c.name}" AS VARCHAR), '^\\d{1,2}/\\d{1,2}/\\d{4}$') THEN 1 ELSE 0 END) AS us,
              SUM(CASE WHEN regexp_full_match(CAST("${c.name}" AS VARCHAR), '^\\d{1,2}\\.\\d{1,2}\\.\\d{4}$') THEN 1 ELSE 0 END) AS eu,
              SUM(CASE WHEN regexp_full_match(CAST("${c.name}" AS VARCHAR), '^[A-Za-z]{3} \\d{1,2}, \\d{4}$') THEN 1 ELSE 0 END) AS mmm,
              COUNT(*) AS total
           FROM "${tableName}" WHERE "${c.name}" IS NOT NULL`
        );
        const f = fmtRes[0];
        const counts = [Number(f?.iso ?? 0), Number(f?.us ?? 0), Number(f?.eu ?? 0), Number(f?.mmm ?? 0)];
        const dateLike = counts.reduce((a, b) => a + b, 0);
        const distinctFormats = counts.filter((n) => n >= 5).length;
        if (dateLike >= 5 && distinctFormats > 1) {
          issues.push({ kind: 'standardize_dates', affected: dateLike });
          byKind.standardize_dates += dateLike;
        }

        // Type coercion: VARCHAR column where most values are numeric but some aren't
        const coerceRes = await duckdbService.all<{ numeric_count: number; non_numeric: number; total: number }>(
          `SELECT
              SUM(CASE WHEN TRY_CAST(CAST("${c.name}" AS VARCHAR) AS DOUBLE) IS NOT NULL THEN 1 ELSE 0 END) AS numeric_count,
              SUM(CASE WHEN "${c.name}" IS NOT NULL AND TRY_CAST(CAST("${c.name}" AS VARCHAR) AS DOUBLE) IS NULL THEN 1 ELSE 0 END) AS non_numeric,
              COUNT(*) AS total
           FROM "${tableName}" WHERE "${c.name}" IS NOT NULL`
        );
        const co = coerceRes[0];
        const numericCount = Number(co?.numeric_count ?? 0);
        const nonNumeric = Number(co?.non_numeric ?? 0);
        const sampledTotal = Number(co?.total ?? 0);
        if (sampledTotal > 0 && numericCount / sampledTotal > 0.7 && nonNumeric > 0) {
          issues.push({ kind: 'coerce_types', affected: nonNumeric });
          byKind.coerce_types += nonNumeric;
        }
      }

      // Outliers (numeric, IQR-based via subquery)
      if (isNumeric(c.type)) {
        const outRes = await duckdbService.all<{ n: number | bigint }>(
          `WITH bounds AS (
             SELECT QUANTILE_CONT("${c.name}", 0.25) AS q1,
                    QUANTILE_CONT("${c.name}", 0.75) AS q3
             FROM "${tableName}" WHERE "${c.name}" IS NOT NULL
           )
           SELECT COUNT(*) AS n
           FROM "${tableName}", bounds
           WHERE "${tableName}"."${c.name}" IS NOT NULL
             AND ("${tableName}"."${c.name}" > bounds.q3 + 1.5 * (bounds.q3 - bounds.q1)
               OR "${tableName}"."${c.name}" < bounds.q1 - 1.5 * (bounds.q3 - bounds.q1))`
        );
        const outliers = Number(outRes[0]?.n ?? 0);
        if (outliers > 0) {
          issues.push({ kind: 'cap_outliers', affected: outliers });
          byKind.cap_outliers += outliers;
        }
      }

      columnAnalyses.push({
        name: c.name,
        type: c.type,
        nullCount,
        distinctCount,
        samples,
        issues,
      });
    }

    const totalIssues =
      byKind.fill_missing +
      byKind.remove_duplicates +
      byKind.standardize_dates +
      byKind.cap_outliers +
      byKind.coerce_types;

    const totalCells = Math.max(1, rowCount * cols.length);
    const issueRatio = Math.min(1, totalIssues / totalCells);
    const qualityScore = Math.max(0, Math.round((1 - issueRatio) * 100));

    const recommendations: CleaningAnalysis['recommendations'] = (Object.keys(byKind) as CleaningKind[])
      .filter((k) => byKind[k] > 0)
      .map((k) => ({
        kind: k,
        title: RECOMMENDATION_TITLES[k],
        description: RECOMMENDATION_DESCRIPTIONS[k](byKind[k]),
        affected: byKind[k],
      }));

    let aiSummary: string | undefined;
    try {
      aiSummary = await groqService.generateCleaningSummary({
        tableName,
        rowCount,
        qualityScore,
        totalIssues,
        byKind,
        columns: columnAnalyses.map((c) => ({
          name: c.name,
          type: c.type,
          nullCount: c.nullCount,
          distinctCount: c.distinctCount,
          samples: c.samples.slice(0, 3),
        })),
      });
    } catch (e) {
      logger.warn(`Groq cleaning summary failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      tableId,
      tableName,
      rowCount,
      duplicateCount,
      qualityScore,
      totalIssues,
      byKind,
      columns: columnAnalyses,
      recommendations,
      aiSummary,
    };
  },

  async apply(tableId: string, kinds: CleaningKind[]): Promise<{ applied: AppliedReport[]; tableName: string }> {
    const table = await duckdbService.getTableById(tableId);
    if (!table) throw new Error('Table not found');
    const tableName = table.name;
    const cols = table.columns;
    const applied: AppliedReport[] = [];

    for (const kind of kinds) {
      let affected = 0;
      const details: string[] = [];

      if (kind === 'fill_missing') {
        for (const c of cols) {
          if (!isNumeric(c.type) && !isString(c.type)) continue;
          const stringFilter = isString(c.type)
            ? `"${c.name}" IS NULL OR TRIM(CAST("${c.name}" AS VARCHAR)) = ''`
            : `"${c.name}" IS NULL`;
          const before = await duckdbService.all<{ n: number | bigint }>(
            `SELECT COUNT(*) AS n FROM "${tableName}" WHERE ${stringFilter}`
          );
          const cnt = Number(before[0]?.n ?? 0);
          if (cnt > 0) {
            const value = isNumeric(c.type) ? '0' : `'Unknown'`;
            await duckdbService.run(
              `UPDATE "${tableName}" SET "${c.name}" = ${value} WHERE ${stringFilter}`
            );
            affected += cnt;
            details.push(`${c.name}: ${cnt}`);
          }
        }
      } else if (kind === 'remove_duplicates') {
        const tempName = `__dedup_${Date.now()}`;
        const before = await duckdbService.all<{ n: number | bigint }>(
          `SELECT COUNT(*) AS n FROM "${tableName}"`
        );
        await duckdbService.run(
          `CREATE TABLE "${tempName}" AS SELECT DISTINCT * FROM "${tableName}"`
        );
        const after = await duckdbService.all<{ n: number | bigint }>(
          `SELECT COUNT(*) AS n FROM "${tempName}"`
        );
        affected = Number(before[0]?.n ?? 0) - Number(after[0]?.n ?? 0);
        if (affected > 0) {
          await duckdbService.run(`DROP TABLE "${tableName}"`);
          await duckdbService.run(`ALTER TABLE "${tempName}" RENAME TO "${tableName}"`);
        } else {
          await duckdbService.run(`DROP TABLE "${tempName}"`);
        }
      } else if (kind === 'standardize_dates') {
        for (const c of cols) {
          if (!isString(c.type)) continue;
          const sample = await duckdbService.all<Record<string, unknown>>(
            `SELECT "${c.name}" AS v FROM "${tableName}" WHERE "${c.name}" IS NOT NULL LIMIT 50`
          );
          const dateLike = sample.filter((r) => {
            const v = String(r.v ?? '');
            return (
              /^\d{4}-\d{2}-\d{2}/.test(v) ||
              /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v) ||
              /^[A-Za-z]{3}\s+\d{1,2},\s*\d{4}$/.test(v)
            );
          }).length;
          if (dateLike < 5) continue;
          const before = await duckdbService.all<{ n: number | bigint }>(
            `SELECT COUNT(*) AS n FROM "${tableName}" WHERE "${c.name}" IS NOT NULL`
          );
          await duckdbService.run(
            `UPDATE "${tableName}" SET "${c.name}" = COALESCE(
               strftime(TRY_STRPTIME("${c.name}", '%Y-%m-%d'), '%Y-%m-%d'),
               strftime(TRY_STRPTIME("${c.name}", '%Y-%m-%d %H:%M:%S'), '%Y-%m-%d'),
               strftime(TRY_STRPTIME("${c.name}", '%m/%d/%Y'), '%Y-%m-%d'),
               strftime(TRY_STRPTIME("${c.name}", '%d/%m/%Y'), '%Y-%m-%d'),
               strftime(TRY_STRPTIME("${c.name}", '%b %d, %Y'), '%Y-%m-%d'),
               "${c.name}"
             ) WHERE "${c.name}" IS NOT NULL`
          );
          const cnt = Number(before[0]?.n ?? 0);
          affected += cnt;
          details.push(`${c.name}: ${cnt}`);
        }
      } else if (kind === 'cap_outliers') {
        for (const c of cols) {
          if (!isNumeric(c.type)) continue;
          const stats = await duckdbService.all<{ p99: number | null }>(
            `SELECT QUANTILE_CONT("${c.name}", 0.99) AS p99 FROM "${tableName}" WHERE "${c.name}" IS NOT NULL`
          );
          const p99 = stats[0]?.p99;
          if (p99 == null) continue;
          const before = await duckdbService.all<{ n: number | bigint }>(
            `SELECT COUNT(*) AS n FROM "${tableName}" WHERE "${c.name}" > ${p99}`
          );
          const cnt = Number(before[0]?.n ?? 0);
          if (cnt > 0) {
            await duckdbService.run(
              `UPDATE "${tableName}" SET "${c.name}" = ${p99} WHERE "${c.name}" > ${p99}`
            );
            affected += cnt;
            details.push(`${c.name}: cap ${p99}, ${cnt} rows`);
          }
        }
      } else if (kind === 'coerce_types') {
        // DuckDB enforces column types at write time. For VARCHAR columns whose
        // sample suggests numeric content, attempt to cast; on failure leave value.
        for (const c of cols) {
          if (!isString(c.type)) continue;
          const sample = await duckdbService.all<Record<string, unknown>>(
            `SELECT "${c.name}" AS v FROM "${tableName}" WHERE "${c.name}" IS NOT NULL LIMIT 50`
          );
          const numericCount = sample.filter((r) => {
            const v = String(r.v ?? '');
            return v !== '' && !Number.isNaN(Number(v));
          }).length;
          if (numericCount < sample.length * 0.7) continue;
          const before = await duckdbService.all<{ n: number | bigint }>(
            `SELECT COUNT(*) AS n FROM "${tableName}" WHERE "${c.name}" IS NOT NULL AND TRY_CAST("${c.name}" AS DOUBLE) IS NULL`
          );
          const cnt = Number(before[0]?.n ?? 0);
          if (cnt > 0) {
            await duckdbService.run(
              `UPDATE "${tableName}" SET "${c.name}" = '0' WHERE "${c.name}" IS NOT NULL AND TRY_CAST("${c.name}" AS DOUBLE) IS NULL`
            );
            affected += cnt;
            details.push(`${c.name}: ${cnt}`);
          }
        }
      }

      applied.push({
        kind,
        affected,
        details: details.length > 0 ? details.join(', ') : undefined,
      });
      logger.info(`Cleaning ${kind} on ${tableName}: ${affected} affected`);
    }

    return { applied, tableName };
  },
};
