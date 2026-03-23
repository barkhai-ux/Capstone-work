import { Router } from 'express';
import uploadRoutes from './upload.routes.js';
import tablesRoutes from './tables.routes.js';
import normalizationRoutes from './normalization.routes.js';
import starSchemaRoutes from './star-schema.routes.js';
import queryRoutes from './query.routes.js';
import chartRoutes from './chart.routes.js';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

// Mount routes
router.use('/upload', uploadRoutes);
router.use('/tables', tablesRoutes);
router.use('/normalization', normalizationRoutes);
router.use('/star-schema', starSchemaRoutes);
router.use('/query', queryRoutes);
router.use('/chart', chartRoutes);

export default router;
