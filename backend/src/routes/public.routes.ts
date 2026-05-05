import { Router } from 'express';
import {
  getPublicSharedDashboard,
  getPublicWidgetData,
} from '../controllers/share.controller.js';

// Public, NO auth middleware. Mounted under /api/v1/public.
const router = Router();

router.get('/share/:token', getPublicSharedDashboard);
router.post('/share/:token/widget-data', getPublicWidgetData);

export default router;
