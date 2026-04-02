import { Router } from 'express';
import { listSnippets, getSnippet, saveSnippet, deleteSnippet } from '../controllers/snippets.controller.js';

const router = Router();

// GET /api/v1/snippets - List all saved snippets
router.get('/', listSnippets);

// GET /api/v1/snippets/:snippetId - Get a specific snippet
router.get('/:snippetId', getSnippet);

// POST /api/v1/snippets - Save a new snippet
router.post('/', saveSnippet);

// DELETE /api/v1/snippets/:snippetId - Delete a snippet
router.delete('/:snippetId', deleteSnippet);

export default router;
