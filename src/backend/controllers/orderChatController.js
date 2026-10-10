import mongoose from 'mongoose';
import OrderChat from '../models/OrderChat.js';
import Order from '../models/Order.js';

/**
 * Customer and delivery partner, talking about one delivery.
 *
 * Both sides reach the same two endpoints; who is asking is worked out from
 * the order rather than trusted from the request, so neither can post into a
 * conversation about somebody else's delivery.
 */

/** Once the food is delivered or the order is dead, there is nothing to arrange. */
const OPEN_STATUSES = [
  'Waiting for Confirmation',
  'Order Confirmed',
  'Preparing',
  'Ready',
  'PickedUp',
  'OnWay',
];

const isOpen = (status) => OPEN_STATUSES.includes(status);

/**
 * Works out what part the caller plays in this order.
 *
 * Returns null when they play none, which the callers turn into a 404 rather
 * than a 403: an order somebody has no part in should not be confirmed to
 * exist by the error they get back.
 */
const roleInOrder = (order, userId) => {
  if (!order) return null;
  if (String(order.userId) === String(userId)) return 'customer';
  if (order.riderId && String(order.riderId) === String(userId)) return 'rider';
  return null;
};

const shape = (chat, order, me) => ({
  orderId: String(order._id),
  orderNumber: order.orderNumber ?? null,
  status: order.status,
  /** Whether this conversation still accepts messages. */
  open: isOpen(order.status),
  you: me,
  messages: (chat?.messages ?? []).map((m) => ({
    sender: m.sender,
    message: m.message,
    sentAt: m.sentAt,
    mine: m.sender === me,
  })),
});

/** GET /api/orders/:orderId/chat */
export const getOrderChat = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await Order.findById(orderId).select(
      'userId riderId status orderNumber'
    );
    const me = roleInOrder(order, userId);
    if (!me) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const chat = await OrderChat.findOne({ orderId });

    // Anything the other side said is now seen. Marked on read rather than on
    // send, so an unread badge clears when the thread is actually opened.
    if (chat) {
      const theirs = chat.messages.filter((m) => m.sender !== me && !m.readAt);
      if (theirs.length) {
        theirs.forEach((m) => {
          m.readAt = new Date();
        });
        await chat.save();
      }
    }

    return res.json({ success: true, data: shape(chat, order, me) });
  } catch (error) {
    console.error('[orderChat] read failed:', error?.message || error);
    return res
      .status(500)
      .json({ success: false, message: 'Could not load this conversation.' });
  }
};

/** POST /api/orders/:orderId/chat  { message } */
export const sendOrderChatMessage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?._id || req.user?.id;
    const text = String(req.body?.message ?? '').trim();

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    if (text.length > 1000) {
      return res
        .status(400)
        .json({ success: false, message: 'Message is too long (1000 characters max).' });
    }

    const order = await Order.findById(orderId).select(
      'userId riderId status orderNumber'
    );
    const me = roleInOrder(order, userId);
    if (!me) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!isOpen(order.status)) {
      return res.status(409).json({
        success: false,
        code: 'CONVERSATION_CLOSED',
        message: 'This order is finished, so the conversation is closed.',
      });
    }

    /**
     * A customer with no rider yet has nobody to talk to. Said plainly rather
     * than accepting the message into a conversation no one will ever read.
     */
    if (!order.riderId) {
      return res.status(409).json({
        success: false,
        code: 'NO_RIDER_YET',
        message: 'No delivery partner has been assigned to this order yet.',
      });
    }

    // Upserted in one write: two messages sent at once would otherwise race to
    // create the same document and one would lose.
    const chat = await OrderChat.findOneAndUpdate(
      { orderId },
      {
        $push: {
          messages: { sender: me, senderId: userId, message: text, sentAt: new Date() },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, data: shape(chat, order, me) });
  } catch (error) {
    console.error('[orderChat] send failed:', error?.message || error);
    return res
      .status(500)
      .json({ success: false, message: 'Could not send that message.' });
  }
};

export default { getOrderChat, sendOrderChatMessage };
