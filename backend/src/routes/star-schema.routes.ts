import { Router } from 'express';
import { analyzeStarSchema, applyStarSchema } from '../controllers/star-schema.controller.js';

const router = Router();

// POST /api/v1/star-schema/analyze - AI-powered star schema recommendation
router.post('/analyze', analyzeStarSchema);

// POST /api/v1/star-schema/apply - Apply star schema transformation
router.post('/apply', applyStarSchema);

export default router;
