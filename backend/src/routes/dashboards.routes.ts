import { Router } from 'express';
import {
  listDashboards,
  createDashboard,
  updateDashboard,
  deleteDashboard,
} from '../controllers/dashboards.controller.js';

const router = Router();

router.get('/', listDashboards);
router.post('/', createDashboard);
router.put('/:dashboardId', updateDashboard);
router.delete('/:dashboardId', deleteDashboard);

export default router;
