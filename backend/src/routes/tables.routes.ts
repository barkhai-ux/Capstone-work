import { Router } from 'express';
import {
  listTables,
  getTable,
  getTableData,
  deleteTable,
} from '../controllers/tables.controller.js';

const router = Router();

// GET /api/v1/tables - List all tables
router.get('/', listTables);

// GET /api/v1/tables/:tableId - Get table details
router.get('/:tableId', getTable);

// GET /api/v1/tables/:tableId/data - Get table data (paginated)
router.get('/:tableId/data', getTableData);

// DELETE /api/v1/tables/:tableId - Delete table
router.delete('/:tableId', deleteTable);

export default router;
