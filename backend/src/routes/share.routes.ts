import { Router } from 'express';
import {
  getDashboardShare,
  createDashboardShare,
  revokeDashboardShare,
} from '../controllers/share.controller.js';

// Auth-gated. Mounted under /api/v1/dashboards.
const router = Router({ mergeParams: true });

router.get('/:dashboardId/share', getDashboardShare);
router.post('/:dashboardId/share', createDashboardShare);
router.delete('/:dashboardId/share', revokeDashboardShare);

export default router;
