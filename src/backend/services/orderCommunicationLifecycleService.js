import Order from '../models/Order.js';
import { syncOrderCommunicationStatus } from './orderCommunicationService.js';

export const closeOrderCommunicationIfNeeded = async (orderId) => {
  if (!orderId) return;
  const order = await Order.findById(orderId).select('_id userId riderId status');
  if (!order) return;
  await syncOrderCommunicationStatus(order);
};
