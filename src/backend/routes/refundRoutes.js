import express from 'express';
import Refund from '../models/Refund.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import { adminProtect } from '../middleware/adminAuth.js';

const router = express.Router();
router.use(adminProtect);

// Get all refunds with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const skip = (page - 1) * limit;

    let query = {};
    if (status) {
      query.refundStatus = status;
    }

    const refunds = await Refund.find(query)
      .populate('userId', 'name email')
      .populate('orderId', 'total status createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Refund.countDocuments(query);

    res.json({
      status: 'success',
      data: refunds,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get refund by ID
router.get('/:id', async (req, res) => {
  try {
    const refund = await Refund.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('orderId', 'total status createdAt items');

    if (!refund) {
      return res.status(404).json({
        status: 'error',
        message: 'Refund not found'
      });
    }

    res.json({
      status: 'success',
      data: refund
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Update refund status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const refund = await Refund.findById(req.params.id);

    if (!refund) {
      return res.status(404).json({
        status: 'error',
        message: 'Refund not found'
      });
    }

    refund.refundStatus = status;
    if (adminNotes) {
      refund.adminActionLog.push({
        adminId: req.user?.id || 'admin',
        action: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'updated',
        notes: adminNotes,
        timestamp: new Date()
      });
    }

    await refund.save();

    res.json({
      status: 'success',
      data: refund
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get refund statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await Refund.aggregate([
      {
        $group: {
          _id: '$refundStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$refundAmount' }
        }
      }
    ]);

    const totalRefunds = await Refund.countDocuments();
    const totalAmount = await Refund.aggregate([
      { $group: { _id: null, total: { $sum: '$refundAmount' } } }
    ]);

    res.json({
      status: 'success',
      data: {
        totalRefunds,
        totalAmount: totalAmount[0]?.total || 0,
        byStatus: stats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;
