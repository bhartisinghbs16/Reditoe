/**
 * Admin Vendor Support Controller
 */
import VendorSupportTicket from '../../models/VendorSupportTicket.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';

// GET /api/admin/vendor-support - Get all support tickets
export const getSupportTickets = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      category,
      priority,
      vendorId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    
    if (status && status !== 'all') filter.status = status;
    if (category && category !== 'all') filter.category = category;
    if (priority && priority !== 'all') filter.priority = priority;
    if (vendorId) filter.vendorId = vendorId;

    // Search functionality
    if (search) {
      filter.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tickets = await VendorSupportTicket.find(filter)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('assignedTo', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await VendorSupportTicket.countDocuments(filter);

    res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch support tickets',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-support/:id - Get single support ticket
export const getSupportTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await VendorSupportTicket.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('assignedTo', 'name email')
      .populate('resolvedBy', 'name email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    res.json({
      success: true,
      data: { ticket }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch support ticket',
      error: error.message
    });
  }
};

// POST /api/admin/vendor-support - Create new support ticket
export const createSupportTicket = async (req, res) => {
  try {
    const {
      vendorId,
      restaurantId,
      subject,
      category,
      priority,
      description,
      tags
    } = req.body;

    // Validate vendor and restaurant
    const vendor = await User.findById(vendorId);
    const restaurant = await Restaurant.findById(restaurantId);

    if (!vendor || vendor.role !== 'vendor') {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor'
      });
    }

    if (!restaurant) {
      return res.status(400).json({
        success: false,
        message: 'Invalid restaurant'
      });
    }

    const ticket = new VendorSupportTicket({
      vendorId,
      restaurantId,
      subject,
      category,
      priority,
      description,
      tags: tags || []
    });

    await ticket.save();

    const populatedTicket = await VendorSupportTicket.findById(ticket._id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name');

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: { ticket: populatedTicket }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket',
      error: error.message
    });
  }
};

// POST /api/admin/vendor-support/:id/messages - Add message to ticket
export const addTicketMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, sender, attachments = [] } = req.body;

    if (!message || !sender) {
      return res.status(400).json({
        success: false,
        message: 'Message and sender are required'
      });
    }

    const ticket = await VendorSupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    await ticket.addMessage(sender, message, attachments);

    const updatedTicket = await VendorSupportTicket.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('assignedTo', 'name email');

    res.json({
      success: true,
      message: 'Message added successfully',
      data: { ticket: updatedTicket }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to add message',
      error: error.message
    });
  }
};

// PATCH /api/admin/vendor-support/:id/status - Update ticket status
export const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const ticket = await VendorSupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    ticket.status = status;
    ticket.lastActivityAt = new Date();
    await ticket.save();

    const updatedTicket = await VendorSupportTicket.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('assignedTo', 'name email');

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      data: { ticket: updatedTicket }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status',
      error: error.message
    });
  }
};

// PATCH /api/admin/vendor-support/:id/assign - Assign ticket to admin
export const assignTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Assigned admin ID is required'
      });
    }

    // Validate admin
    const admin = await User.findById(assignedTo);
    if (!admin || admin.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Invalid admin user'
      });
    }

    const ticket = await VendorSupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    ticket.assignedTo = assignedTo;
    ticket.lastActivityAt = new Date();
    await ticket.save();

    const updatedTicket = await VendorSupportTicket.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('assignedTo', 'name email');

    res.json({
      success: true,
      message: 'Ticket assigned successfully',
      data: { ticket: updatedTicket }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to assign ticket',
      error: error.message
    });
  }
};

// PATCH /api/admin/vendor-support/:id/close - Close ticket
export const closeTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, satisfactionRating, satisfactionFeedback } = req.body;

    if (!resolution) {
      return res.status(400).json({
        success: false,
        message: 'Resolution is required'
      });
    }

    const ticket = await VendorSupportTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found'
      });
    }

    await ticket.closeTicket(resolution, req.user.id);

    if (satisfactionRating) {
      ticket.satisfactionRating = satisfactionRating;
    }
    if (satisfactionFeedback) {
      ticket.satisfactionFeedback = satisfactionFeedback;
    }
    await ticket.save();

    const updatedTicket = await VendorSupportTicket.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('assignedTo', 'name email')
      .populate('resolvedBy', 'name email');

    res.json({
      success: true,
      message: 'Ticket closed successfully',
      data: { ticket: updatedTicket }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to close ticket',
      error: error.message
    });
  }
};
