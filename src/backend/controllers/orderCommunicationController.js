import Order from '../models/Order.js';
import {
  canAccessOrderCommunication,
  getOrCreateOrderCommunication,
  appendOrderCommunicationMessage,
  getOrderCommunicationPayload,
  getMaskedCallPayload,
  validateOrderIdOrThrow,
  syncOrderCommunicationStatus,
  ensureActiveWindowOrThrow,
  resolveCommunicationCode,
  isOrderCommunicationActive,
} from '../services/orderCommunicationService.js';
import websocketService from '../services/websocketService.js';

const getOrderForCommunication = async (orderId) => {
  const order = await Order.findById(orderId).select('_id userId riderId status');
  if (!order) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }
  return order;
};

const assertAccess = (order, actor) => {
  if (!canAccessOrderCommunication({ order, actor })) {
    const err = new Error('You are not allowed to access this order communication');
    err.statusCode = 403;
    throw err;
  }
};

export const getOrderCommunication = async (req, res) => {
  try {
    const { orderId } = req.params;
    validateOrderIdOrThrow(orderId);

    const order = await getOrderForCommunication(orderId);
    assertAccess(order, req.user);

    await syncOrderCommunicationStatus(order);

    const communication = await getOrCreateOrderCommunication(order);
    if (!isOrderCommunicationActive(order)) {
      communication.status = 'closed';
    }
    const payload = getOrderCommunicationPayload({
      order,
      communication,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({
      status: 'success',
      data: payload,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      status: 'error',
      code: resolveCommunicationCode(error),
      message: error?.message || 'Failed to fetch order communication',
    });
  }
};

export const sendOrderCommunicationMessage = async (req, res) => {
  try {
    const { orderId } = req.params;
    validateOrderIdOrThrow(orderId);

    const order = await getOrderForCommunication(orderId);
    assertAccess(order, req.user);
    await ensureActiveWindowOrThrow(order);

    const { communication, message } = await appendOrderCommunicationMessage({
      order,
      actor: req.user,
      text: req.body?.text,
    });

    const messagePayload = {
      id: message._id,
      orderId: String(order._id),
      senderId: message.senderId,
      senderRole: message.senderRole,
      text: message.text,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };

    websocketService.emitOrderCommunication(order._id, messagePayload);

    return res.status(201).json({
      status: 'success',
      message: 'Message sent successfully',
      data: {
        communicationId: communication._id,
        message: messagePayload,
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      status: 'error',
      code: resolveCommunicationCode(error),
      message: error?.message || 'Failed to send message',
    });
  }
};

export const getOrderCommunicationCall = async (req, res) => {
  try {
    const { orderId } = req.params;
    validateOrderIdOrThrow(orderId);

    const order = await getOrderForCommunication(orderId);
    assertAccess(order, req.user);

    const call = await getMaskedCallPayload({ order, actor: req.user });

    return res.status(200).json({
      status: 'success',
      data: {
        call,
      },
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      status: 'error',
      code: resolveCommunicationCode(error),
      message: error?.message || 'Failed to get call details',
    });
  }
};
