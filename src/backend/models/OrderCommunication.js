import mongoose from 'mongoose';

const communicationMessageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderRole: {
    type: String,
    enum: ['user', 'rider'],
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
}, { timestamps: true });

const orderCommunicationSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
    index: true,
  },
  participants: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  status: {
    type: String,
    enum: ['active', 'closed'],
    default: 'active',
    index: true,
  },
  closedAt: {
    type: Date,
    default: null,
  },
  messages: {
    type: [communicationMessageSchema],
    default: [],
  },
}, { timestamps: true });

orderCommunicationSchema.index({ 'participants.userId': 1, createdAt: -1 });
orderCommunicationSchema.index({ 'participants.riderId': 1, createdAt: -1 });

const OrderCommunication = mongoose.model('OrderCommunication', orderCommunicationSchema);

export default OrderCommunication;
