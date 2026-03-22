import Groq from 'groq-sdk';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import { ColumnSchema, DimensionRecommendation } from '../types/index.js';
import { isIdColumn, extractBaseNameFromId, nameMatchesDimension } from '../utils/key-detection.js';

interface GroqSchemaResponse {
  factTable: {
    name: string;
    measures: string[];
    description: string;
  };
  dimensions: DimensionRecommendation[];
  explanation: string;
}

interface GroqNormalizationResponse {
  candidates: {
    column: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    suggestedLookupTable: string;
    reason: string;
  }[];
  dimensions: {
    name: string;
    columns: string[];
    primaryKey?: string | null;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
  }[];
  factColumns: string[];
  overallRecommendation: string;
}

/**
 * Post-process AI dimension results: deterministically detect existing PK columns
 * in each dimension group. If the AI missed setting primaryKey but there's clearly
 * an ID column in the group, set it automatically.
 */
function detectExistingPKs(dimensions: { columns: string[]; primaryKey?: string | null }[]): void {
  for (const dim of dimensions) {
    // If AI already set a valid primaryKey that exists in columns, keep it
    if (dim.primaryKey && dim.columns.includes(dim.primaryKey)) continue;

    // Scan columns for ID-like patterns
    const idCol = dim.columns.find(c => isIdColumn(c));
    if (idCol) {
      dim.primaryKey = idCol;
    } else {
      dim.primaryKey = undefined;
    }
  }
}

class GroqService {
  private client: Groq | null = null;

  private getClient(): Groq {
    if (!this.client) {
      if (!config.groqApiKey) {
        throw new Error('GROQ_API_KEY is not configured');
      }
      this.client = new Groq({ apiKey: config.groqApiKey });
    }
    return this.client;
  }

  async analyzeForStarSchema(
    tableName: string,
    columns: ColumnSchema[],
    sampleData: Record<string, unknown>[]
  ): Promise<GroqSchemaResponse> {
    const client = this.getClient();

    const columnDescriptions = columns.map(
      (c) => `- "${c.name}" (type: ${c.type}, nullable: ${c.nullable})`
    ).join('\n');

    const sampleRows = sampleData.slice(0, 5).map((row) =>
      JSON.stringify(row, (_key, value) =>
        typeof value === 'bigint' ? Number(value) : value
      )
    ).join('\n');

    const prompt = `You are a data modeling expert. Analyze this table and recommend a star schema design (fact table + dimension tables).

Table name: "${tableName}"

Columns:
${columnDescriptions}

Sample data (first 5 rows):
${sampleRows}

Rules:
1. The fact table should contain numeric measures (quantities, amounts, counts, prices, etc.) and foreign keys to dimension tables.
2. Group related descriptive/categorical columns into dimension tables (e.g., customer info, product info, location info, date/time info).
3. Each dimension should have a meaningful name like "dim_customer", "dim_product", "dim_location", "dim_date", etc.
4. CRITICAL — Primary Key and Foreign Key detection (language-agnostic):
   - Identify columns that act as unique identifiers by BOTH name patterns AND data patterns:
     * Name patterns: suffixes like ID, id, No, Number, Code, Key, Ref, #, or their equivalents in ANY language
     * Data patterns: a column whose sample values look like identifiers — sequential integers, unique codes, unique strings that don't repeat across rows
   - Look at the sample data: if a column has all unique values in the sample and looks like an identifier (not a measure), it is likely a primary key.
   - Column names may be in ANY language (English, Mongolian, Chinese, etc.) or from ANY domain (physics, chemistry, healthcare, etc.). Do NOT rely only on English naming conventions.
   - If a dimension group has an existing identifier column, set "primaryKey" to that column name. This existing key will be reused — do NOT create a new surrogate key.
   - If a column is already a foreign key referencing a dimension, keep that FK column in the fact table measures list — it will serve as the natural foreign key.
   - Only when NO existing key/identifier column is found for a dimension, omit "primaryKey" (a surrogate key will be generated automatically).
5. Every column must appear exactly once — either as a measure in the fact table or in one dimension.
6. If a column doesn't clearly fit a dimension, keep it in the fact table.
7. Include existing identifier columns in the dimension's "columns" array AND set them as "primaryKey" if they uniquely identify rows in that dimension.

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "factTable": {
    "name": "fact_<meaningful_name>",
    "measures": ["col1", "col2"],
    "description": "Brief description of what this fact table represents"
  },
  "dimensions": [
    {
      "dimensionName": "dim_<name>",
      "columns": ["col3", "col4"],
      "primaryKey": "col3_id or null if no existing key column",
      "description": "Brief description"
    }
  ],
  "explanation": "Brief explanation of the overall star schema design and why columns were grouped this way"
}`;

    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a data warehouse architect. You respond only with valid JSON. No markdown formatting, no code blocks, just raw JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Empty response from Groq AI');
    }

    logger.info('Groq AI analysis completed');

    // Parse the JSON response, stripping any markdown code fences if present
    let jsonStr = content;
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    let parsed: GroqSchemaResponse;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      logger.error('Failed to parse Groq response:', content);
      throw new Error('AI returned invalid JSON. Please try again.');
    }

    // Validate the response structure
    if (!parsed.factTable || !parsed.dimensions || !Array.isArray(parsed.dimensions)) {
      throw new Error('AI response missing required fields');
    }

    // Deterministically detect existing PK/FK columns the AI may have missed
    detectExistingPKs(parsed.dimensions);

    // Move ID columns from fact measures into their matching dimension
    // e.g., if "Customer ID" or "Customer_ID" is in measures and dim_customer exists, move it there as PK
    if (parsed.factTable.measures.length > 0 && parsed.dimensions.length > 0) {
      const toRemove: string[] = [];
      for (const measure of parsed.factTable.measures) {
        if (!isIdColumn(measure)) continue;
        const baseName = extractBaseNameFromId(measure);
        if (!baseName) continue;
        for (const dim of parsed.dimensions) {
          if (nameMatchesDimension(baseName, dim.dimensionName)) {
            if (!dim.columns.includes(measure)) {
              dim.columns.push(measure);
            }
            dim.primaryKey = measure;
            toRemove.push(measure);
            break;
          }
        }
      }
      if (toRemove.length > 0) {
        parsed.factTable.measures = parsed.factTable.measures.filter(m => !toRemove.includes(m));
      }
    }

    return parsed;
  }

  async analyzeForNormalization(
    tableName: string,
    columns: ColumnSchema[],
    sampleData: Record<string, unknown>[],
    columnStats: { column: string; uniqueCount: number; totalRows: number; topValues: { value: string; count: number }[] }[]
  ): Promise<GroqNormalizationResponse> {
    const client = this.getClient();

    const columnDescriptions = columns.map(
      (c) => `- "${c.name}" (type: ${c.type}, nullable: ${c.nullable})`
    ).join('\n');

    const statsText = columnStats.map((s) => {
      const topVals = s.topValues.slice(0, 5).map((v) => `"${v.value}" (${v.count}x)`).join(', ');
      return `- "${s.column}": ${s.uniqueCount} unique values out of ${s.totalRows} rows. Top values: ${topVals}`;
    }).join('\n');

    const sampleRows = sampleData.slice(0, 5).map((row) =>
      JSON.stringify(row, (_key, value) =>
        typeof value === 'bigint' ? Number(value) : value
      )
    ).join('\n');

    const prompt = `You are a database normalization expert. Analyze this table and recommend how to normalize it by grouping related columns into dimension tables. Instead of creating a separate lookup table for each column, group columns that belong together (e.g., customer-related columns into a "customers" table, product columns into a "products" table, location columns into a "geography" table).

Table name: "${tableName}"

Columns:
${columnDescriptions}

Column statistics:
${statsText}

Sample data (first 5 rows):
${sampleRows}

Rules:
1. Group related categorical/descriptive columns into dimension tables. For example:
   - Customer Name + Segment → "customers"
   - Product Name + Category + Sub-Category → "products"
   - City + State + Region + Country → "geography"
   - Order Date + Ship Date + Ship Mode → "orders"
2. Columns that are numeric measures (Sales, Quantity, Discount, Profit, amounts, counts, prices) or unique per row (Row ID, Order ID) should stay in the fact table — list them under "factColumns".
3. CRITICAL — Primary Key and Foreign Key detection (language-agnostic):
   - Identify columns that act as unique identifiers by BOTH name patterns AND data patterns:
     * Name patterns: suffixes like ID, id, No, Number, Code, Key, Ref, #, or their equivalents in ANY language
     * Data patterns: look at the column statistics — if a column has a high unique count relative to total rows (nearly 1:1) and isn't a numeric measure, it is likely a primary key
   - Column names may be in ANY language (English, Mongolian, Chinese, etc.) or from ANY domain (physics, chemistry, healthcare, etc.). Do NOT rely only on English naming conventions.
   - If a dimension group has an existing identifier column, INCLUDE it in the dimension's "columns" array AND set "primaryKey" to that column name. This existing key will be reused instead of creating a new surrogate key.
   - If a column is a foreign key that references a dimension, include it in the dimension group so it becomes the primary key of that dimension table.
   - Only when NO existing key/identifier column is found for a dimension, omit "primaryKey" or set it to null (a surrogate key will be generated automatically).
4. Dimension table names should be short, meaningful, and plural (e.g., "customers", "products", "geography", "orders") — NOT prefixed with "lkp_" or "dim_".
5. Confidence levels:
   - HIGH: Groups of related columns with high repetition rate (>80%)
   - MEDIUM: Groups with moderate repetition (50-80%)
   - LOW: Borderline cases
6. Every column must appear exactly once — either in a dimension group or in factColumns.
7. Existing identifier columns that serve as primary keys for dimensions should be in the dimension's columns list, NOT in factColumns.

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "dimensions": [
    {
      "name": "customers",
      "columns": ["Customer_ID", "Customer Name", "Segment"],
      "primaryKey": "Customer_ID",
      "confidence": "HIGH",
      "description": "Customer information that repeats across orders"
    }
  ],
  "factColumns": ["Row ID", "Order ID", "Sales", "Quantity", "Discount", "Profit"],
  "overallRecommendation": "Brief summary of the normalization recommendation"
}`;

    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a database normalization expert. You respond only with valid JSON. No markdown formatting, no code blocks, just raw JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Empty response from Groq AI');
    }

    logger.info('Groq AI normalization analysis completed');

    let jsonStr = content;
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    let parsed: GroqNormalizationResponse;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      logger.error('Failed to parse Groq normalization response:', content);
      throw new Error('AI returned invalid JSON. Please try again.');
    }

    if (!parsed.dimensions || !Array.isArray(parsed.dimensions)) {
      throw new Error('AI response missing required fields');
    }

    // Ensure candidates array exists (may be empty in new format)
    if (!parsed.candidates) {
      parsed.candidates = [];
    }
    if (!parsed.factColumns) {
      parsed.factColumns = [];
    }

    // Deterministically detect existing PK/FK columns the AI may have missed
    detectExistingPKs(parsed.dimensions);

    // Move ID columns from factColumns into their matching dimension group
    // e.g., if "Customer ID" or "Customer_ID" is in factColumns and a "customers" dimension exists, move it there
    if (parsed.factColumns.length > 0 && parsed.dimensions.length > 0) {
      const toRemove: string[] = [];
      for (const fc of parsed.factColumns) {
        if (!isIdColumn(fc)) continue;
        const baseName = extractBaseNameFromId(fc);
        if (!baseName) continue;
        for (const dim of parsed.dimensions) {
          if (nameMatchesDimension(baseName, dim.name)) {
            if (!dim.columns.includes(fc)) {
              dim.columns.push(fc);
            }
            dim.primaryKey = fc;
            toRemove.push(fc);
            break;
          }
        }
      }
      if (toRemove.length > 0) {
        parsed.factColumns = parsed.factColumns.filter(c => !toRemove.includes(c));
      }
    }

    return parsed;
  }

  async generateSQL(
    tables: { name: string; columns: { name: string; type: string }[]; sampleData: Record<string, unknown>[] }[],
    question: string
  ): Promise<string> {
    const client = this.getClient();

    const tablesDescription = tables.map((t) => {
      const cols = t.columns.map((c) => `  - "${c.name}" (${c.type})`).join('\n');
      const rows = t.sampleData.slice(0, 10).map((row) =>
        JSON.stringify(row, (_key, value) =>
          typeof value === 'bigint' ? Number(value) : value
        )
      ).join('\n');
      return `Table: "${t.name}"\nColumns:\n${cols}\nSample data (up to 10 rows):\n${rows}`;
    }).join('\n\n---\n\n');

    const prompt = `You are a DuckDB SQL expert. Given the database tables below and the user's question, write a single SELECT query that answers it.

${tablesDescription}

User question: "${question}"

Rules:
1. Write a single DuckDB-compatible SELECT query. No DDL, no INSERT, no UPDATE, no DELETE, no DROP.
2. Always quote table names and column names with double quotes.
3. Use only tables and columns that exist in the schema above.
4. If the data spans multiple tables, use JOINs to combine them. Look at column names and sample data to identify join keys (e.g. foreign key columns that reference IDs in other tables).
5. CRITICAL: Carefully read the user's question and select the columns that directly answer it. For example:
   - If the user asks about "customers", use customer-related columns (e.g. Customer Name, Customer ID), NOT unrelated columns like Ship Mode or Region.
   - If the user asks about "top 10 by purchase/sales", ORDER BY the sales/revenue/amount column DESC and LIMIT 10.
   - Match the intent of the question to the most relevant columns and aggregations.
6. If the question asks for aggregation, use GROUP BY appropriately.
7. Limit results to 500 rows max unless the user specifies a different limit (e.g. "top 10").
8. Respond with ONLY the raw SQL query. No explanation, no markdown, no code fences.`;

    const response = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a SQL expert. Read the user\'s question carefully and select only the columns that directly answer it. Respond with ONLY a single raw SQL SELECT query. No markdown, no explanation, no code blocks.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Empty response from AI');
    }

    // Strip markdown fences if present
    let sql = content;
    const fenceMatch = sql.match(/```(?:sql)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      sql = fenceMatch[1].trim();
    }

    // Safety: only allow SELECT
    const normalized = sql.replace(/--.*$/gm, '').trim().toUpperCase();
    if (!normalized.startsWith('SELECT')) {
      throw new Error('AI generated a non-SELECT query. Only read queries are allowed.');
    }

    const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)\b/i;
    if (forbidden.test(sql)) {
      throw new Error('AI generated a query with forbidden operations.');
    }

    logger.info(`Generated SQL for question: "${question}" → ${sql}`);
    return sql;
  }
}

export const groqService = new GroqService();
export default groqService;
