import fs from 'fs';
import path from 'path';
import { duckdbService } from './duckdb.service.js';
import { userTablesService, UserTableRow } from './user-tables.service.js';
import { fileParserService } from './file-parser.service.js';
import { schemaDetectorService } from './schema-detector.service.js';
import logger from '../utils/logger.js';

// Reconcile DuckDB's local _table_metadata against Supabase's user_tables.
// Any rows that exist in Supabase but not locally are pulled down from
// Storage and re-imported. This makes the per-user DuckDB file
// self-healing after a Render disk wipe / fresh local backend.
//
// Scoped by databaseId so a sidebar fetch only does the work for the
// active database — not every database the user owns.
export const rehydrateService = {
  async ensureTablesForDatabase(databaseId: string | undefined): Promise<void> {
    const remote = await userTablesService.listForUser(databaseId);
    if (remote.length === 0) return;

    const local = await duckdbService.listTables();
    const localIds = new Set(local.map((t) => t.id));
    const localNames = new Set(local.map((t) => t.name));

    const missing = remote.filter((r) => !localIds.has(r.id));
    if (missing.length === 0) return;

    logger.info(
      `Rehydrating ${missing.length} table(s) for database ${databaseId ?? '(any)'} from Supabase Storage`
    );

    for (const row of missing) {
      try {
        await rehydrateOne(row, localNames);
        localNames.add(row.name);
      } catch (err) {
        logger.warn(`Rehydrate failed for ${row.name} (${row.id}): ${(err as Error).message}`);
      }
    }
  },
};

async function rehydrateOne(row: UserTableRow, takenNames: Set<string>): Promise<void> {
  const localPath = await userTablesService.downloadToTemp(row);
  try {
    // If a table with the same name somehow exists already (orphaned during a
    // previous failure), give the rehydrated copy a unique suffix so we don't
    // clobber state — registerTable enforces uniqueness too.
    let tableName = row.name;
    if (takenNames.has(tableName) || (await duckdbService.tableExists(tableName))) {
      tableName = `${row.name}_${row.id.slice(0, 6)}`;
    }

    const ext = path.extname(localPath).toLowerCase();
    if (ext === '.csv') {
      await duckdbService.importCSV(localPath, tableName);
    } else {
      const parsed = await fileParserService.parseFile(localPath);
      const schema = schemaDetectorService.detectSchema(parsed.data, parsed.columns);
      await duckdbService.createTableFromData(tableName, schema, parsed.data);
    }

    await duckdbService.registerTable(row.id, tableName, row.original_file ?? undefined, row.database_id ?? undefined);
  } finally {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
}
