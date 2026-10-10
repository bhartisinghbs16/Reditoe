import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import {
  canAccessOrderCommunication,
  ensureActiveWindowOrThrow,
  appendOrderCommunicationMessage,
  validateOrderIdOrThrow,
} from './orderCommunicationService.js';
import { formatOrderAssignmentOrderData } from './orderAssignmentFormatter.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.eventVersion = 1;
    this.connectedAdmins = new Map(); // adminId -> socket.id
    this.connectedUsers = new Map(); // userId -> socket.id
    this.connectedCustomers = new Map(); // customerId -> socket.id
    this.connectedRiders = new Map(); // riderId -> socket.id
    this.orderSubscriptions = new Map(); // orderId -> Set of socket ids
  }

  initialize(server) {
    const isDev = process.env.NODE_ENV !== 'production';
    const allowedOrigins = [
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
      ...(process.env.ADMIN_DASHBOARD_URL ? [process.env.ADMIN_DASHBOARD_URL] : []),
      ...(process.env.NODE_ENV !== 'production' ? [process.env.WS_DEV_ORIGIN || 'http://localhost:3000'] : []),
    ].filter(Boolean);

        this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: false,
        allowedHeaders: ['Content-Type', 'Authorization']
      },
      transports: ['polling', 'websocket'],
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      maxHttpBufferSize: 1e8,
      allowUpgrades: true,
      perMessageDeflate: false,
      httpCompression: false,
      cookie: false
    });

    // Authentication middleware with enhanced logging for all user types
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          console.log('[WS] auth-failed - No authentication token provided');
          return next(new Error('Authentication token required'));
        }

        console.log('[WS] connect-attempt - Token received for authentication');

        const decoded = verifyToken(token);
        console.log(`[WS] auth-success - Token verified for user ID: ${decoded.id}`);
        
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
          console.log(`[WS] auth-failed - User not found for ID: ${decoded.id}`);
          return next(new Error('User not found'));
        }

        console.log(`[WS] auth-success - ${user.role} authenticated: ${user.email}`);
        socket.user = user;
        next();
      } catch (error) {
        console.log(`[WS] auth-failed - Authentication error: ${error.message}`);
        if (error.name === 'JsonWebTokenError') {
          console.log('[WS] auth-failed - JWT verification failed - invalid token');
        } else if (error.name === 'TokenExpiredError') {
          console.log('[WS] auth-failed - JWT verification failed - token expired');
        } else if (error.name === 'NotBeforeError') {
          console.log('[WS] auth-failed - JWT verification failed - token not active');
        }
        next(new Error('Invalid authentication token'));
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`🔌 User connected: ${socket.user.name} (${socket.user.role}) - Socket: ${socket.id}`);

      // Store connection based on user role
      if (socket.user.role === 'admin') {
        this.connectedAdmins.set(socket.user._id.toString(), socket.id);
      } else if (socket.user.role === 'rider') {
        this.connectedRiders.set(socket.user._id.toString(), socket.id);
      } else if (socket.user.role === 'user') {
        this.connectedCustomers.set(socket.user._id.toString(), socket.id);
      } else {
        this.connectedUsers.set(socket.user._id.toString(), socket.id);
      }

      // Join role-based rooms
      socket.join(`role:${socket.user.role}`);
      socket.join(`user:${socket.user._id}`);
      if (socket.user.role === 'user') {
        socket.join(`user:${socket.user._id}`);
      } else if (socket.user.role === 'vendor') {
        socket.join(`vendor:${socket.user._id}`);
      } else if (socket.user.role === 'rider') {
        socket.join(`rider:${socket.user._id}`);
      }

      socket.on('subscribe:role', () => {
        if (socket.user.role === 'user') socket.join(`user:${socket.user._id}`);
        if (socket.user.role === 'vendor') socket.join(`vendor:${socket.user._id}`);
        if (socket.user.role === 'rider') socket.join(`rider:${socket.user._id}`);
      });

      socket.on('subscribe:order', (orderId) => {
        if (!orderId) return;
        socket.join(`order:${orderId}`);
      });

      socket.on('unsubscribe:order', (orderId) => {
        if (!orderId) return;
        socket.leave(`order:${orderId}`);
      });

      socket.on('order:comm:join', async (payload = {}) => {
        try {
          const orderId = payload?.orderId;
          validateOrderIdOrThrow(orderId);
          const order = await Order.findById(orderId).select('_id userId riderId status');
          if (!order) {
            socket.emit('order:comm:error', { orderId, message: 'Order not found' });
            return;
          }
          if (!canAccessOrderCommunication({ order, actor: socket.user })) {
            socket.emit('order:comm:error', { orderId, message: 'Unauthorized access' });
            return;
          }
          
          const roomName = `order:comm:${orderId}`;
          socket.join(roomName);
          
          console.log(`📡 ${socket.user.role} joined communication room:`, {
            roomName,
            orderId,
            userId: socket.user._id,
            userRole: socket.user.role,
            orderStatus: order.status,
            orderUserId: order.userId,
            orderRiderId: order.riderId
          });
          
          socket.emit('order:comm:joined', { orderId });
        } catch (error) {
          console.error(`❌ Communication join error for ${socket.user?.role}:`, error.message);
          socket.emit('order:comm:error', { orderId: payload?.orderId, message: error?.message || 'Failed to join communication' });
        }
      });

      socket.on('order:comm:message', async (payload = {}) => {
        try {
          const orderId = payload?.orderId;
          validateOrderIdOrThrow(orderId);
          const order = await Order.findById(orderId).select('_id userId riderId status');
          if (!order) {
            socket.emit('order:comm:error', { orderId, message: 'Order not found' });
            return;
          }
          if (!canAccessOrderCommunication({ order, actor: socket.user })) {
            socket.emit('order:comm:error', { orderId, message: 'Unauthorized access' });
            return;
          }

          await ensureActiveWindowOrThrow(order);
          const { message } = await appendOrderCommunicationMessage({
            order,
            actor: socket.user,
            text: payload?.text,
          });

          const messagePayload = {
            id: message._id,
            orderId: String(order._id),
            senderId: message.senderId,
            senderRole: message.senderRole,
            text: message.text,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
          };

          console.log(`📡 Broadcasting communication message:`, {
            orderId: order._id,
            senderRole: message.senderRole,
            senderId: message.senderId,
            textLength: message.text?.length || 0
          });
          
          this.emitOrderCommunication(order._id, messagePayload);
        } catch (error) {
          console.error(`❌ Communication message error for ${socket.user?.role}:`, error.message);
          socket.emit('order:comm:error', { orderId: payload?.orderId, message: error?.message || 'Failed to send communication message' });
        }
      });

      // Handle customer tracking events
      if (socket.user.role === 'user') {
        // Start tracking an order
        socket.on('tracking:start', async (data) => {
          try {
            const { orderId } = data;
            
            // Verify user owns this order
            const Order = await import('../models/Order.js').then(m => m.default);
            const order = await Order.findById(orderId);
            
            if (!order || order.userId.toString() !== socket.user._id.toString()) {
              socket.emit('error', { message: 'Unauthorized' });
              return;
            }

            // Start tracking
            const liveTrackingService = await import('./liveTrackingService.js').then(m => m.default);
            liveTrackingService.startTracking(orderId, socket.user._id);
            
            socket.join(`tracking:${orderId}`);
            socket.emit('tracking:started', { orderId });
            
            console.log(`📍 Customer ${socket.user.email} started tracking order ${orderId}`);
          } catch (error) {
            socket.emit('error', { message: 'Failed to start tracking' });
            console.error('Tracking start error:', error);
          }
        });

        // Stop tracking an order
        socket.on('tracking:stop', (data) => {
          try {
            const { orderId } = data;
            const liveTrackingService = require('./liveTrackingService.js').default;
            liveTrackingService.stopTracking(orderId);
            
            socket.leave(`tracking:${orderId}`);
            socket.emit('tracking:stopped', { orderId });
            
            console.log(`📍 Customer ${socket.user.email} stopped tracking order ${orderId}`);
          } catch (error) {
            socket.emit('error', { message: 'Failed to stop tracking' });
            console.error('Tracking stop error:', error);
          }
        });

        // Get tracking status
        socket.on('tracking:status', async (data) => {
          try {
            const { orderId } = data;
            const liveTrackingService = await import('./liveTrackingService.js').then(m => m.default);
            const status = await liveTrackingService.getOrderTrackingStatus(orderId, socket.user._id);
            
            socket.emit('tracking:status', status);
          } catch (error) {
            socket.emit('error', { message: 'Failed to get tracking status' });
            console.error('Tracking status error:', error);
          }
        });
      }

      // Handle rider location updates
      if (socket.user.role === 'rider') {
        socket.on('rider:location', async (data) => {
          try {
            const { orderId, latitude, longitude, accuracy, heading, speed } = data;
            
            // Verify rider is assigned to this order
            const Order = await import('../models/Order.js').then(m => m.default);
            const order = await Order.findById(orderId);
            
            if (!order || order.riderId?.toString() !== socket.user._id.toString()) {
              socket.emit('error', { message: 'Unauthorized for this order' });
              return;
            }

            // Update rider location
            const liveTrackingService = await import('./liveTrackingService.js').then(m => m.default);
            liveTrackingService.updateRiderLocation(socket.user._id, {
              latitude,
              longitude,
              accuracy,
              heading,
              speed
            }, orderId);
            
            // Send back to rider as confirmation
            socket.emit('location:updated', { orderId, timestamp: new Date() });
          } catch (error) {
            socket.emit('error', { message: 'Failed to update location' });
            console.error('Rider location update error:', error);
          }
        });

        // Get active orders for rider
        socket.on('rider:active_orders', async () => {
          try {
            const Order = await import('../models/Order.js').then(m => m.default);
            const activeOrders = await Order.find({
              riderId: socket.user._id,
              status: { $in: ['Processing', 'Ready', 'OnWay'] }
            }).select('_id status deliveryAddress restaurantId');

            socket.emit('rider:active_orders', activeOrders);
          } catch (error) {
            socket.emit('error', { message: 'Failed to get active orders' });
            console.error('Rider active orders error:', error);
          }
        });
      }

      // Handle finance monitoring subscription (admin only)
      if (socket.user.role === 'admin') {
        socket.on('subscribe:finance', () => {
          socket.join('admin:finance');
          console.log(`💰 Admin ${socket.user.name} subscribed to finance monitoring`);
        });

        socket.on('unsubscribe:finance', () => {
          socket.leave('admin:finance');
          console.log(`💰 Admin ${socket.user.name} unsubscribed from finance monitoring`);
        });

        // Handle order monitoring subscription (admin only)
        socket.on('subscribe:orders', () => {
          socket.join('admin:orders');
          console.log(`👁️ Admin ${socket.user.name} subscribed to order monitoring`);
        });

        socket.on('unsubscribe:orders', () => {
          socket.leave('admin:orders');
          console.log(`👁️ Admin ${socket.user.name} unsubscribed from order monitoring`);
        });

        // Subscribe to specific order updates
        socket.on('subscribe:order', (orderId) => {
          if (!this.orderSubscriptions.has(orderId)) {
            this.orderSubscriptions.set(orderId, new Set());
          }
          this.orderSubscriptions.get(orderId).add(socket.id);
          socket.join(`order:${orderId}`);
          console.log(`👁️ Admin ${socket.user.name} subscribed to order ${orderId}`);
        });

        socket.on('unsubscribe:order', (orderId) => {
          if (this.orderSubscriptions.has(orderId)) {
            this.orderSubscriptions.get(orderId).delete(socket.id);
            if (this.orderSubscriptions.get(orderId).size === 0) {
              this.orderSubscriptions.delete(orderId);
            }
          }
          socket.leave(`order:${orderId}`);
          console.log(`👁️ Admin ${socket.user.name} unsubscribed from order ${orderId}`);
        });
      }

      // Handle live orders request
      socket.on('get:live-orders', async (filters = {}) => {
        if (socket.user.role !== 'admin') {
          socket.emit('error', { message: 'Unauthorized' });
          return;
        }

        try {
          // This will be handled by the controller
          // Just emit the request to trigger a response
          socket.emit('request:live-orders', filters);
        } catch (error) {
          socket.emit('error', { message: 'Failed to fetch live orders' });
        }
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`🔌 User disconnected: ${socket.user.name} (${socket.user.role}) - Reason: ${reason}`);

        // Clean up connections based on role
        if (socket.user.role === 'admin') {
          this.connectedAdmins.delete(socket.user._id.toString());
        } else if (socket.user.role === 'rider') {
          this.connectedRiders.delete(socket.user._id.toString());
        } else if (socket.user.role === 'user') {
          this.connectedCustomers.delete(socket.user._id.toString());
        } else {
          this.connectedUsers.delete(socket.user._id.toString());
        }

        // Clean up order subscriptions
        for (const [orderId, subscribers] of this.orderSubscriptions.entries()) {
          subscribers.delete(socket.id);
          if (subscribers.size === 0) {
            this.orderSubscriptions.delete(orderId);
          }
        }
      });

      // Handle connection errors
      socket.on('error', (error) => {
        console.error(`❌ Socket error for ${socket.user.name}:`, error);
      });

      // Send welcome message
      socket.emit('connected', {
        message: 'Connected to Order Control WebSocket',
        user: {
          id: socket.user._id,
          name: socket.user.name,
          role: socket.user.role
        },
        timestamp: new Date().toISOString()
      });
    });

    console.log('🚀 WebSocket server initialized for real-time order monitoring');
    return this.io;
  }

  buildLifecycleEvent(order, eventName, source = 'system') {
    if (!order) return null;
    const timeline = Array.isArray(order.timeline) ? order.timeline : [];
    return {
      eventName,
      eventVersion: this.eventVersion,
      orderId: String(order._id),
      orderNumber: order.orderNumber || null,
      status: order.status,
      timeline,
      restaurantId: order.restaurantId ? String(order.restaurantId) : null,
      riderId: order.riderId ? String(order.riderId) : null,
      totals: {
        subtotal: Number(order.subtotal || 0),
        deliveryFee: Number(order.deliveryFee || 0),
        gstAndPackaging: Number(order.gstAndPackaging || 0),
        platformFee: Number(order.platformFee || 0),
        total: Number(order.total || 0),
      },
      deliveryAddress: order.deliveryAddress || null,
      paymentMethod: order.paymentMethod || null,
      dispatchState: order.dispatchState || null,
      dispatchExpiresAt: order.dispatchExpiresAt || null,
      assignedAt: order.assignedAt || null,
      candidateRiderIds: Array.isArray(order.candidateRiderIds)
        ? order.candidateRiderIds.map((id) => String(id))
        : [],
      updatedAt: order.updatedAt || new Date(),
      source,
    };
  }

  emitOrderLifecycle({
    order,
    eventName = 'order_updated',
    source = 'system',
    userId = null,
    vendorId = null,
    riderId = null,
    candidateRiderIds = [],
    restaurant = null,
  }) {
    if (!this.io || !order) return;
    const payload = this.buildLifecycleEvent(order, eventName, source);
    if (!payload) return;
    if (eventName === 'order_ready') {
      const riderIds = Array.isArray(candidateRiderIds)
        ? candidateRiderIds.map((id) => String(id))
        : [];
      payload.order = {
        ...formatOrderAssignmentOrderData(order, {
          restaurant,
          riderCount: riderIds.length,
          dispatchedAt: order.dispatchStartedAt || new Date(),
          expiresAt: order.dispatchExpiresAt || new Date(Date.now() + 300000),
        }),
        candidateRiderIds: riderIds,
      };
    }

    this.io.to('admin:orders').emit('order:lifecycle', payload);
    this.io.to(`order:${order._id}`).emit('order:lifecycle', payload);

    const roomTargets = new Set();
    if (userId) roomTargets.add(`user:${String(userId)}`);
    if (vendorId) roomTargets.add(`vendor:${String(vendorId)}`);
    if (riderId) roomTargets.add(`rider:${String(riderId)}`);
    if (Array.isArray(candidateRiderIds)) {
      for (const id of candidateRiderIds) {
        if (id) roomTargets.add(`rider:${String(id)}`);
      }
    }
    for (const room of roomTargets) {
      this.io.to(room).emit('order:lifecycle', payload);
    }

    // If new order - also emit order:new to vendor room
    if (payload.eventName === 'order_created' && vendorId) {
      this.io.to(`vendor:${String(vendorId)}`).emit(
        'order:new',
        payload
      );
      console.log(
        `📡 New order:new emitted to vendor:${vendorId}`
      );
    }

    // Backward compatibility aliases
    this.io.to(`order:${order._id}`).emit('order:update', payload);
    if (eventName === 'order_created') {
      this.io.to(`order:${order._id}`).emit('order:new', payload);
    }
  }

  // Emit order status update to subscribed admins
  emitOrderUpdate(order, updateType = 'status_change') {
    if (!this.io) return;

    const orderData = {
      orderId: order._id,
      status: order.status,
      updateType,
      timestamp: new Date().toISOString(),
      order: {
        id: order._id,
        userId: order.userId,
        restaurantId: order.restaurantId,
        riderId: order.riderId,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        timeline: order.timeline ? order.timeline[order.timeline.length - 1] : null
      }
    };

    // Emit to all admins subscribed to orders
    this.io.to('admin:orders').emit('order:update', orderData);

    // Emit to admins subscribed to this specific order
    this.io.to(`order:${order._id}`).emit('order:update', orderData);

    console.log(`📡 Order update emitted: ${order._id} - ${order.status} (${updateType})`);
  }

  emitOrderCommunication(orderId, messagePayload) {
    if (!this.io || !orderId || !messagePayload) return;
    
    const roomName = `order:comm:${String(orderId)}`;
    console.log(`📡 Emitting communication to room: ${roomName}`, {
      orderId,
      senderRole: messagePayload.senderRole,
      textLength: messagePayload.text?.length || 0
    });
    
    // Emit only to the communication room where both user and rider should be
    this.io.to(roomName).emit('order:comm:new', messagePayload);
  }

  // Emit new order notification
  emitNewOrder(order) {
    if (!this.io) return;

    const orderData = {
      orderId: order._id,
      status: order.status,
      updateType: 'new_order',
      timestamp: new Date().toISOString(),
      order: {
        id: order._id,
        userId: order.userId,
        restaurantId: order.restaurantId,
        riderId: order.riderId,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        items: order.items,
        deliveryAddress: order.deliveryAddress
      }
    };

    // Emit to all admins subscribed to orders
    this.io.to('admin:orders').emit('order:new', orderData);

    console.log(`📡 New order emitted: ${order._id}`);
  }

  // Emit rider assignment update
  emitRiderAssignment(order, riderId, previousRiderId = null) {
    if (!this.io) return;

    const assignmentData = {
      orderId: order._id,
      updateType: 'rider_assignment',
      timestamp: new Date().toISOString(),
      assignment: {
        riderId,
        previousRiderId,
        assignedAt: new Date().toISOString(),
        orderStatus: order.status
      }
    };

    // Emit to all admins subscribed to orders
    this.io.to('admin:orders').emit('order:rider_assigned', assignmentData);

    // Emit to specific order subscribers
    this.io.to(`order:${order._id}`).emit('order:rider_assigned', assignmentData);

    console.log(`📡 Rider assignment emitted: Order ${order._id} -> Rider ${riderId}`);
  }

  // Emit order cancellation
  emitOrderCancellation(order, reason) {
    if (!this.io) return;

    const cancellationData = {
      orderId: order._id,
      updateType: 'order_cancelled',
      timestamp: new Date().toISOString(),
      cancellation: {
        reason,
        cancelledBy: order.cancelledBy,
        cancelledAt: order.updatedAt
      },
      order: {
        id: order._id,
        status: order.status,
        total: order.total
      }
    };

    // Emit to all admins subscribed to orders
    this.io.to('admin:orders').emit('order:cancelled', cancellationData);

    // Emit to specific order subscribers
    this.io.to(`order:${order._id}`).emit('order:cancelled', cancellationData);

    console.log(`📡 Order cancellation emitted: ${order._id} - ${reason}`);
  }

  // Emit refund update
  emitRefundUpdate(order, refundData) {
    if (!this.io) return;

    const refundUpdateData = {
      orderId: order._id,
      updateType: 'refund_update',
      timestamp: new Date().toISOString(),
      refund: {
        ...refundData,
        orderId: order._id
      }
    };

    // Emit to all admins subscribed to orders
    this.io.to('admin:orders').emit('order:refund', refundUpdateData);

    // Emit to all admins subscribed to finance
    this.io.to('admin:finance').emit('finance:refund', refundUpdateData);

    // Emit to specific order subscribers
    this.io.to(`order:${order._id}`).emit('order:refund', refundUpdateData);

    console.log(`📡 Refund update emitted: Order ${order._id} - ₹${refundData.refundAmount}`);
  }

  // Emit finance update for new orders
  emitFinanceUpdate(order, updateType = 'new_order') {
    if (!this.io) return;

    const financeData = {
      orderId: order._id,
      updateType,
      timestamp: new Date().toISOString(),
      order: {
        id: order._id,
        total: order.total,
        commissionAmount: (order.subtotal || 0) * (order.commissionPercent || 10) / 100,
        gstAmount: order.gstAndPackaging || 0,
        platformFee: order.platformFee || 0,
        restaurantId: order.restaurantId,
        status: order.status,
        createdAt: order.createdAt
      }
    };

    // Emit to all admins subscribed to finance
    this.io.to('admin:finance').emit('finance:update', financeData);

    console.log(`💰 Finance update emitted: Order ${order._id} - ₹${order.total}`);
  }

  // Emit settlement update
  emitSettlementUpdate(settlement, updateType = 'status_change') {
    if (!this.io) return;

    const settlementData = {
      settlementId: settlement._id,
      updateType,
      timestamp: new Date().toISOString(),
      settlement: {
        id: settlement._id,
        restaurantId: settlement.restaurantId,
        status: settlement.status,
        finalAmount: settlement.summary?.finalAmount || 0,
        totalOrders: settlement.summary?.totalOrders || 0,
        settlementPeriod: settlement.settlementPeriod
      }
    };

    // Emit to all admins subscribed to finance
    this.io.to('admin:finance').emit('finance:settlement', settlementData);

    console.log(`💰 Settlement update emitted: ${settlement._id} - ${settlement.status}`);
  }

  // Emit wallet balance update
  emitWalletUpdate(restaurantId, newBalance, transactionData) {
    if (!this.io) return;

    const walletData = {
      restaurantId,
      updateType: 'balance_change',
      timestamp: new Date().toISOString(),
      newBalance,
      transaction: {
        amount: transactionData.amount,
        type: transactionData.type,
        status: transactionData.status
      }
    };

    // Emit to all admins subscribed to finance
    this.io.to('admin:finance').emit('finance:wallet', walletData);

    console.log(`💰 Wallet update emitted: Restaurant ${restaurantId} - ₹${newBalance}`);
  }

  // Emit dispute update
  emitDisputeUpdate(dispute, updateType = 'status_change') {
    if (!this.io) return;

    const disputeData = {
      disputeId: dispute._id,
      orderId: dispute.orderId,
      updateType,
      timestamp: new Date().toISOString(),
      dispute: {
        id: dispute._id,
        disputeId: dispute.disputeId,
        orderId: dispute.orderId,
        status: dispute.status,
        priority: dispute.priority,
        disputeType: dispute.disputeType,
        title: dispute.title,
        initiatorId: dispute.initiatorId,
        assignedTo: dispute.assignedTo
      }
    };

    // Emit to all admins
    this.io.to('role:admin').emit('dispute:update', disputeData);

    console.log(`📡 Dispute update emitted: ${dispute.disputeId} - ${dispute.status}`);
  }

  // Get connection statistics
  getConnectionStats() {
    return {
      connectedAdmins: this.connectedAdmins.size,
      connectedUsers: this.connectedUsers.size,
      connectedCustomers: this.connectedCustomers.size,
      connectedRiders: this.connectedRiders.size,
      orderSubscriptions: this.orderSubscriptions.size,
      totalConnections: this.io ? this.io.engine.clientsCount : 0
    };
  }

  // Get IO instance
  getIO() {
    if (!this.io) {
      throw new Error('Socket.io not initialized');
    }
    return this.io;
  }

  sendToSocket(socketId, payload = {}) {
    if (!this.io || !socketId || !payload?.type) return;
    this.io.to(socketId).emit(payload.type, payload.data ?? {});
  }

  // Broadcast system message to all admins
  broadcastToAdmins(message, type = 'info') {
    if (!this.io) return;

    this.io.to('role:admin').emit('system:message', {
      type,
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Handle graceful shutdown
  shutdown() {
    if (this.io) {
      console.log('🔄 Shutting down WebSocket server...');
      this.io.close(() => {
        console.log('✅ WebSocket server shut down successfully');
      });
    }
  }
}

// Singleton instance
const websocketService = new WebSocketService();

export default websocketService;

