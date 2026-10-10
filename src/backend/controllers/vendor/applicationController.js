/**
 * The vendor's own view of their application.
 *
 * Authentication and approval are separate questions, and were not being
 * treated that way: a vendor with valid credentials was either in the
 * dashboard or nowhere. A vendor can now always sign in, and what they get is
 * decided here — the dashboard once approved, an explanation before that.
 */

import Restaurant from '../../models/Restaurant.js';

/** What the console should show, from the application's state alone. */
const gateFor = (status) => {
  switch (status) {
    case 'approved':
      return { access: 'dashboard', headline: 'Approved' };
    case 'rejected':
      return {
        access: 'rejected',
        headline: 'Application not approved',
        body:
          'Your application was not approved. The reason is below — you can correct the details and submit it again.',
      };
    case 'correction_requested':
      return {
        access: 'correction',
        headline: 'Changes requested',
        body:
          'We need something changed before your application can be approved. The details are below.',
      };
    default:
      return {
        access: 'review',
        headline: 'Application under review',
        body:
          'Your application is currently under review. You will be able to access your Vendor Dashboard once it has been approved.',
      };
  }
};

/**
 * GET /vendor/application
 *
 * Answers for the signed-in vendor whether they may enter, and if not, why.
 * Deliberately available to any signed-in vendor, approved or not — it is the
 * one endpoint that must work before approval.
 */
export const getMyApplication = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user?._id }).select(
      'name status statusReason statusChangedAt submittedAt approvalHistory kycStatus documentRecords address'
    );

    if (!restaurant) {
      return res.status(200).json({
        status: 'success',
        data: {
          hasApplication: false,
          access: 'none',
          headline: 'No application yet',
          body: 'Complete your restaurant registration to get started.',
        },
      });
    }

    const gate = gateFor(restaurant.status);

    res.status(200).json({
      status: 'success',
      data: {
        hasApplication: true,
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        applicationStatus: restaurant.status,
        reason: restaurant.statusReason || null,
        decidedAt: restaurant.statusChangedAt || null,
        submittedAt: restaurant.submittedAt || null,
        kycStatus: restaurant.kycStatus,
        /** Whether the vendor may edit and send it back. */
        canResubmit:
          restaurant.status === 'rejected' || restaurant.status === 'correction_requested',
        history: (restaurant.approvalHistory || []).map((entry) => ({
          status: entry.status,
          reason: entry.reason || null,
          by: entry.by || null,
          at: entry.at,
        })),
        ...gate,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * POST /vendor/application/resubmit
 *
 * Sends a corrected application back for review. Only from a state the vendor
 * was actually asked to act on — resubmitting something already approved, or
 * still pending, is not a thing that means anything.
 */
export const resubmitApplication = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user?._id });
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'No application found' });
    }

    if (!['rejected', 'correction_requested'].includes(restaurant.status)) {
      return res.status(409).json({
        status: 'error',
        message:
          restaurant.status === 'approved'
            ? 'Your application is already approved.'
            : 'Your application is already with us for review.',
      });
    }

    restaurant.status = 'pending';
    restaurant.statusReason = undefined;
    restaurant.submittedAt = new Date();
    restaurant.approvalHistory = restaurant.approvalHistory || [];
    restaurant.approvalHistory.push({
      status: 'resubmitted',
      reason: req.body?.note?.trim() || undefined,
      by: req.user?.name || 'Vendor',
      at: new Date(),
    });

    await restaurant.save();

    res.status(200).json({
      status: 'success',
      message: 'Application resubmitted. We will review it shortly.',
      data: { applicationStatus: restaurant.status },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};
