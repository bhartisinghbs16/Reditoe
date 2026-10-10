/**
 * Trading requires approval; signing in does not.
 *
 * The two were the same question before: a vendor either had the whole
 * dashboard or could not use the console at all. That leaves an unapproved
 * vendor with valid credentials looking at live order and menu screens for a
 * restaurant that is not on the platform yet.
 *
 * Sign-in and the application endpoints stay open — a vendor has to be able to
 * see why they are waiting, and to correct and resubmit. Everything that is
 * running a restaurant is behind this.
 *
 * The refusal carries the status and reason so the console can draw the right
 * screen from the answer rather than having to ask again.
 */

const MESSAGES = {
  pending:
    'Your application is currently under review. You will be able to access your Vendor Dashboard once your application has been approved.',
  correction_requested:
    'We have asked for some changes to your application. Please review them and submit it again.',
  rejected:
    'Your application was not approved. You can review the reason and submit a corrected application.',
};

export const requireApprovedVendor = (req, res, next) => {
  // vendorAuth runs first and attaches these; without it there is nothing to
  // judge, and refusing here would hide the real problem.
  const status = req.restaurantStatus;
  if (!status) return next();

  if (status === 'approved') return next();

  return res.status(403).json({
    status: 'error',
    code: 'VENDOR_NOT_APPROVED',
    applicationStatus: status,
    reason: req.restaurant?.statusReason || null,
    canResubmit: status === 'rejected' || status === 'correction_requested',
    message: MESSAGES[status] || MESSAGES.pending,
  });
};

export default requireApprovedVendor;
