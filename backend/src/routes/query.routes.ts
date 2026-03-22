import { Router } from 'express';
import { queryTable } from '../controllers/query.controller.js';

const router = Router();

// POST /api/v1/query - Natural language query
router.post('/', queryTable);

export default router;
