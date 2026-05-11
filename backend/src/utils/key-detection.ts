/**
 * Common key/identifier suffixes found across all domains.
 * Covers: id, ID, Id, pk, PK, key, Key, no, No, num, Num, number, Number,
 *         code, Code, ref, Ref, index, Index, seq, Seq, #
 */
const KEY_SUFFIXES = [
  'id', 'pk', 'key', 'no', 'num', 'number', 'code', 'ref', 'index', 'seq',
];

// Build a regex that matches any suffix at the end of a column name,
// separated by a space, underscore, or camelCase boundary.
// e.g., "Patient_Number", "Employee Code", "studentId", "Record_No", "Item#"
const suffixPattern = KEY_SUFFIXES.join('|');
const SUFFIX_REGEX_SEP = new RegExp(`[\\s_](${suffixPattern})$`, 'i');
const SUFFIX_REGEX_CAMEL = new RegExp(`[a-z](${KEY_SUFFIXES.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('|')})$`);
const EXACT_REGEX = new RegExp(`^(${suffixPattern})$`, 'i');
const PREFIX_REGEX = new RegExp(`^(id|pk|key|no|num|number|code|ref)[\\s_]`, 'i');

/**
 * Deterministically detect if a column is a primary/foreign key by name pattern.
 * Works across all domains — not just e-commerce.
 *
 * Matches patterns like:
 *   id, ID, pk, PK, key, no, num, code, ref, index, seq
 *   Customer_ID, product_id, customerId, CustomerID
 *   "Customer ID", "Product ID", "Order ID" (space-separated)
 *   Patient_Number, Employee_Code, student_no, Record_No
 *   "Patient Number", "Employee Code", "Item Ref"
 *   studentNum, employeeKey, recordSeq
 *   "Item#" (# as shorthand for number)
 */
export function isIdColumn(columnName: string): boolean {
  const name = columnName.trim();
  // Exact matches: "id", "pk", "key", "no", etc.
  if (EXACT_REGEX.test(name)) return true;
  // Ends with separator (space/underscore) + suffix: "Customer_ID", "Patient Number"
  if (SUFFIX_REGEX_SEP.test(name)) return true;
  // CamelCase boundary: "customerId", "patientNumber", "employeeCode"
  if (SUFFIX_REGEX_CAMEL.test(name)) return true;
  // Starts with key prefix + separator: "ID Number", "id_order", "No Student"
  if (PREFIX_REGEX.test(name)) return true;
  // Ends with # (common shorthand): "Item#", "Student#"
  if (/#$/.test(name)) return true;
  return false;
}

/**
 * Extract the base entity name from an ID/key column name.
 * "Customer ID" → "customer", "Product_ID" → "product", "order_id" → "order"
 * "Patient_Number" → "patient", "Employee Code" → "employee"
 * "studentId" → "student", "Item#" → "item"
 */
export function extractBaseNameFromId(columnName: string): string {
  return columnName
    .replace(/#$/, '')
    .replace(/[\s_]*(id|pk|key|no|num|number|code|ref|index|seq)$/gi, '')
    // Handle camelCase: "studentId" → "student", "patientNumber" → "patient"
    .replace(/(Id|Pk|Key|No|Num|Number|Code|Ref|Index|Seq)$/, '')
    .toLowerCase()
    .trim();
}

/**
 * Given a list of columns, find one that looks like an existing PK/FK column.
 */
export function findIdColumn(columns: string[]): string | undefined {
  return columns.find(c => isIdColumn(c));
}

/**
 * Check if a base entity name matches a dimension/table name.
 * Handles pluralization: "customer" matches "customers", "product" matches "products"
 * Also handles partial matches: "emp" matches "employees"
 */
export function nameMatchesDimension(baseName: string, dimensionName: string): boolean {
  if (!baseName) return false;
  const dimLower = dimensionName.toLowerCase().replace(/^(dim_|lkp_)/, '');
  const dimSingular = dimLower.replace(/s$/, '');
  return (
    dimLower.includes(baseName) ||
    baseName.includes(dimSingular) ||
    dimSingular.includes(baseName)
  );
}

// ── Star-schema relationship detection ──

export interface MinimalTable {
  id: string;
  name: string;
  columns: { name: string; type: string }[];
}

export interface JoinKey { factCol: string; dimCol: string }

/** Detect a FK→PK join key between a fact and dim table. */
export function detectJoinKey(fact: MinimalTable, dim: MinimalTable): JoinKey | null {
  const factCols = fact.columns.map(c => c.name);
  const dimCols = dim.columns.map(c => c.name);
  const factSet = new Set(factCols);
  const dimSet = new Set(dimCols);

  // 1. Exact same column name on both sides (existing-PK star schema)
  const sharedIdCol = factCols.find(c => dimSet.has(c) && isIdColumn(c));
  if (sharedIdCol) return { factCol: sharedIdCol, dimCol: sharedIdCol };

  // 2. Surrogate key: dim has "id", fact has "<dim.name>_id" or fuzzy match
  if (dimSet.has('id')) {
    const exactFk = `${dim.name}_id`;
    if (factSet.has(exactFk)) return { factCol: exactFk, dimCol: 'id' };

    const dimBase = dim.name.toLowerCase().replace(/^(dim_|lkp_)/, '').replace(/s$/, '');
    const factFk = factCols.find(c => {
      if (!isIdColumn(c)) return false;
      const colBase = extractBaseNameFromId(c).replace(/^(dim_|lkp_)/, '').replace(/s$/, '');
      return colBase === dimBase || colBase.includes(dimBase) || dimBase.includes(colBase);
    });
    if (factFk) return { factCol: factFk, dimCol: 'id' };
  }

  // 3. Last resort: any shared non-id column
  const sharedAny = factCols.find(c => dimSet.has(c));
  if (sharedAny) return { factCol: sharedAny, dimCol: sharedAny };

  return null;
}

export interface StarSchemaRelationship {
  factTableId: string;
  factTableName: string;
  factCol: string;
  dimTableId: string;
  dimTableName: string;
  dimCol: string;
  descriptiveColumn?: string;
}

function isDimTableName(name: string): boolean {
  return /^(dim_|lkp_)/i.test(name);
}

function isSnapshotTableName(name: string): boolean {
  return /^original_/i.test(name);
}

function pickDescriptiveColumn(dim: MinimalTable, dimCol: string): string | undefined {
  const isUsable = (c: { name: string; type: string }) =>
    c.name !== dimCol && c.name !== 'id' && !isIdColumn(c.name);
  return (
    dim.columns.find(c => c.type.toUpperCase() === 'VARCHAR' && isUsable(c))
    ?? dim.columns.find(c => ['DATE', 'TIMESTAMP'].includes(c.type.toUpperCase()) && isUsable(c))
    ?? dim.columns.find(isUsable)
  )?.name;
}

/**
 * Find FK→PK relationships from non-dim tables (facts) into dim tables,
 * using name conventions (`dim_*`, `lkp_*` for dims; `original_*` skipped).
 * For each relationship, also picks the most descriptive column in the dim
 * (preferring VARCHAR over DATE over anything non-id) so the AI can be told
 * which column to use as a chart label instead of the bare FK id.
 */
export function detectStarSchemaRelationships(tables: MinimalTable[]): StarSchemaRelationship[] {
  const rels: StarSchemaRelationship[] = [];
  const seen = new Set<string>();

  const dims = tables.filter(t => isDimTableName(t.name));
  const facts = tables.filter(t => !isSnapshotTableName(t.name) && !isDimTableName(t.name));

  for (const dim of dims) {
    for (const fact of facts) {
      if (fact.id === dim.id) continue;
      const join = detectJoinKey(fact, dim);
      if (!join) continue;

      const key = `${fact.id}|${dim.id}|${join.factCol}|${join.dimCol}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rels.push({
        factTableId: fact.id,
        factTableName: fact.name,
        factCol: join.factCol,
        dimTableId: dim.id,
        dimTableName: dim.name,
        dimCol: join.dimCol,
        descriptiveColumn: pickDescriptiveColumn(dim, join.dimCol),
      });
    }
  }

  return rels;
}
