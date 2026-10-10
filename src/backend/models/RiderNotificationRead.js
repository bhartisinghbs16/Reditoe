import mongoose from 'mongoose';

const riderNotificationReadSchema = new mongoose.Schema(
  {
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
      index: true,
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

riderNotificationReadSchema.index({ riderId: 1, notificationId: 1 }, { unique: true });

const RiderNotificationRead = mongoose.model('RiderNotificationRead', riderNotificationReadSchema);

export default RiderNotificationRead;
