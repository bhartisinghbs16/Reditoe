import mongoose from 'mongoose';
import OrderCommunication from '../models/OrderCommunication.js';

export const ORDER_COMMUNICATION_ACTIVE_STATUSES = new Set(['Processing', 'Ready', 'OnWay']);

export const COMMUNICATION_WINDOW_MESSAGE = 'Order communication is available only while delivery is active';

const createHttpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

export const canAccessOrderCommunication = ({ order, actor }) => {
  if (!order || !actor) return false;
  const actorId = String(actor._id || actor.id || '');
  if (!actorId) return false;

  const isOrderUser = String(order.userId || '') === actorId;
  const isOrderRider = String(order.riderId || '') === actorId;
  const isParticipant = isOrderUser || isOrderRider;
  const isSupportedRole = actor.role === 'user' || actor.role === 'rider';

  return isParticipant && isSupportedRole;
};

export const isOrderCommunicationActive = (order) => {
  if (!order) return false;
  if (!order.riderId) return false;
  return ORDER_COMMUNICATION_ACTIVE_STATUSES.has(order.status);
};

export const getOrCreateOrderCommunication = async (order) => {
  if (!order?.riderId || !order?.userId) {
    throw createHttpError(400, 'Order does not have eligible participants for communication');
  }

  const orderId = String(order._id);
  const shouldBeActive = isOrderCommunicationActive(order);

  let communication = await OrderCommunication.findOne({ orderId });
  if (!communication) {
    communication = await OrderCommunication.create({
      orderId,
      participants: {
        userId: order.userId,
        riderId: order.riderId,
      },
      status: shouldBeActive ? 'active' : 'closed',
      closedAt: shouldBeActive ? null : new Date(),
      messages: [],
    });
  } else {
    if (shouldBeActive && communication.status === 'closed') {
      communication.status = 'active';
      communication.closedAt = null;
      await communication.save();
    }

    if (!shouldBeActive && communication.status !== 'closed') {
      communication.status = 'closed';
      communication.closedAt = new Date();
      await communication.save();
    }
  }

  return communication;
};

export const syncOrderCommunicationStatus = async (order) => {
  if (!order?._id) return null;
  const communication = await OrderCommunication.findOne({ orderId: order._id });
  if (!communication) return null;

  const shouldBeActive = isOrderCommunicationActive(order);
  if (shouldBeActive && communication.status === 'closed') {
    communication.status = 'active';
    communication.closedAt = null;
    await communication.save();
  }

  if (!shouldBeActive && communication.status !== 'closed') {
    communication.status = 'closed';
    communication.closedAt = new Date();
    await communication.save();
  }

  return communication;
};

export const ensureActiveWindowOrThrow = async (order) => {
  const active = isOrderCommunicationActive(order);
  if (!active) {
    await syncOrderCommunicationStatus(order);
    throw createHttpError(403, COMMUNICATION_WINDOW_MESSAGE);
  }
};

export const appendOrderCommunicationMessage = async ({ order, actor, text }) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw createHttpError(400, 'Message text is required');

  await ensureActiveWindowOrThrow(order);
  const communication = await getOrCreateOrderCommunication(order);

  if (communication.status !== 'active') {
    throw createHttpError(403, COMMUNICATION_WINDOW_MESSAGE);
  }

  const senderRole = actor.role === 'rider' ? 'rider' : 'user';
  const senderId = actor._id || actor.id;

  communication.messages.push({ senderId, senderRole, text: trimmed });
  await communication.save();

  const message = communication.messages[communication.messages.length - 1];

  return { communication, message };
};

export const getOrderCommunicationPayload = ({ order, communication, page = 1, limit = 30 }) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));

  const allMessages = Array.isArray(communication?.messages) ? communication.messages : [];
  const total = allMessages.length;
  const startIdx = Math.max(0, total - safePage * safeLimit);
  const endIdx = total - (safePage - 1) * safeLimit;
  const messages = allMessages.slice(startIdx, endIdx).map((msg) => ({
    id: msg._id,
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    text: msg.text,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  }));

  return {
    orderId: order._id,
    status: communication?.status || 'active',
    closedAt: communication?.closedAt || null,
    participants: {
      userId: order.userId,
      riderId: order.riderId,
    },
    messages,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

const maskPhone = (phone) => {
  const value = String(phone || '').replace(/\D/g, '');
  if (!value) return null;
  if (value.length <= 4) return `****${value}`;
  return `******${value.slice(-4)}`;
};

export const getMaskedCallPayload = async ({ order, actor }) => {
  await ensureActiveWindowOrThrow(order);

  const relayNumber = String(process.env.SUPPORT_CALL_RELAY_NUMBER || process.env.SUPPORT_PHONE || '').trim();
  const maskedRelay = maskPhone(relayNumber);

  return {
    mode: 'relay',
    action: relayNumber ? 'tel' : 'none',
    relayNumberMasked: maskedRelay,
    dial: relayNumber ? `tel:${relayNumber}` : null,
    orderId: String(order._id),
    actorRole: actor.role,
  };
};

export const validateOrderIdOrThrow = (orderId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    throw createHttpError(400, 'Invalid order ID');
  }
};

export const resolveCommunicationCode = (err) => {
  if (err?.message === COMMUNICATION_WINDOW_MESSAGE) return 'COMMUNICATION_WINDOW_CLOSED';
  return 'ORDER_COMMUNICATION_ERROR';
};
