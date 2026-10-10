import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import Order from '../../models/Order.js';
import FoodItem from '../../models/FoodItem.js';
import mongoose from 'mongoose';

class BulkOperationsController {
  // Bulk vendor approval
  async bulkVendorApproval(req, res) {
    try {
      const { vendorIds, action, reason } = req.body; // action: 'approve' or 'reject'

      if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Vendor IDs array is required'
        });
      }

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({
          status: 'error',
          message: 'Action must be either "approve" or "reject"'
        });
      }

      // Validate vendor IDs
      const validVendorIds = vendorIds.map(id => 
        mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
      ).filter(id => id !== null);

      if (validVendorIds.length !== vendorIds.length) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid vendor IDs provided'
        });
      }

      // Find vendors
      const vendors = await User.find({
        _id: { $in: validVendorIds },
        role: 'vendor'
      });

      if (vendors.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'No vendors found'
        });
      }

      // Perform bulk operation
      const updateData = action === 'approve' 
        ? { status: 'active', kycStatus: 'approved' }
        : { status: 'inactive', kycStatus: 'rejected', rejectionReason: reason || 'Bulk rejection' };

      const result = await User.updateMany(
        { _id: { $in: validVendorIds }, role: 'vendor' },
        { 
          $set: updateData,
          $push: {
            activityLog: {
              action: `bulk_${action}`,
              performedBy: req.user.id,
              timestamp: new Date(),
              reason: reason || `Bulk ${action} operation`
            }
          }
        }
      );

      res.json({
        status: 'success',
        message: `Bulk ${action} completed successfully`,
        data: {
          requested: vendorIds.length,
          processed: result.modifiedCount,
          action
        }
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to perform bulk vendor approval'
      });
    }
  }

  // Bulk restaurant enable/disable
  async bulkRestaurantToggle(req, res) {
    try {
      const { restaurantIds, enabled, reason } = req.body;

      if (!restaurantIds || !Array.isArray(restaurantIds) || restaurantIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Restaurant IDs array is required'
        });
      }

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          status: 'error',
          message: 'Enabled field must be a boolean'
        });
      }

      // Validate restaurant IDs
      const validRestaurantIds = restaurantIds.map(id => 
        mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
      ).filter(id => id !== null);

      if (validRestaurantIds.length !== restaurantIds.length) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid restaurant IDs provided'
        });
      }

      // Find restaurants
      const restaurants = await Restaurant.find({
        _id: { $in: validRestaurantIds }
      });

      if (restaurants.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'No restaurants found'
        });
      }

      // Perform bulk operation
      const result = await Restaurant.updateMany(
        { _id: { $in: validRestaurantIds } },
        { 
          $set: { 
            isActive: enabled,
            status: enabled ? 'active' : 'inactive'
          },
          $push: {
            statusHistory: {
              status: enabled ? 'active' : 'inactive',
              changedBy: req.user.id,
              changedAt: new Date(),
              reason: reason || `Bulk ${enabled ? 'enable' : 'disable'} operation`
            }
          }
        }
      );

      res.json({
        status: 'success',
        message: `Bulk restaurant ${enabled ? 'enable' : 'disable'} completed successfully`,
        data: {
          requested: restaurantIds.length,
          processed: result.modifiedCount,
          enabled
        }
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to perform bulk restaurant toggle'
      });
    }
  }

  // Bulk menu update
  async bulkMenuUpdate(req, res) {
    try {
      const { updates } = req.body; // Array of { foodItemId, updateData }

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Updates array is required'
        });
      }

      const results = [];
      let processed = 0;
      let failed = 0;

      // Process each update
      for (const update of updates) {
        try {
          const { foodItemId, updateData } = update;

          if (!foodItemId || !updateData) {
            failed++;
            results.push({
              foodItemId,
              success: false,
              error: 'Missing foodItemId or updateData'
            });
            continue;
          }

          // Validate food item ID
          if (!mongoose.Types.ObjectId.isValid(foodItemId)) {
            failed++;
            results.push({
              foodItemId,
              success: false,
              error: 'Invalid foodItemId'
            });
            continue;
          }

          // Update food item
          const result = await FoodItem.findByIdAndUpdate(
            foodItemId,
            { 
              $set: { ...updateData, updatedAt: new Date() },
              $push: {
                updateHistory: {
                  updatedBy: req.user.id,
                  updatedAt: new Date(),
                  fields: Object.keys(updateData)
                }
              }
            },
            { new: true }
          );

          if (result) {
            processed++;
            results.push({
              foodItemId,
              success: true,
              data: result
            });
          } else {
            failed++;
            results.push({
              foodItemId,
              success: false,
              error: 'Food item not found'
            });
          }
        } catch (error) {
          failed++;
          results.push({
            foodItemId: update.foodItemId,
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        status: 'success',
        message: 'Bulk menu update completed',
        data: {
          requested: updates.length,
          processed,
          failed,
          results
        }
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to perform bulk menu update'
      });
    }
  }

  // Bulk order status update
  async bulkOrderStatusUpdate(req, res) {
    try {
      const { orderIds, newStatus, reason } = req.body;

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Order IDs array is required'
        });
      }

      const validStatuses = ['Waiting for Confirmation', 'Order Confirmed', 'In Progress', 'Processing', 'Ready', 'OnWay', 'Delivered', 'Cancelled'];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid order status'
        });
      }

      // Validate order IDs
      const validOrderIds = orderIds.map(id => 
        mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
      ).filter(id => id !== null);

      if (validOrderIds.length !== orderIds.length) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid order IDs provided'
        });
      }

      // Find orders
      const orders = await Order.find({
        _id: { $in: validOrderIds }
      });

      if (orders.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'No orders found'
        });
      }

      // Perform bulk operation with transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const results = [];
        let processed = 0;
        let failed = 0;

        for (const orderId of validOrderIds) {
          try {
            const order = await Order.findById(orderId).session(session);
            
            if (!order) {
              failed++;
              results.push({
                orderId,
                success: false,
                error: 'Order not found'
              });
              continue;
            }

            // Update order status
            order.status = newStatus;
            order.timeline.push({
              status: newStatus,
              timestamp: new Date(),
              message: reason || `Status changed to ${newStatus}`
            });

            if (newStatus === 'Cancelled') {
              order.cancelledBy = req.user.id;
              order.cancellationReason = reason || 'Bulk cancellation';
            }

            await order.save({ session });

            processed++;
            results.push({
              orderId,
              success: true,
              previousStatus: order.status,
              newStatus
            });
          } catch (error) {
            failed++;
            results.push({
              orderId,
              success: false,
              error: error.message
            });
          }
        }

        await session.commitTransaction();
        session.endSession();

        res.json({
          status: 'success',
          message: 'Bulk order status update completed',
          data: {
            requested: orderIds.length,
            processed,
            failed,
            newStatus,
            results
          }
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to perform bulk order status update'
      });
    }
  }

  // Get bulk operation statistics
  async getBulkOperationStats(req, res) {
    try {
      const stats = {
        vendors: {
          total: await User.countDocuments({ role: 'vendor' }),
          active: await User.countDocuments({ role: 'vendor', status: 'active' }),
          pending: await User.countDocuments({ role: 'vendor', kycStatus: 'pending' }),
          rejected: await User.countDocuments({ role: 'vendor', kycStatus: 'rejected' })
        },
        restaurants: {
          total: await Restaurant.countDocuments(),
          active: await Restaurant.countDocuments({ isActive: true }),
          inactive: await Restaurant.countDocuments({ isActive: false })
        },
        orders: {
          total: await Order.countDocuments(),
          byStatus: await Order.aggregate([
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ]).then(results => 
            results.reduce((acc, item) => {
              acc[item._id] = item.count;
              return acc;
            }, {})
          )
        },
        foodItems: {
          total: await FoodItem.countDocuments(),
          available: await FoodItem.countDocuments({ isAvailable: true }),
          unavailable: await FoodItem.countDocuments({ isAvailable: false })
        }
      };

      res.json({
        status: 'success',
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to get bulk operation statistics'
      });
    }
  }

  // Bulk user management
  async bulkUserManagement(req, res) {
    try {
      const { userIds, action, reason } = req.body; // action: 'block', 'unblock', 'delete'

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'User IDs array is required'
        });
      }

      if (!['block', 'unblock', 'delete'].includes(action)) {
        return res.status(400).json({
          status: 'error',
          message: 'Action must be block, unblock, or delete'
        });
      }

      // Validate user IDs
      const validUserIds = userIds.map(id => 
        mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
      ).filter(id => id !== null);

      if (validUserIds.length !== userIds.length) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid user IDs provided'
        });
      }

      let result;
      const updateData = {
        $push: {
          activityLog: {
            action: `bulk_${action}`,
            performedBy: req.user.id,
            timestamp: new Date(),
            reason: reason || `Bulk ${action} operation`
          }
        }
      };

      switch (action) {
        case 'block':
          updateData.$set = { isBlocked: true, status: 'inactive' };
          result = await User.updateMany(
            { _id: { $in: validUserIds }, role: { $ne: 'admin' } }, // Don't block admins
            updateData
          );
          break;
        case 'unblock':
          updateData.$set = { isBlocked: false, status: 'active' };
          result = await User.updateMany(
            { _id: { $in: validUserIds }, role: { $ne: 'admin' } },
            updateData
          );
          break;
        case 'delete':
          // Soft delete - mark as deleted instead of removing
          updateData.$set = { isDeleted: true, email: null, phone: null };
          result = await User.updateMany(
            { _id: { $in: validUserIds }, role: { $ne: 'admin' } },
            updateData
          );
          break;
      }

      res.json({
        status: 'success',
        message: `Bulk user ${action} completed successfully`,
        data: {
          requested: userIds.length,
          processed: result.modifiedCount,
          action
        }
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to perform bulk user management'
      });
    }
  }
}

export default new BulkOperationsController();
