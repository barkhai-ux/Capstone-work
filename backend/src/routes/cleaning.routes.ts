import { Router } from 'express';
import { applyCleaning, analyzeCleaning } from '../controllers/cleaning.controller.js';

const router = Router();

// POST /api/v1/cleaning/analyze
router.post('/analyze', analyzeCleaning);

// POST /api/v1/cleaning/apply
router.post('/apply', applyCleaning);

export default router;
