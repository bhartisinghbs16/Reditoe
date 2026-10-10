import express from 'express';
import UserAnalytics from '../models/UserAnalytics.js';
import Refund from '../models/Refund.js';
import ActivityLog from '../models/ActivityLog.js';
import AdminCommunication from '../models/AdminCommunication.js';
import { adminProtect } from '../middleware/adminAuth.js';

const router = express.Router();
router.use(adminProtect);

router.get('/summary', async (req, res) => {
  try {
    const latestAnalytics = await UserAnalytics.findOne().sort({ date: -1 });
    const refundStats = await Refund.aggregate([
      { $group: { _id: '$refundStatus', count: { $sum: 1 } } }
    ]);
    const activityCount = await ActivityLog.countDocuments();
    const communicationCount = await AdminCommunication.countDocuments();

    res.json({
      status: 'success',
      data: {
        analytics: latestAnalytics,
        refunds: refundStats,
        totalActivities: activityCount,
        totalCommunications: communicationCount
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Public user analytics endpoint
router.get('/user-analytics', async (req, res) => {
  try {
    const analytics = await UserAnalytics.find().sort({ date: -1 }).limit(30);
    res.json({
      status: 'success',
      data: analytics
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Public refunds endpoint
router.get('/refunds', async (req, res) => {
  try {
    const refunds = await Refund.find()
      .populate('userId', 'name email')
      .populate('orderId', 'total status')
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json({
      status: 'success',
      data: refunds
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Public activity logs endpoint
router.get('/activity-logs', async (req, res) => {
  try {
    const logs = await ActivityLog.find()
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(50);
    
    res.json({
      status: 'success',
      data: logs
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Public admin communications endpoint
router.get('/admin-communications', async (req, res) => {
  try {
    const communications = await AdminCommunication.find()
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email')
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json({
      status: 'success',
      data: communications
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;
