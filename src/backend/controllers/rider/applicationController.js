/**
 * The rider's own view of their application.
 *
 * The mirror of the vendor's: authentication and approval are separate
 * questions. A rider can sign in as soon as they have registered, and what
 * they get is decided here — the dashboard once approved, an explanation
 * before that.
 */

import User from '../../models/User.js';

const gateFor = (status) => {
  switch (status) {
    case 'approved':
      return { access: 'dashboard', headline: 'Approved' };
    case 'rejected':
      return {
        access: 'rejected',
        headline: 'Application not approved',
        body:
          'Your application was not approved. The reason is below — you can correct your details and submit it again.',
      };
    default:
      return {
        access: 'review',
        headline: 'Application under review',
        body:
          'Your application is currently under review. You will be able to start taking orders once it has been approved.',
      };
  }
};

/**
 * GET /rider/application
 *
 * Available to any signed-in rider, approved or not — it is the one endpoint
 * that has to work before approval.
 */
export const getMyApplication = async (req, res) => {
  try {
    const rider = await User.findById(req.riderId || req.user?._id).select(
      'name kycStatus kycRejectionReason createdAt riderId'
    );

    if (!rider) {
      return res.status(404).json({ status: 'error', message: 'Rider not found' });
    }

    const status = rider.kycStatus || 'pending';

    res.status(200).json({
      status: 'success',
      data: {
        riderId: rider.riderId,
        name: rider.name,
        applicationStatus: status,
        reason: rider.kycRejectionReason || null,
        submittedAt: rider.createdAt,
        canResubmit: status === 'rejected',
        ...gateFor(status),
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};
