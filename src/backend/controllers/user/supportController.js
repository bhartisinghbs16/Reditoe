import SupportTicket from '../../models/SupportTicket.js';
import User from '../../models/User.js';
import FileUpload from '../../models/FileUpload.js';
import Order from '../../models/Order.js';
import cloudStorageService from '../../services/cloudStorageService.js';
import { canUserContactRider } from '../../utils/communicationEligibility.js';

// Create support ticket - POST /api/support/tickets
export const createSupportTicket = async (req, res) => {
  try {
    const { subject, message, category = 'general', priority = 'medium', orderId } = req.body;
    
    // Get user from auth middleware
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    // Validate required fields
    if (!subject || !subject.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Subject is required',
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Message is required',
      });
    }

    // Validate field lengths
    if (subject.length > 200) {
      return res.status(400).json({
        status: 'error',
        message: 'Subject cannot exceed 200 characters',
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        status: 'error',
        message: 'Message cannot exceed 2000 characters',
      });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (String(category).toLowerCase() === 'rider_chat') {
      if (!orderId) {
        return res.status(400).json({
          status: 'error',
          code: 'ORDER_ID_REQUIRED',
          message: 'orderId is required for rider chat support.',
        });
      }

      const order = await Order.findById(orderId).select('userId status');
      if (!order || String(order.userId) !== String(userId)) {
        return res.status(404).json({
          status: 'error',
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found for this user.',
        });
      }

      if (!canUserContactRider(order.status)) {
        return res.status(409).json({
          status: 'error',
          code: 'COMMUNICATION_WINDOW_CLOSED',
          message: 'You can contact delivery partner only until order is delivered.',
        });
      }
    }

    // Create support ticket
    const supportTicket = new SupportTicket({
      userId,
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority,
      orderId: String(category).toLowerCase() === 'rider_chat' ? orderId : null,
      // Add initial message to conversation
      conversation: [{
        message: message.trim(),
        sender: 'user',
        senderId: userId,
        timestamp: new Date(),
      }]
    });

    await supportTicket.save();

    // Populate user info for response
    await supportTicket.populate('userId', 'name email');

    res.status(201).json({
      status: 'success',
      message: 'Support ticket created successfully',
      data: {
        ticket: {
          _id: supportTicket._id,
          ticketNumber: supportTicket.ticketNumber,
          subject: supportTicket.subject,
          status: supportTicket.status,
          category: supportTicket.category,
          priority: supportTicket.priority,
          createdAt: supportTicket.createdAt,
          user: {
            name: supportTicket.userId.name,
            email: supportTicket.userId.email,
          }
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create support ticket. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user's support tickets - GET /api/support/tickets
export const getUserSupportTickets = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    const { page = 1, limit = 20, status } = req.query;
    const ticketPage = Math.max(1, parseInt(page) || 1);
    const ticketLimit = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const skip = (ticketPage - 1) * ticketLimit;

    // Build filter
    const filter = { userId };
    if (status && ['open', 'in-progress', 'resolved', 'closed'].includes(status)) {
      filter.status = status;
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(ticketLimit)
        .select('-conversation'), // Don't return full conversation in list view
      SupportTicket.countDocuments(filter)
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        tickets,
        pagination: {
          total,
          page: ticketPage,
          limit: ticketLimit,
          totalPages: Math.ceil(total / ticketLimit)
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch support tickets. Please try again.'
    });
  }
};

// Get single support ticket with conversation - GET /api/support/tickets/:id
export const getSupportTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    const ticket = await SupportTicket.findOne({ 
      _id: id, 
      userId 
    })
    .populate('userId', 'name email')
    .populate('conversation.senderId', 'name email');

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Support ticket not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        ticket
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch support ticket. Please try again.'
    });
  }
};

// Add message to ticket conversation - POST /api/support/tickets/:id/message
export const addTicketMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Message is required',
      });
    }

    let ticket;
    if (req.user?.role === 'admin' || req.user?.role === 'superadmin') {
      ticket = await SupportTicket.findById(id);
    } else {
      ticket = await SupportTicket.findOne({ 
        _id: id, 
        userId 
      });
    }

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Support ticket not found',
      });
    }

    if (String(ticket.category).toLowerCase() === 'rider_chat') {
      if (!ticket.orderId) {
        return res.status(409).json({
          status: 'error',
          code: 'ORDER_ID_REQUIRED',
          message: 'Rider chat is missing an order reference.',
        });
      }

      const order = await Order.findById(ticket.orderId).select('userId status');
      if (!order || String(order.userId) !== String(userId)) {
        return res.status(404).json({
          status: 'error',
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found for this user.',
        });
      }

      if (!canUserContactRider(order.status)) {
        return res.status(409).json({
          status: 'error',
          code: 'COMMUNICATION_WINDOW_CLOSED',
          message: 'You can contact delivery partner only until order is delivered.',
        });
      }
    }

    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      return res.status(409).json({
        status: 'error',
        code: 'chat_closed',
        message: `This chat was ${ticket.status}. Start a new one and quote ${ticket.ticketNumber ?? 'the reference'}.`,
      });
    }

    // Add message to conversation
    const senderRole = (req.user?.role === 'admin' || req.user?.role === 'superadmin') ? 'admin' : 'user';
    
    ticket.conversation.push({
      message: message.trim(),
      sender: senderRole,
      senderId: userId,
      timestamp: new Date(),
    });

    /*
     * A finished chat stays finished.
     *
     * Writing to a closed one reopened it, so a conversation an agent had
     * resolved came back to life days later with no new ticket and no notice
     * to anyone. A new question needs a new chat, which is what the reference
     * on it is for.
     */

    await ticket.save();

    res.status(200).json({
      status: 'success',
      message: 'Message added successfully',
      data: {
        message: {
          message: message.trim(),
          sender: senderRole,
          timestamp: new Date(),
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to add message. Please try again.'
    });
  }
};

// Upload file for support ticket - POST /api/support/tickets/:id/upload
export const uploadTicketFile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    // Verify ticket exists and belongs to user
    const ticket = await SupportTicket.findOne({ 
      _id: id, 
      userId 
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Support ticket not found',
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded',
      });
    }
    // Upload file to cloud storage
    const uploadResult = req.file?.location
      ? {
          provider: 's3',
          filename: req.file.key || req.file.originalname,
          storagePath: req.file.key || '',
          publicUrl: req.file.location,
          secureUrl: req.file.location,
        }
      : await cloudStorageService.uploadFile(req.file, 's3', {
          category: 'document',
          folder: 'support-tickets',
          ticketId: id,
          userId,
        });

    // Create file upload record (aligned with FileUpload model schema)
    const fileUpload = new FileUpload({
      originalName: req.file.originalname,
      filename: uploadResult.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      provider: uploadResult.provider || 'local',
      storagePath: uploadResult.storagePath,
      publicUrl: uploadResult.publicUrl,
      secureUrl: uploadResult.secureUrl,
      category: 'document',
      uploadedBy: userId,
      isPublic: false,
      metadata: {
        ticketId: id,
        uploadedAt: new Date().toISOString(),
      },
    });

    await fileUpload.save();

    // Add file info to ticket conversation as a system message
    ticket.conversation.push({
      message: `File uploaded: ${req.file.originalname}`,
      sender: 'system',
      senderId: userId,
      timestamp: new Date(),
      type: 'file_upload',
      fileUrl: uploadResult.publicUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });

    await ticket.save();

    res.status(200).json({
      status: 'success',
      message: 'File uploaded successfully',
      data: {
        file: {
          _id: fileUpload._id,
          ticketNumber: fileUpload.ticketNumber,
          originalName: req.file.originalname,
          filename: uploadResult.filename,
          url: uploadResult.publicUrl,
          size: req.file.size,
          mimetype: req.file.mimetype,
          uploadedAt: fileUpload.createdAt,
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload file. Please try again.'
    });
  }
};

// Get ticket files - GET /api/support/tickets/:id/files
export const getTicketFiles = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    // Verify ticket exists and belongs to user
    const ticket = await SupportTicket.findOne({ 
      _id: id, 
      userId 
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Support ticket not found',
      });
    }

    // Get all files associated with this ticket
    const files = await FileUpload.find({
      associatedType: 'support_ticket',
      associatedId: id,
    })
    .select('originalName fileName url size mimeType createdAt')
    .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: {
        files,
        total: files.length,
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch files. Please try again.'
    });
  }
};


