import Notification from '../models/Notification.js';
import UserNotification from '../models/UserNotification.js';
import RiderNotificationRead from '../models/RiderNotificationRead.js';

export const getRiderNotifications = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { tab, page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const allNotifications = [];

    // SOURCE 1 - UserNotification (order/payment/delivery)
    // userType must be 'DeliveryBoy' per schema
    if (!tab || tab === 'all' ||
        tab === 'orders' || tab === 'earnings') {

      let typeFilter = {};
      if (tab === 'orders') {
        typeFilter = {
          type: { $in: ['order', 'delivery', 'general'] }
        };
      } else if (tab === 'earnings') {
        typeFilter = {
          type: { $in: ['payment'] }
        };
      }

      try {
        const userNotifs = await UserNotification.find({
          userId: riderId,
          userType: { $in: ['DeliveryBoy', 'Rider'] },
          ...typeFilter,
        })
          .sort({ createdAt: -1 })
          .limit(Number(limit))
          .lean();

        userNotifs.forEach((n) => {
          allNotifications.push({
            id: n._id.toString(),
            source: 'user',
            category: n.type === 'payment' ? 'earnings'
              : n.type === 'order' || n.type === 'delivery'
                ? 'orders' : 'updates',
            title: n.title || 'Notification',
            body: n.body || '',
            time: n.createdAt,
            unread: !n.read,
          });
        });
      } catch (e) {
        console.error('UserNotification fetch error:', e.message);
      }

      // Fallback - try without userType filter
      if (allNotifications.length === 0) {
        try {
          const fallbackNotifs = await UserNotification.find({
            userId: riderId,
          })
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .lean();

          fallbackNotifs.forEach((n) => {
            allNotifications.push({
              id: n._id.toString(),
              source: 'user',
              category: n.type === 'payment' ? 'earnings'
                : n.type === 'order' || n.type === 'delivery'
                  ? 'orders' : 'updates',
              title: n.title || 'Notification',
              body: n.body || '',
              time: n.createdAt,
              unread: !n.read,
            });
          });
        } catch (e) {
          console.error('Fallback fetch error:', e.message);
        }
      }
    }

    // SOURCE 2 - Admin Notification (promotions/updates)
    if (!tab || tab === 'all' ||
        tab === 'promotions' || tab === 'updates') {

      let adminTypeFilter = {};
      if (tab === 'promotions') {
        adminTypeFilter = { type: 'PROMOTIONAL' };
      } else if (tab === 'updates') {
        adminTypeFilter = {
          type: { $in: ['SYSTEM', 'ALERT', 'ORDER_STATUS'] }
        };
      }

      try {
        const adminNotifs = await Notification.find({
          recipient: { $in: ['RIDERS', 'ALL'] },
          isSent: true,
          ...adminTypeFilter,
        })
          .sort({ createdAt: -1 })
          .limit(Number(limit))
          .lean();
        const adminIds = adminNotifs.map((n) => n._id);
        const readRows = await RiderNotificationRead.find({
          riderId,
          notificationId: { $in: adminIds },
        }).select('notificationId').lean();
        const readMap = new Set(readRows.map((r) => String(r.notificationId)));

        adminNotifs.forEach((n) => {
          allNotifications.push({
            id: n._id.toString(),
            source: 'admin',
            category: n.type === 'PROMOTIONAL' ? 'promotions'
              : n.type === 'ORDER_STATUS' ? 'updates'
              : n.type === 'ALERT' ? 'updates'
              : n.type === 'SYSTEM' ? 'updates'
              : 'updates',
            title: n.title || 'Notification',
            body: n.message || '',
            time: n.createdAt || n.sentAt,
            unread: !readMap.has(String(n._id)),
          });
        });
      } catch (e) {
        console.error('Admin Notification fetch error:', e.message);
      }
    }

    // Sort combined by time
    allNotifications.sort((a, b) =>
      new Date(b.time).getTime() - new Date(a.time).getTime()
    );

    const paginated = allNotifications.slice(skip, skip + Number(limit));
    const unreadCount = allNotifications.filter(n => n.unread).length;

    return res.status(200).json({
      status: 'success',
      data: {
        notifications: paginated,
        unreadCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch notifications',
    });
  }
};

export const markRiderNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const riderId = req.riderId;

    // Try UserNotification first
    try {
      const result = await UserNotification.findOneAndUpdate(
        { _id: id, userId: riderId },
        { read: true, readAt: new Date(), userType: 'DeliveryBoy' },
        { new: true }
      );
      if (result) {
        return res.status(200).json({
          status: 'success',
          message: 'Notification marked as read',
        });
      }
    } catch {}

    // Try admin Notification
    try {
      await RiderNotificationRead.updateOne(
        { riderId, notificationId: id },
        { $set: { readAt: new Date() } },
        { upsert: true }
      );
      await Notification.findByIdAndUpdate(id, {
        $set: { isSent: true },
      });
    } catch {}

    return res.status(200).json({
      status: 'success',
      message: 'Notification marked as read',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to mark as read',
    });
  }
};

export const getRiderUnreadCount = async (req, res) => {
  try {
    const riderId = req.riderId;
    let userUnreadCount = 0;
    let adminUnreadCount = 0;

    try {
      userUnreadCount = await UserNotification.countDocuments({
        userId: riderId,
        userType: { $in: ['DeliveryBoy', 'Rider'] },
        read: false,
      });
    } catch {}
    try {
      const totalAdmin = await Notification.countDocuments({
        recipient: { $in: ['RIDERS', 'ALL'] },
        isSent: true,
      });
      const adminRead = await RiderNotificationRead.countDocuments({
        riderId,
      });
      adminUnreadCount = Math.max(totalAdmin - adminRead, 0);
    } catch {}

    return res.status(200).json({
      status: 'success',
      data: { unreadCount: userUnreadCount + adminUnreadCount },
    });
  } catch (error) {
    return res.status(200).json({
      status: 'success',
      data: { unreadCount: 0 },
    });
  }
};

export const markAllRiderNotificationsRead = async (req, res) => {
  try {
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized',
      });
    }

    await UserNotification.updateMany(
      {
        userId: riderId,
        userType: { $in: ['DeliveryBoy', 'Rider'] },
        read: false,
      },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      }
    );

    const adminNotifs = await Notification.find({
      recipient: { $in: ['RIDERS', 'ALL'] },
      isSent: true,
    }).select('_id').lean();

    const bulkOps = adminNotifs.map((n) => ({
      updateOne: {
        filter: {
          riderId,
          notificationId: n._id,
        },
        update: {
          $set: { readAt: new Date() },
        },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await RiderNotificationRead.bulkWrite(bulkOps);
    }

    return res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to mark all notifications as read',
    });
  }
};
