import express from 'express';
import {
  getTasks,
  createTask,
  updateTask,
  completeTask,
  deleteTask
} from '../../controllers/admin/adminTaskController.js';

const router = express.Router();

// GET /api/admin/tasks - Get all tasks for the logged-in admin
router.get('/', getTasks);

// POST /api/admin/tasks - Create a new task
router.post('/', createTask);

// PUT /api/admin/tasks/:taskId - Update a task
router.put('/:taskId', updateTask);

// PUT /api/admin/tasks/:taskId/complete - Mark task as completed
router.put('/:taskId/complete', completeTask);

// DELETE /api/admin/tasks/:taskId - Delete a task
router.delete('/:taskId', deleteTask);

export default router;
