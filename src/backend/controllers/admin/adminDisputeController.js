import Dispute from '../../models/Dispute.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';
import websocketService from '../../services/websocketService.js';

/**
 * GET /admin/disputes - List all disputes with filtering and pagination
 * Query: page, limit, status, priority, disputeType, assignedTo, fromDate, toDate
 */
export const getDisputes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    
    const {
      status,
      priority,
      disputeType,
      assignedTo,
      fromDate,
      toDate,
      initiatorId
    } = req.query;

    // Build filter
    const filter = {};
    if (status && ['open', 'under_review', 'resolved', 'rejected'].includes(status)) {
      filter.status = status;
    }
    if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
      filter.priority = priority;
    }
    if (disputeType && ['order_quality', 'delivery_issue', 'payment_dispute', 'service_complaint', 'refund_request', 'other'].includes(disputeType)) {
      filter.disputeType = disputeType;
    }
    if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
      filter.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    }
    if (initiatorId && mongoose.Types.ObjectId.isValid(initiatorId)) {
      filter.initiatorId = new mongoose.Types.ObjectId(initiatorId);
    }
    if (fromDate || toDate) {
      const dateFilter = {};
      if (fromDate) {
        const from = new Date(fromDate);
        if (!isNaN(from.getTime())) dateFilter.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        if (!isNaN(to.getTime())) dateFilter.$lte = to;
      }
      if (Object.keys(dateFilter).length > 0) filter.createdAt = dateFilter;
    }

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate('orderId', 'total status createdAt restaurantId')
        .populate('orderId.restaurantId', 'name')
        .populate('initiatorId', 'name email phone')
        .populate('participants.userId', 'name email phone')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Dispute.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: disputes.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        disputes,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch disputes',
    });
  }
};

/**
 * GET /admin/disputes/:id - Get single dispute by ID
 */
export const getDisputeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dispute ID',
      });
    }

    const dispute = await Dispute.findById(id)
      .populate('orderId', 'total status createdAt items deliveryAddress restaurantId userId riderId')
      .populate('orderId.restaurantId', 'name phone address')
      .populate('orderId.userId', 'name email phone')
      .populate('orderId.riderId', 'name email phone')
      .populate('initiatorId', 'name email phone')
      .populate('participants.userId', 'name email phone')
      .populate('assignedTo', 'name email')
      .populate('messages.senderId', 'name email')
      .populate('evidence.uploadedBy', 'name email')
      .populate('timeline.updatedBy', 'name email')
      .populate('resolution.resolvedBy', 'name email')
      .populate('escalatedTo', 'name email');

    if (!dispute) {
      return res.status(404).json({
        status: 'error',
        message: 'Dispute not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        dispute,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch dispute',
    });
  }
};

/**
 * POST /admin/disputes/create - Create a new dispute (admin only)
 * Body: { orderId, disputeType, title, description, participants, priority }
 */
export const createDispute = async (req, res) => {
  try {
    const {
      orderId,
      disputeType,
      title,
      description,
      participants,
      priority = 'medium'
    } = req.body;

    // Validation
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid order ID is required',
      });
    }

    if (!disputeType || !['order_quality', 'delivery_issue', 'payment_dispute', 'service_complaint', 'refund_request', 'other'].includes(disputeType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid dispute type is required',
      });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Dispute title is required',
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Dispute description is required',
      });
    }

    // Check if order exists
    const order = await Order.findById(orderId).populate('userId restaurantId riderId');
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Check if dispute already exists for this order
    const existingDispute = await Dispute.findOne({ 
      orderId, 
      status: { $in: ['open', 'under_review'] } 
    });
    if (existingDispute) {
      return res.status(400).json({
        status: 'error',
        message: 'An active dispute already exists for this order',
      });
    }

    // Prepare participants with roles
    const disputeParticipants = [];
    if (order.userId) {
      disputeParticipants.push({
        userId: order.userId,
        role: 'customer',
        involved: true
      });
    }
    if (order.restaurantId) {
      // Find vendor/restaurant owner
      const restaurant = await mongoose.model('Restaurant').findById(order.restaurantId).populate('owner');
      if (restaurant.owner) {
        disputeParticipants.push({
          userId: restaurant.owner,
          role: 'vendor',
          involved: true
        });
      }
    }
    if (order.riderId) {
      disputeParticipants.push({
        userId: order.riderId,
        role: 'rider',
        involved: true
      });
    }

    // Add custom participants if provided
    if (participants && Array.isArray(participants)) {
      for (const participant of participants) {
        if (participant.userId && participant.role && mongoose.Types.ObjectId.isValid(participant.userId)) {
          const user = await User.findById(participant.userId);
          if (user && !disputeParticipants.find(p => p.userId.toString() === participant.userId)) {
            disputeParticipants.push({
              userId: participant.userId,
              role: participant.role,
              involved: participant.involved !== false
            });
          }
        }
      }
    }

    // Create new dispute
    const dispute = new Dispute({
      orderId,
      participants: disputeParticipants,
      initiatorId: req.user.id,
      initiatorRole: 'admin',
      disputeType,
      title: title.trim(),
      description: description.trim(),
      priority,
      assignedTo: req.user.id, // Auto-assign to creating admin
      tags: ['admin_created']
    });

    await dispute.save();

    // Update order dispute status
    order.disputeStatus = 'open';
    order.disputeNotes = `Dispute opened: ${title.trim()}`;
    
    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      message: `Dispute opened: ${title.trim()}`,
    });

    await order.save();

    // Emit real-time updates
    websocketService.emitDisputeUpdate(dispute, 'dispute_created');

    // Populate and return
    await dispute.populate('orderId', 'total status createdAt restaurantId');
    await dispute.populate('orderId.restaurantId', 'name');
    await dispute.populate('initiatorId', 'name email');
    await dispute.populate('assignedTo', 'name email');
    await dispute.populate('participants.userId', 'name email');

    res.status(201).json({
      status: 'success',
      message: 'Dispute created successfully',
      data: {
        dispute,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create dispute',
    });
  }
};

/**
 * PATCH /admin/disputes/:id/assign - Assign dispute to admin
 * Body: { assignedTo }
 */
export const assignDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dispute ID',
      });
    }

    if (!assignedTo || !mongoose.Types.ObjectId.isValid(assignedTo)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid admin ID is required for assignment',
      });
    }

    // Verify assigned user is admin
    const adminUser = await User.findOne({ _id: assignedTo, role: 'admin' });
    if (!adminUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Assigned user must be an admin',
      });
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) {
      return res.status(404).json({
        status: 'error',
        message: 'Dispute not found',
      });
    }

    const previousAssignment = dispute.assignedTo;
    dispute.assignedTo = new mongoose.Types.ObjectId(assignedTo);

    // Add to timeline
    dispute.timeline.push({
      status: dispute.status,
      timestamp: new Date(),
      message: `Dispute assigned to ${adminUser.name}`,
      updatedBy: req.user.id,
    });

    await dispute.save();

    // Emit real-time update
    websocketService.emitDisputeUpdate(dispute, 'assigned');

    // Populate and return
    await dispute.populate('assignedTo', 'name email');
    await dispute.populate('timeline.updatedBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Dispute assigned successfully',
      data: {
        dispute,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to assign dispute',
    });
  }
};

/**
 * PATCH /admin/disputes/:id/status - Update dispute status
 * Body: { status, notes }
 */
export const updateDisputeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dispute ID',
      });
    }

    if (!status || !['open', 'under_review', 'resolved', 'rejected'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid status is required',
      });
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) {
      return res.status(404).json({
        status: 'error',
        message: 'Dispute not found',
      });
    }

    const previousStatus = dispute.status;
    dispute.status = status;

    // Add to timeline
    dispute.timeline.push({
      status,
      timestamp: new Date(),
      message: `Status changed from ${previousStatus} to ${status}${notes ? `: ${notes.trim()}` : ''}`,
      updatedBy: req.user.id,
    });

    await dispute.save();

    // Update order if resolved or rejected
    if (['resolved', 'rejected'].includes(status)) {
      const order = await Order.findById(dispute.orderId);
      if (order) {
        order.disputeStatus = 'resolved';
        order.disputeNotes = `Dispute ${status}: ${dispute.title}`;
        
        if (!order.timeline) order.timeline = [];
        order.timeline.push({
          status: order.status,
          timestamp: new Date(),
          message: `Dispute ${status}: ${dispute.title}`,
        });

        await order.save();
      }
    }

    // Emit real-time update
    websocketService.emitDisputeUpdate(dispute, 'status_change');

    // Populate and return
    await dispute.populate('timeline.updatedBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: `Dispute status updated to ${status}`,
      data: {
        dispute,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update dispute status',
    });
  }
};

/**
 * POST /admin/disputes/:id/messages - Add message to dispute
 * Body: { message, isInternal }
 */
export const addDisputeMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, isInternal = false } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dispute ID',
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Message content is required',
      });
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) {
      return res.status(404).json({
        status: 'error',
        message: 'Dispute not found',
      });
    }

    // Add message
    await dispute.addMessage(
      req.user.id,
      'admin',
      message.trim(),
      isInternal
    );

    // Emit real-time update
    websocketService.emitDisputeUpdate(dispute, 'new_message');

    // Return updated dispute
    const updatedDispute = await Dispute.findById(id)
      .populate('messages.senderId', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Message added successfully',
      data: {
        dispute: updatedDispute,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to add message',
    });
  }
};

/**
 * POST /admin/disputes/:id/evidence - Add evidence to dispute
 * Body: { type, description, text, url }
 */
export const addDisputeEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, description, text, url } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dispute ID',
      });
    }

    if (!type || !['image', 'document', 'text'].includes(type)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid evidence type is required',
      });
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) {
      return res.status(404).json({
        status: 'error',
        message: 'Dispute not found',
      });
    }

    // Validate evidence content
    if (type === 'text' && !text) {
      return res.status(400).json({
        status: 'error',
        message: 'Text content is required for text evidence',
      });
    }

    if ((type === 'image' || type === 'document') && !url) {
      return res.status(400).json({
        status: 'error',
        message: 'URL is required for image/document evidence',
      });
    }

    // Add evidence
    await dispute.addEvidence({
      type,
      description: description ? description.trim() : '',
      text: text ? text.trim() : '',
      url,
      uploadedBy: req.user.id,
    });

    // Emit real-time update
    websocketService.emitDisputeUpdate(dispute, 'evidence_added');

    // Return updated dispute
    const updatedDispute = await Dispute.findById(id)
      .populate('evidence.uploadedBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Evidence added successfully',
      data: {
        dispute: updatedDispute,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to add evidence',
    });
  }
};

/**
 * PATCH /admin/disputes/:id/resolve - Resolve dispute
 * Body: { decision, description, actionTaken, refundAmount }
 */
export const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      decision,
      description,
      actionTaken,
      refundAmount
    } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dispute ID',
      });
    }

    if (!decision || !['favor_customer', 'favor_vendor', 'favor_rider', 'compromise', 'rejected'].includes(decision)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid decision is required',
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Resolution description is required',
      });
    }

    const dispute = await Dispute.findById(id);
    if (!dispute) {
      return res.status(404).json({
        status: 'error',
        message: 'Dispute not found',
      });
    }

    if (dispute.status === 'resolved') {
      return res.status(400).json({
        status: 'error',
        message: 'Dispute is already resolved',
      });
    }

    // Prepare resolution data
    const resolutionData = {
      decision,
      description: description.trim(),
      actionTaken: actionTaken ? actionTaken.trim() : '',
      resolvedBy: req.user.id,
    };

    if (refundAmount && refundAmount > 0) {
      resolutionData.refundAmount = parseFloat(refundAmount);
    }

    // Resolve dispute
    await dispute.resolve(resolutionData, req.user.id);

    // Update order
    const order = await Order.findById(dispute.orderId);
    if (order) {
      order.disputeStatus = 'resolved';
      order.disputeNotes = `Dispute resolved: ${decision} - ${description.trim()}`;
      
      if (!order.timeline) order.timeline = [];
      order.timeline.push({
        status: order.status,
        timestamp: new Date(),
        message: `Dispute resolved: ${decision}`,
      });

      await order.save();
    }

    // Emit real-time update
    websocketService.emitDisputeUpdate(dispute, 'resolved');

    // Populate and return
    await dispute.populate('resolution.resolvedBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Dispute resolved successfully',
      data: {
        dispute,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to resolve dispute',
    });
  }
};

/**
 * GET /admin/disputes/stats/summary - Get dispute statistics
 */
export const getDisputeStats = async (req, res) => {
  try {
    const [
      statusStats,
      typeStats,
      priorityStats,
      monthlyStats,
      resolutionStats
    ] = await Promise.all([
      // By status
      Dispute.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      // By type
      Dispute.aggregate([
        {
          $group: {
            _id: '$disputeType',
            count: { $sum: 1 }
          }
        }
      ]),
      // By priority
      Dispute.aggregate([
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 }
          }
        }
      ]),
      // Monthly trends (last 12 months)
      Dispute.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } }
      ]),
      // Resolution statistics
      Dispute.aggregate([
        {
          $match: {
            'resolution.decision': { $exists: true }
          }
        },
        {
          $group: {
            _id: '$resolution.decision',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalDisputes = await Dispute.countDocuments();
    const activeDisputes = await Dispute.countDocuments({ 
      status: { $in: ['open', 'under_review'] } 
    });

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          totalDisputes,
          activeDisputes,
          resolvedDisputes: totalDisputes - activeDisputes
        },
        byStatus: statusStats,
        byType: typeStats,
        byPriority: priorityStats,
        monthlyTrends: monthlyStats,
        resolutions: resolutionStats
      }
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch dispute statistics',
    });
  }
};
