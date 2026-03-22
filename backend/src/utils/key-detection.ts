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
