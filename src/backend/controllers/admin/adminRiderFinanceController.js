/**
 * A delivery partner's paperwork and money, for the console.
 *
 * The partner screen could show a name, a vehicle and a list of file links.
 * Everything a vendor's screen carries - what each document says, what the
 * partner has earned, what has been paid out, what is still owed - either
 * lived on other screens or nowhere at all. This answers those questions for
 * one partner.
 *
 * Nothing here moves money. Withdrawals are approved and paid where they
 * already were, so reading a partner's position and paying them stay
 * separate actions.
 */
import mongoose from 'mongoose';
import DeliveryBoy from '../../models/DeliveryBoy.js';
import User from '../../models/User.js';
import RiderWallet from '../../models/RiderWallet.js';
import RiderWithdrawal from '../../models/RiderWithdrawal.js';
import RiderEarning from '../../models/RiderEarning.js';
import RiderBankAccount from '../../models/RiderBankAccount.js';
import Order from '../../models/Order.js';
import {
  RIDER_DOCUMENT_TYPES,
  resolveRiderDocumentType,
  deriveRiderKycStatus,
} from '../../utils/riderDocuments.js';

const round = (value) => Number(Number(value || 0).toFixed(2));

/**
 * The partner, from whichever collection holds them.
 *
 * Riders live in `users` with role 'rider' or in `deliveryboys`, depending on
 * how they joined - the list screen already reads both. Anything that takes a
 * partner id has to look in both, or it works for half the fleet and 404s for
 * the rest.
 */
async function findRider(id, { lean = false } = {}) {
  const asUser = lean
    ? await User.findOne({ _id: id, role: 'rider' }).lean()
    : await User.findOne({ _id: id, role: 'rider' });
  if (asUser) return { doc: asUser, model: User };

  const asDeliveryBoy = lean
    ? await DeliveryBoy.findById(id).lean()
    : await DeliveryBoy.findById(id);
  if (asDeliveryBoy) return { doc: asDeliveryBoy, model: DeliveryBoy };

  return null;
}

/**
 * The document records, seeded from the URLs already on file.
 *
 * Partners uploaded documents long before there was anywhere to record their
 * details, so a rider with three files would otherwise show three empty rows.
 * The URL is the one fact those old uploads carry; it is enough to list the
 * document as filed and awaiting a decision.
 */
function recordsFor(rider) {
  const records = {};
  const stored = rider.documentRecords || {};
  const legacy = rider.kycDocuments || {};

  for (const type of RIDER_DOCUMENT_TYPES) {
    const existing = stored instanceof Map ? stored.get(type.key) : stored[type.key];
    const url = existing?.url || (type.legacy ? legacy[type.legacy] : null) || null;
    records[type.key] = {
      key: type.key,
      label: type.label,
      required: type.required,
      expires: type.expires,
      url,
      number: existing?.number ?? null,
      uploadedAt: existing?.uploadedAt ?? null,
      expiryDate: existing?.expiryDate ?? null,
      status: url ? existing?.status || 'pending' : null,
      verifiedBy: existing?.verifiedBy ?? null,
      verifiedAt: existing?.verifiedAt ?? null,
      note: existing?.note ?? null,
    };
  }
  return records;
}

/** GET /admin/riders/:id/documents */
export const getRiderDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid partner ID' });
    }
    const found = await findRider(id, { lean: true });
    if (!found) {
      return res.status(404).json({ status: 'error', message: 'Delivery partner not found' });
    }
    const rider = found.doc;
    const records = recordsFor(rider);
    return res.json({
      status: 'success',
      data: {
        kycStatus: rider.kycStatus ?? deriveRiderKycStatus(records),
        documents: Object.values(records),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not read the documents',
    });
  }
};

/**
 * PATCH /admin/riders/:id/documents/:documentType
 * Body: { number, uploadedAt, expiryDate, status, verifiedBy, note }
 *
 * Correct what was recorded against one document. Only the fields sent are
 * touched, so a form that changes one thing does not blank the rest.
 */
export const updateRiderDocument = async (req, res) => {
  try {
    const { id, documentType } = req.params;
    const type = resolveRiderDocumentType(documentType);
    if (!type) {
      return res.status(400).json({
        status: 'error',
        message:
          'Unknown document type. Allowed types: ' +
          RIDER_DOCUMENT_TYPES.map((entry) => entry.key).join(', '),
      });
    }

    const found = await findRider(id);
    if (!found) {
      return res.status(404).json({ status: 'error', message: 'Delivery partner not found' });
    }
    const rider = found.doc;

    if (!rider.documentRecords) rider.documentRecords = new Map();
    const existing = rider.documentRecords.get(type.key);
    const current = existing?.toObject ? existing.toObject() : existing || {};

    // An older upload may exist only as a URL on kycDocuments.
    if (!current.url && type.legacy && rider.kycDocuments?.[type.legacy]) {
      current.url = rider.kycDocuments[type.legacy];
    }

    const next = { ...current };
    const has = (field) => Object.prototype.hasOwnProperty.call(req.body, field);

    if (has('number')) next.number = String(req.body.number ?? '').trim() || undefined;
    if (has('note')) next.note = String(req.body.note ?? '').trim() || undefined;

    for (const field of ['uploadedAt', 'expiryDate']) {
      if (!has(field)) continue;
      const raw = req.body[field];
      if (!raw) {
        next[field] = undefined;
        continue;
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          status: 'error',
          message: `${field} is not a date I can read`,
        });
      }
      next[field] = parsed;
    }

    if (next.uploadedAt && next.expiryDate && next.expiryDate < next.uploadedAt) {
      return res.status(400).json({
        status: 'error',
        message: 'The expiry date cannot be before the upload date',
      });
    }

    if (has('status')) {
      const status = String(req.body.status ?? '').toLowerCase();
      const allowed = ['pending', 'verified', 'rejected'];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: `status must be one of: ${allowed.join(', ')}`,
        });
      }
      // The partner's KYC state follows from these rows, so verifying one
      // that has no file would approve somebody nobody has checked.
      if (status === 'verified' && !next.url) {
        return res.status(400).json({
          status: 'error',
          message: `No ${type.label} has been uploaded, so it cannot be marked verified.`,
        });
      }
      next.status = status;
      if (status === 'pending') {
        next.verifiedBy = undefined;
        next.verifiedAt = undefined;
      } else if (!next.verifiedAt) {
        next.verifiedAt = new Date();
      }
    }

    if (has('verifiedBy')) {
      next.verifiedBy = String(req.body.verifiedBy ?? '').trim() || undefined;
    }
    if (!next.verifiedBy && next.status && next.status !== 'pending') {
      next.verifiedBy = req.user?.name || req.user?.email || 'Admin';
    }

    rider.documentRecords.set(type.key, next);

    /*
     * Only let the documents decide KYC once documents exist.
     *
     * Partners were approved by hand long before there was anywhere to record
     * a document, so deriving their state from empty rows would quietly
     * un-approve an active partner the moment somebody corrected a typo in a
     * licence number. The paperwork governs once there is paperwork.
     */
    const anyFiled = [...rider.documentRecords.values()].some((entry) => entry?.url);
    if (anyFiled) {
      rider.kycStatus = deriveRiderKycStatus(rider.documentRecords);
    }

    await rider.save();

    return res.json({
      status: 'success',
      message: `${type.label} updated`,
      data: {
        kycStatus: rider.kycStatus,
        document: rider.documentRecords.get(type.key),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not update the document',
    });
  }
};

/**
 * GET /admin/riders/:id/payouts
 *
 * Where this partner stands: what they have earned, what has been paid, what
 * is waiting, and the account it goes to.
 */
export const getRiderPayouts = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid partner ID' });
    }

    const found = await findRider(id, { lean: true });
    if (!found) {
      return res.status(404).json({ status: 'error', message: 'Delivery partner not found' });
    }
    const rider = found.doc;

    const riderId = new mongoose.Types.ObjectId(id);

    const [wallet, bankAccount, withdrawalRows, earningTotals, withdrawals, earnings] =
      await Promise.all([
        RiderWallet.findOne({ riderId }).lean(),
        RiderBankAccount.findOne({ riderId }).sort({ createdAt: -1 }).lean(),
        RiderWithdrawal.aggregate([
          { $match: { riderId } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              amount: { $sum: { $ifNull: ['$amount', 0] } },
            },
          },
        ]),
        RiderEarning.aggregate([
          { $match: { riderId } },
          {
            $group: {
              _id: null,
              deliveries: { $sum: 1 },
              deliveryFee: { $sum: { $ifNull: ['$deliveryFee', 0] } },
              incentive: { $sum: { $ifNull: ['$incentive', 0] } },
              penalty: { $sum: { $ifNull: ['$penalty', 0] } },
              total: { $sum: { $ifNull: ['$totalEarning', 0] } },
            },
          },
        ]),
        RiderWithdrawal.find({ riderId }).sort({ createdAt: -1 }).limit(25).lean(),
        RiderEarning.find({ riderId })
          .sort({ createdAt: -1 })
          .limit(25)
          .populate('orderId', 'orderNumber')
          .lean(),
      ]);

    const byStatus = Object.fromEntries(
      withdrawalRows.map((row) => [row._id, { count: row.count, amount: round(row.amount) }])
    );
    const totals = earningTotals[0] || {};

    const bank = bankAccount || rider.bankDetails || {};

    return res.json({
      status: 'success',
      data: {
        terms: {
          perKmCharge: rider.perKmCharge ?? null,
          kycStatus: rider.kycStatus ?? 'pending',
          isBlocked: Boolean(rider.isBlocked),
        },
        /* Enough of the account to recognise it, not enough to use it. */
        bank: {
          accountHolderName: bank.accountHolderName || null,
          bankName: bank.bankName || null,
          ifsc: bank.ifscCode || bank.ifsc || null,
          accountNumberLast4: bank.accountNumber
            ? String(bank.accountNumber).slice(-4)
            : null,
          verified: bank.isVerified ?? null,
          verificationStatus: bank.verificationStatus || null,
        },
        summary: {
          walletBalance: round(wallet?.balance),
          bonusBalance: round(wallet?.bonusBalance),
          totalEarned: round(wallet?.totalEarnings ?? totals.total),
          totalWithdrawn: round(wallet?.totalWithdrawn ?? byStatus.completed?.amount),
          awaitingApproval: byStatus.pending ?? { count: 0, amount: 0 },
          paid: byStatus.completed ?? { count: 0, amount: 0 },
          rejected: byStatus.rejected ?? { count: 0, amount: 0 },
          deliveries: totals.deliveries ?? 0,
          deliveryFees: round(totals.deliveryFee),
          incentives: round(totals.incentive),
          penalties: round(totals.penalty),
        },
        // Payout history: every withdrawal this partner has asked for.
        payouts: withdrawals.map((row) => ({
          id: row._id,
          reference: row.withdrawalId || null,
          amount: round(row.amount),
          type: row.withdrawalType || null,
          status: row.status,
          isAutopay: Boolean(row.isAutopay),
          autopayStatus: row.autopayStatus || null,
          bankLast4: row.bankDetails?.accountNumber
            ? String(row.bankDetails.accountNumber).slice(-4)
            : null,
          requestedAt: row.createdAt,
          processedAt: row.processedAt || null,
        })),
        // Transaction history: what each delivery paid, and why.
        transactions: earnings.map((row) => ({
          id: row._id,
          orderNumber: row.orderId?.orderNumber || null,
          deliveryFee: round(row.deliveryFee),
          incentive: round(row.incentive),
          penalty: round(row.penalty),
          total: round(row.totalEarning),
          distance: row.distance ?? null,
          status: row.status || null,
          at: row.createdAt,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not read the payout details',
    });
  }
};

/**
 * GET /admin/riders/:id/activity
 *
 * One timeline: deliveries, earnings and withdrawal requests, newest first.
 * Read apart, none of them explains a balance that moved.
 */
export const getRiderActivity = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid partner ID' });
    }
    const riderId = new mongoose.Types.ObjectId(id);

    const [orders, earnings, withdrawals] = await Promise.all([
      Order.find({ riderId })
        .select('orderNumber status createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      RiderEarning.find({ riderId })
        .select('totalEarning penalty incentive createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      RiderWithdrawal.find({ riderId })
        .select('withdrawalId amount status createdAt processedAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const rows = [
      ...orders.map((order) => ({
        kind: 'order',
        title: `Order ${order.orderNumber ?? ''} ${String(order.status ?? '').toLowerCase()}`.trim(),
        at: order.createdAt,
      })),
      ...earnings.map((earning) => ({
        kind: 'earning',
        title: `Earned ${round(earning.totalEarning)}`,
        detail: [
          earning.incentive ? `incentive ${round(earning.incentive)}` : null,
          earning.penalty ? `penalty ${round(earning.penalty)}` : null,
        ]
          .filter(Boolean)
          .join(', '),
        at: earning.createdAt,
      })),
      ...withdrawals.map((withdrawal) => ({
        kind: 'withdrawal',
        title: `Withdrawal ${round(withdrawal.amount)} ${withdrawal.status}`,
        detail: withdrawal.withdrawalId || '',
        at: withdrawal.processedAt || withdrawal.createdAt,
      })),
    ]
      .filter((row) => row.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 20);

    return res.json({ status: 'success', data: { activity: rows } });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not read the activity',
    });
  }
};

export default {
  getRiderDocuments,
  updateRiderDocument,
  getRiderPayouts,
  getRiderActivity,
};
