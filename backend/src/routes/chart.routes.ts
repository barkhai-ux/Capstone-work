import { Router } from 'express';
import { generateChart, generateDashboard } from '../controllers/chart.controller.js';

const router = Router();

// POST /api/v1/chart/generate - AI single chart generation
router.post('/generate', generateChart);

// POST /api/v1/chart/dashboard - AI full dashboard generation
router.post('/dashboard', generateDashboard);

export default router;
