import { Router } from 'express';
import {
  listDatabases,
  createDatabase,
  renameDatabase,
  deleteDatabase,
} from '../controllers/databases.controller.js';

const router = Router();

router.get('/', listDatabases);
router.post('/', createDatabase);
router.patch('/:databaseId', renameDatabase);
router.delete('/:databaseId', deleteDatabase);

export default router;
