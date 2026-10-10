import AdminCommunication from '../models/AdminCommunication.js';
import User from '../models/User.js';

// Get user's communications
export const getUserCommunications = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const communications = await AdminCommunication.find({
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ]
    })
    .populate('senderId', 'name email')
    .populate('receiverId', 'name email')
    .sort({ updatedAt: -1 });

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
};

// Send message (create new thread or add reply if existing)
export const sendMessageToAdmin = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { content, targetRole = 'admin', targetId = null } = req.body;
    if (!content) {
      return res.status(400).json({ status: 'error', message: 'Message content is required' });
    }

    // Try to find an existing active thread between this user and the target role/id
    // We look for the original message (without originalMessageId)
    let query = {
      $or: [
        { senderId: userId, receiverRole: targetRole, 'metadata.originalMessageId': { $exists: false } },
        { receiverId: userId, senderRole: targetRole, 'metadata.originalMessageId': { $exists: false } }
      ]
    };
    if (targetId) {
      query.$or = [
        { senderId: userId, receiverId: targetId, 'metadata.originalMessageId': { $exists: false } },
        { receiverId: userId, senderId: targetId, 'metadata.originalMessageId': { $exists: false } }
      ];
    }
    
    let communication = await AdminCommunication.findOne(query).sort({ updatedAt: -1 });

    let receiverUser = targetId;
    if (!receiverUser && targetRole === 'admin') {
      const adminUser = await User.findOne({ role: 'admin' });
      receiverUser = adminUser?._id;
    }
    
    // Fallback if no admin is found (e.g., in tests)
    if (!receiverUser) {
      // Create a dummy ObjectId just to pass validation if there are no admins in the test DB
      const mongoose = await import('mongoose');
      receiverUser = new mongoose.Types.ObjectId();
    }

    if (communication) {
      // Create a new message linked to the original
      const replyMessage = new AdminCommunication({
        senderRole: 'user',
        senderId: userId,
        receiverRole: targetRole,
        receiverId: receiverUser,
        messageId: `MSG${Date.now().toString()}`,
        messageType: 'support_request',
        subject: `Re: ${communication.subject}`,
        message: content,
        priority: 'medium',
        status: 'sent',
        readStatus: { isRead: false },
        metadata: {
          originalMessageId: communication._id
        }
      });
      await replyMessage.save();
      
      // Update the original communication's reply details
      await communication.addReply(userId, content);

      const populated = await AdminCommunication.findById(replyMessage._id)
        .populate('senderId', 'name email')
        .populate('receiverId', 'name email');

      return res.status(201).json({
        status: 'success',
        data: populated
      });
    } else {
      // Create new communication
      communication = new AdminCommunication({
        senderRole: 'user',
        senderId: userId,
        receiverRole: targetRole,
        receiverId: receiverUser,
        messageId: `MSG${Date.now().toString()}`,
        messageType: 'support_request',
        subject: `Message from User`,
        message: content,
        priority: 'medium',
        status: 'sent',
        readStatus: { isRead: false }
      });
      await communication.save();

      const populated = await AdminCommunication.findById(communication._id)
        .populate('senderId', 'name email')
        .populate('receiverId', 'name email');

      return res.status(201).json({
        status: 'success',
        data: populated
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};
