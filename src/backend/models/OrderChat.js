import mongoose from 'mongoose';

/**
 * The conversation between a customer and the partner delivering their order.
 *
 * Separate from SupportTicket on purpose. A support ticket is a request to
 * the company that somebody has to answer and close; this is two people
 * arranging a handover - "the gate is locked", "I'm two minutes away" - and
 * putting it in the support queue would bury real tickets under it. It is
 * still readable by an admin, because "what was actually said" is the first
 * question asked when a delivery is disputed.
 *
 * One document per order, so a message can never be attached to an order the
 * sender is not part of.
 */
const orderChatSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    messages: [
      {
        _id: false,
        /** Who is speaking, in terms of their part in this delivery. */
        sender: {
          type: String,
          enum: ['customer', 'rider'],
          required: true,
        },
        senderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        message: {
          type: String,
          required: true,
          trim: true,
          maxlength: [1000, 'Message cannot exceed 1000 characters'],
        },
        sentAt: {
          type: Date,
          default: Date.now,
        },
        /**
         * When the other side read it. Held per message rather than as a
         * single "last read" marker so an unread count survives one side
         * opening the thread and scrolling away without reaching the end.
         */
        readAt: {
          type: Date,
          default: null,
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.models.OrderChat ||
  mongoose.model('OrderChat', orderChatSchema);
