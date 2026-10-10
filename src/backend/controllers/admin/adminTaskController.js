import AdminTask from '../../models/AdminTask.js';

// Get all tasks for the logged-in admin
export const getTasks = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    const tasks = await AdminTask.find({ assignedAdminId: adminId })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: tasks,
      message: 'Tasks retrieved successfully'
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks',
      error: error.message
    });
  }
};

// Create a new task
export const createTask = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { title, description, priority, dueDate } = req.body;
    
    // Validate required fields
    if (!title || !description || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and due date are required'
      });
    }
    
    // Validate priority
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Priority must be low, medium, or high'
      });
    }
    
    // Parse dueDate
    const parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid due date format'
      });
    }
    
    const task = new AdminTask({
      title: title.trim(),
      description: description.trim(),
      priority: priority || 'medium',
      dueDate: parsedDueDate,
      assignedAdminId: adminId
    });
    
    await task.save();
    
    res.status(201).json({
      success: true,
      data: task,
      message: 'Task created successfully'
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to create task',
      error: error.message
    });
  }
};

// Update a task
export const updateTask = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { taskId } = req.params;
    const { title, description, priority, dueDate } = req.body;
    
    // Find the task and ensure it belongs to the logged-in admin
    const task = await AdminTask.findOne({ 
      _id: taskId, 
      assignedAdminId: adminId 
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Validate priority if provided
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Priority must be low, medium, or high'
      });
    }
    
    // Validate dueDate if provided
    let parsedDueDate;
    if (dueDate) {
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid due date format'
        });
      }
    }
    
    // Update task fields
    if (title) task.title = title.trim();
    if (description) task.description = description.trim();
    if (priority) task.priority = priority;
    if (dueDate) task.dueDate = parsedDueDate;
    
    await task.save();
    
    res.json({
      success: true,
      data: task,
      message: 'Task updated successfully'
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to update task',
      error: error.message
    });
  }
};

// Mark task as completed
export const completeTask = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { taskId } = req.params;
    
    // Find the task and ensure it belongs to the logged-in admin
    const task = await AdminTask.findOne({ 
      _id: taskId, 
      assignedAdminId: adminId 
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Check if task is already completed
    if (task.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Task is already completed'
      });
    }
    
    // Mark task as completed
    task.status = 'completed';
    await task.save();
    
    res.json({
      success: true,
      data: task,
      message: 'Task marked as completed'
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to complete task',
      error: error.message
    });
  }
};

// Delete a task
export const deleteTask = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { taskId } = req.params;
    
    // Find and delete the task, ensuring it belongs to the logged-in admin
    const task = await AdminTask.findOneAndDelete({ 
      _id: taskId, 
      assignedAdminId: adminId 
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to delete task',
      error: error.message
    });
  }
};
