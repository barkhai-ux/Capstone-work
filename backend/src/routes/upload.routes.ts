import { Router } from 'express';
import { upload } from '../middleware/file-filter.js';
import { uploadFile, getPreview, commitUpload } from '../controllers/upload.controller.js';

const router = Router();

// POST /api/v1/upload - Upload a file
router.post('/', upload.single('file'), uploadFile);

// GET /api/v1/upload/preview/:fileId - Get preview of uploaded file
router.get('/preview/:fileId', getPreview);

// POST /api/v1/upload/commit/:fileId - Commit uploaded file to database
router.post('/commit/:fileId', commitUpload);

export default router;
