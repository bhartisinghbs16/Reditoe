import crypto from 'crypto';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import DeviceSession from '../models/DeviceSession.js';
import AccountDeletionRequest from '../models/AccountDeletionRequest.js';
import { readIdentifier } from '../utils/identifier.js';

/**
 * Letting people delete their account.
 *
 * Google Play requires two things: a way to do it inside the app, and a web
 * page where somebody who no longer has the app can ask. Both are here.
 *
 * Deleting removes the personal details - name, number, email, photo,
 * addresses, bank and identity details, device tokens - and signs the person
 * out everywhere. What the law makes the business keep (orders, invoices,
 * payments, payouts) stays, attached to an account that now reads "Deleted
 * user", so a vendor's sales and a customer's tax invoice do not change.
 */

/** An order in any of these is finished, or never really started. */
const FINISHED = ['Delivered', 'Cancelled', 'Payment Pending'];

/** What stops an account being deleted right now, or null. */
export const blockerFor = async (user) => {
  const role = user.role || 'user';

  if (role === 'user') {
    const open = await Order.countDocuments({ userId: user._id, status: { $nin: FINISHED } });
    if (open) return 'You have an order in progress. You can delete your account once it is delivered or cancelled.';
  }

  if (role === 'rider') {
    const open = await Order.countDocuments({ riderId: user._id, status: { $nin: FINISHED } });
    if (open) return 'You have a delivery in progress. Finish it before deleting your account.';
  }

  if (role === 'vendor') {
    const ids = (await Restaurant.find({ owner: user._id }).select('_id').lean()).map((r) => r._id);
    if (ids.length) {
      const open = await Order.countDocuments({ restaurantId: { $in: ids }, status: { $nin: FINISHED } });
      if (open) return 'Your restaurant has orders in progress. Complete them before deleting your account.';
    }
  }

  if (role === 'admin') return 'Admin accounts cannot be deleted from the app.';
  return null;
};

/** Personal fields cleared from the account record. */
const CLEARED = [
  'avatar', 'profilePhoto', 'dateOfBirth', 'location', 'googleId',
  'savedAddresses', 'fcmTokens', 'bankDetails', 'kycDocuments',
  'emergencyContactName', 'emergencyRelationship', 'emergencyContactPhone',
  'liveLocation', 'kycDetails', 'verification', 'resetOTP', 'resetOTPExpiry',
];

export const anonymiseAccount = async (user) => {
  const id = String(user._id);
  const unset = {};
  for (const field of CLEARED) unset[field] = 1;

  await User.collection.updateOne(
    { _id: user._id },
    {
      $set: {
        name: 'Deleted user',
        email: `deleted+${id}@deleted.reditoe.com`,
        // Freed so the same number can sign up again as a new account.
        phone: `deleted-${id}`,
        isBlocked: true,
        isOnline: false,
        status: 'inactive',
        deletedAt: new Date(),
        password: crypto.randomBytes(24).toString('hex'),
      },
      $unset: unset,
    }
  );

  await DeviceSession.deleteMany({ user: user._id });

  if ((user.role || 'user') === 'vendor') {
    await Restaurant.updateMany(
      { owner: user._id },
      { $set: { isEnabled: false, isOpen: false, phone: '' } }
    );
  }
};

/** POST /api/auth/delete-account  { confirm: "DELETE" } - signed in, any app. */
export const deleteMyAccount = async (req, res) => {
  try {
    if (String(req.body?.confirm || '').trim().toUpperCase() !== 'DELETE') {
      return res.status(400).json({
        status: 'error',
        success: false,
        message: 'Type DELETE to confirm that you want to delete your account.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user || user.deletedAt) {
      return res.status(404).json({ status: 'error', success: false, message: 'Account not found.' });
    }

    const blocker = await blockerFor(user);
    if (blocker) {
      return res.status(409).json({ status: 'error', success: false, code: 'delete_blocked', message: blocker });
    }

    await anonymiseAccount(user);

    return res.json({
      status: 'success',
      success: true,
      message: 'Your account has been deleted.',
    });
  } catch (error) {
    console.error('[account] delete failed:', error?.message || error);
    return res.status(500).json({
      status: 'error',
      success: false,
      message: 'We could not delete your account right now. Please try again.',
    });
  }
};

/**
 * POST /api/public/account-deletion-request  { phone, role, email?, reason? }
 *
 * For somebody who cannot open the app. Anyone can type any number into a web
 * form, so this only records the request; the team confirms it is genuine
 * (by calling the number) before deleting anything.
 */
export const requestAccountDeletion = async (req, res) => {
  try {
    const identifier = readIdentifier(String(req.body?.phone ?? '').replace(/[\s-]/g, ''));
    if (identifier.kind !== 'phone') {
      return res.status(400).json({
        success: false,
        message: 'Enter the 10-digit mobile number your account uses.',
      });
    }
    const role = ['user', 'vendor', 'rider'].includes(req.body?.role) ? req.body.role : 'user';
    const email = String(req.body?.email || '').trim().slice(0, 200);
    const reason = String(req.body?.reason || '').trim().slice(0, 1000);

    await AccountDeletionRequest.create({ phone: identifier.value, role, email, reason });

    return res.status(201).json({
      success: true,
      message:
        'Thank you. We have received your request and will confirm it with you by phone, then delete the account within 30 days.',
    });
  } catch (error) {
    console.error('[account] deletion request failed:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Could not save your request. Please try again.' });
  }
};

/** GET /api/admin/account-deletion-requests - for the team. */
export const listDeletionRequests = async (req, res) => {
  const requests = await AccountDeletionRequest.find().sort({ createdAt: -1 }).limit(200).lean();
  res.json({ success: true, data: requests });
};
