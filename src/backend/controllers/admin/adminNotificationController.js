/**
 * Admin notification controller. CRUD for notifications (admin only).
 * Does NOT modify existing controllers or mobile app.
 */
import Notification from '../../models/Notification.js';
import mongoose from 'mongoose';

const TYPES = ['ORDER_STATUS', 'PROMOTIONAL', 'SYSTEM', 'ALERT'];
const RECIPIENTS = ['ALL', 'CUSTOMERS', 'VENDORS', 'RIDERS', 'SPECIFIC'];

/**
 * GET /admin/notifications - List notifications (paginated, filterable)
 */
export const getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const type = req.query.type;
    const recipient = req.query.recipient;
    const isSent = req.query.isSent;

    const filter = {};
    if (type && TYPES.includes(type)) filter.type = type;
    if (recipient && RECIPIENTS.includes(recipient)) filter.recipient = recipient;
    if (isSent !== undefined && isSent !== '') {
      filter.isSent = isSent === 'true';
    }

    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      data: { notifications },
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch notifications',
    });
  }
};

/**
 * GET /admin/notifications/:id - Get one notification
 */
export const getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
    }

    const notification = await Notification.findById(id).lean();
    if (!notification) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { notification },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch notification',
    });
  }
};

/**
 * POST /admin/notifications - Create draft notification
 */
/**
 * The console describes who a notification goes to as its "audience", and
 * writes both audience and type in prose ("All users", "Promotional"). Mapped
 * onto the stored enums here so the screen can keep its own wording.
 */
const AUDIENCE_ALIASES = {
  'ALL USERS': 'ALL',
  EVERYONE: 'ALL',
  CUSTOMER: 'CUSTOMERS',
  USERS: 'CUSTOMERS',
  VENDOR: 'VENDORS',
  RESTAURANTS: 'VENDORS',
  RIDER: 'RIDERS',
  'DELIVERY PARTNERS': 'RIDERS',
};

function normaliseEnum(value, allowed, aliases = {}) {
  if (value === undefined || value === null) return value;
  const upper = String(value).trim().toUpperCase().replace(/[\s-]+/g, ' ');
  const mapped = aliases[upper] ?? upper.replace(/ /g, '_');
  return allowed.includes(mapped) ? mapped : value;
}

export const createNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    const type = normaliseEnum(req.body.type, TYPES);
    const recipient = normaliseEnum(
      req.body.recipient ?? req.body.audience,
      RECIPIENTS,
      AUDIENCE_ALIASES
    );

    if (!title || !message || !type || !recipient) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide title, message, type, and recipient',
      });
    }
    if (!TYPES.includes(type)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid type. Must be one of: ${TYPES.join(', ')}`,
      });
    }
    if (!RECIPIENTS.includes(recipient)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid recipient. Must be one of: ${RECIPIENTS.join(', ')}`,
      });
    }

    const notification = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      type,
      recipient,
      isSent: false,
      sentAt: null,
      createdBy: req.user?.id || req.user?._id || null,
    });

    res.status(201).json({
      status: 'success',
      data: { notification },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create notification',
    });
  }
};

/**
 * PATCH /admin/notifications/:id/send - Mark as sent (idempotent)
 */
export const sendNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found',
      });
    }

    if (!notification.isSent) {
      notification.isSent = true;
      notification.sentAt = new Date();
      await notification.save();
    }

    res.status(200).json({
      status: 'success',
      data: { notification },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to send notification',
    });
  }
};

/**
 * DELETE /admin/notifications/:id - Delete notification
 */
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
    }

    const notification = await Notification.findByIdAndDelete(id);
    if (!notification) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Notification deleted',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete notification',
    });
  }
};
