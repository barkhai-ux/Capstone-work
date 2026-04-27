import { Router } from 'express';
import uploadRoutes from './upload.routes.js';
import tablesRoutes from './tables.routes.js';
import normalizationRoutes from './normalization.routes.js';
import starSchemaRoutes from './star-schema.routes.js';
import queryRoutes from './query.routes.js';
import chartRoutes from './chart.routes.js';
import snippetsRoutes from './snippets.routes.js';
import dashboardsRoutes from './dashboards.routes.js';
import databasesRoutes from './databases.routes.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Health check — public
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

// All data routes require an authenticated Supabase user.
router.use('/upload', requireAuth, uploadRoutes);
router.use('/tables', requireAuth, tablesRoutes);
router.use('/normalization', requireAuth, normalizationRoutes);
router.use('/star-schema', requireAuth, starSchemaRoutes);
router.use('/query', requireAuth, queryRoutes);
router.use('/chart', requireAuth, chartRoutes);
router.use('/snippets', requireAuth, snippetsRoutes);
router.use('/dashboards', requireAuth, dashboardsRoutes);
router.use('/databases', requireAuth, databasesRoutes);

export default router;
