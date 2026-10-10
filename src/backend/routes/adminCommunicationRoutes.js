import express from 'express';
import AdminCommunication from '../models/AdminCommunication.js';
import User from '../models/User.js';
import { adminProtect } from '../middleware/adminAuth.js';

const router = express.Router();
router.use(adminProtect);

// Get all communications with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const { 
      senderRole, 
      receiverRole, 
      messageType, 
      priority, 
      status,
      isRead,
      startDate,
      endDate 
    } = req.query;

    let query = {};
    
    if (senderRole) {
      query.senderRole = senderRole;
    }
    
    if (receiverRole) {
      query.receiverRole = receiverRole;
    }
    
    if (messageType) {
      query.messageType = messageType;
    }
    
    if (priority) {
      query.priority = priority;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (isRead !== undefined) {
      query['readStatus.isRead'] = isRead === 'true';
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const communications = await AdminCommunication.find(query)
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AdminCommunication.countDocuments(query);

    res.json({
      status: 'success',
      data: communications,
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

// Get communication by ID
router.get('/:id', async (req, res) => {
  try {
    const communication = await AdminCommunication.findById(req.params.id)
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email');

    if (!communication) {
      return res.status(404).json({
        status: 'error',
        message: 'Communication not found'
      });
    }

    res.json({
      status: 'success',
      data: communication
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Create new communication
router.post('/', async (req, res) => {
  try {
    const communication = new AdminCommunication(req.body);
    await communication.save();

    const populated = await AdminCommunication.findById(communication._id)
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email');

    res.status(201).json({
      status: 'success',
      data: populated
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Mark communication as read
router.patch('/:id/read', async (req, res) => {
  try {
    const communication = await AdminCommunication.findById(req.params.id);

    if (!communication) {
      return res.status(404).json({
        status: 'error',
        message: 'Communication not found'
      });
    }

    await communication.markAsRead();

    res.json({
      status: 'success',
      data: communication
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Add reply to communication
router.post('/:id/reply', async (req, res) => {
  try {
    const { replyBy, replyContent } = req.body;
    const communication = await AdminCommunication.findById(req.params.id);

    if (!communication) {
      return res.status(404).json({
        status: 'error',
        message: 'Communication not found'
      });
    }

    await communication.addReply(replyBy, replyContent);

    res.json({
      status: 'success',
      data: communication
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get communication statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const stats = await AdminCommunication.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            messageType: '$messageType',
            priority: '$priority',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalCommunications = await AdminCommunication.countDocuments({
      createdAt: { $gte: startDate }
    });

    const readStats = await AdminCommunication.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$readStatus.isRead',
          count: { $sum: 1 }
        }
      }
    ]);

    const roleStats = await AdminCommunication.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            senderRole: '$senderRole',
            receiverRole: '$receiverRole'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      status: 'success',
      data: {
        totalCommunications,
        stats,
        readStats,
        roleStats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get unread communications count
router.get('/unread/count', async (req, res) => {
  try {
    const { receiverRole, receiverId } = req.query;

    let query = { 'readStatus.isRead': false };
    
    if (receiverRole) {
      query.receiverRole = receiverRole;
    }
    
    if (receiverId) {
      query.receiverId = receiverId;
    }

    const count = await AdminCommunication.countDocuments(query);

    res.json({
      status: 'success',
      data: { unreadCount: count }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get communications by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role = 'all' } = req.query;

    let query = {};
    
    if (role === 'sender') {
      query.senderId = userId;
    } else if (role === 'receiver') {
      query.receiverId = userId;
    } else {
      query.$or = [
        { senderId: userId },
        { receiverId: userId }
      ];
    }

    const communications = await AdminCommunication.find(query)
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email')
      .sort({ createdAt: -1 });

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
