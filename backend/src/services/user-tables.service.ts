import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from './supabase.service.js';
import { getCurrentUserId } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const BUCKET = 'user-files';

// Build the storage object path:  <userId>/<tableId>.<ext>
function storagePath(userId: string, tableId: string, fileName: string): string {
  const ext = path.extname(fileName) || '.csv';
  return `${userId}/${tableId}${ext}`;
}

export const userTablesService = {
  /** Upload the original file to Supabase Storage and insert a metadata row. */
  async createOnUpload(opts: {
    tableId: string;
    databaseId: string;
    name: string;
    originalFile: string;
    filePath: string;
    rowCount: number;
    columnCount: number;
  }): Promise<void> {
    const userId = getCurrentUserId();
    const objectPath = storagePath(userId, opts.tableId, opts.originalFile);

    const fileBuffer = fs.readFileSync(opts.filePath);
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, fileBuffer, { upsert: true });
    if (uploadErr) {
      logger.error(`Storage upload failed for ${objectPath}:`, uploadErr);
      throw new Error(`Failed to back up uploaded file: ${uploadErr.message}`);
    }

    const { error: insertErr } = await supabaseAdmin.from('user_tables').insert({
      id: opts.tableId,
      user_id: userId,
      database_id: opts.databaseId,
      name: opts.name,
      original_file: opts.originalFile,
      storage_path: objectPath,
      row_count: opts.rowCount,
      column_count: opts.columnCount,
    });
    if (insertErr) {
      logger.error(`user_tables insert failed for ${opts.tableId}:`, insertErr);
      throw new Error(`Failed to save table metadata: ${insertErr.message}`);
    }
  },

  /** Mark a table as deleted: drop metadata row and remove the original file. */
  async remove(tableId: string): Promise<void> {
    const userId = getCurrentUserId();
    const { data } = await supabaseAdmin
      .from('user_tables')
      .select('storage_path')
      .eq('user_id', userId)
      .eq('id', tableId)
      .maybeSingle();

    const objectPath = data?.storage_path as string | undefined;
    if (objectPath) {
      const { error } = await supabaseAdmin.storage.from(BUCKET).remove([objectPath]);
      if (error) logger.warn(`Storage remove failed for ${objectPath}: ${error.message}`);
    }

    const { error: delErr } = await supabaseAdmin
      .from('user_tables')
      .delete()
      .eq('user_id', userId)
      .eq('id', tableId);
    if (delErr) logger.warn(`user_tables delete failed: ${delErr.message}`);
  },

  /** Update row/column counts after a transformation. */
  async updateStats(tableId: string, rowCount: number, columnCount: number): Promise<void> {
    const userId = getCurrentUserId();
    await supabaseAdmin
      .from('user_tables')
      .update({ row_count: rowCount, column_count: columnCount })
      .eq('user_id', userId)
      .eq('id', tableId);
  },
};
