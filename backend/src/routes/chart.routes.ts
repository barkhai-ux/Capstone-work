import { Router } from 'express';
import { generateChart, generateDashboard, getChartData } from '../controllers/chart.controller.js';

const router = Router();

// POST /api/v1/chart/generate - AI single chart generation
router.post('/generate', generateChart);

// POST /api/v1/chart/dashboard - AI full dashboard generation
router.post('/dashboard', generateDashboard);

// POST /api/v1/chart/data - Aggregated chart data with optional FK join
router.post('/data', getChartData);

export default router;
