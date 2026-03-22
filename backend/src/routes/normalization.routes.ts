import { Router } from 'express';
import { analyzeTable, applyNormalization } from '../controllers/normalization.controller.js';

const router = Router();

// POST /api/v1/normalization/analyze - Analyze table for normalization
router.post('/analyze', analyzeTable);

// POST /api/v1/normalization/apply - Apply normalization
router.post('/apply', applyNormalization);

export default router;
