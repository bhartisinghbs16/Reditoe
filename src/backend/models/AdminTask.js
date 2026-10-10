import mongoose from 'mongoose';

const adminTaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending',
    required: true
  },
  assignedAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
adminTaskSchema.index({ assignedAdminId: 1, status: 1 });
adminTaskSchema.index({ dueDate: 1 });
adminTaskSchema.index({ priority: 1 });

const AdminTask = mongoose.model('AdminTask', adminTaskSchema);

export default AdminTask;
