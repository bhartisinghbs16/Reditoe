/**
 * Notification model for admin-created notifications.
 * New collection only - does not modify existing schemas.
 * Used by GET/POST/PATCH/DELETE /api/admin/notifications.
 */
import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    trim: true,
  },
  message: {
    type: String,
    required: [true, 'Please provide a message'],
    trim: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['ORDER_STATUS', 'PROMOTIONAL', 'SYSTEM', 'ALERT'],
  },
  recipient: {
    type: String,
    required: true,
    enum: ['ALL', 'CUSTOMERS', 'VENDORS', 'RIDERS', 'SPECIFIC'],
  },
  isSent: {
    type: Boolean,
    default: false,
  },
  sentAt: {
    type: Date,
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
