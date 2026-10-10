import SupportTicket from '../models/SupportTicket.js';
import User from '../models/User.js';

// Create support ticket - POST /api/rider/support/tickets
export const createRiderSupportTicket = async (req, res) => {
  try {
    const { subject, message, category = 'general', priority = 'medium' } = req.body;
    
    // Get rider from auth middleware
    const riderId = req.riderId;
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Rider authentication required',
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

    // Create support ticket
    const supportTicket = new SupportTicket({
      userId: riderId, // Store riderId in userId field
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority,
      // Add initial message to conversation
      conversation: [{
        message: message.trim(),
        sender: 'user', // Rider acts as the 'user' of this ticket system
        senderId: riderId,
        timestamp: new Date(),
      }]
    });

    await supportTicket.save();

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

// Get rider's support tickets - GET /api/rider/support/tickets
export const getRiderSupportTickets = async (req, res) => {
  try {
    const riderId = req.riderId;
    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Rider authentication required',
      });
    }

    const { page = 1, limit = 20, status } = req.query;
    const ticketPage = Math.max(1, parseInt(page) || 1);
    const ticketLimit = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const skip = (ticketPage - 1) * ticketLimit;

    // Build filter - SCOPED TO AUTHENTICATED RIDER
    const filter = { userId: riderId };
    if (status && ['open', 'in-progress', 'resolved', 'closed'].includes(status)) {
      filter.status = status;
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
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

// Get single support ticket with conversation - GET /api/rider/support/tickets/:id
export const getRiderSupportTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Rider authentication required',
      });
    }

    // STRICT SCOPING: Only find if it matches the authenticated rider
    const ticket = await SupportTicket.findOne({ 
      _id: id, 
      userId: riderId 
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Support ticket not found', // Returning generic not found instead of unauthorized for security
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

// Add message to ticket conversation - POST /api/rider/support/tickets/:id/message
export const addRiderTicketMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Rider authentication required',
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Message is required',
      });
    }

    // STRICT SCOPING
    const ticket = await SupportTicket.findOne({ 
      _id: id, 
      userId: riderId 
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Support ticket not found',
      });
    }

    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      return res.status(409).json({
        status: 'error',
        code: 'chat_closed',
        message: `This chat was ${ticket.status}. Start a new one and quote ${ticket.ticketNumber ?? 'the reference'}.`,
      });
    }

    // Add message to conversation
    ticket.conversation.push({
      message: message.trim(),
      sender: 'user', // Rider acts as 'user'
      senderId: riderId,
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
          sender: 'user',
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
