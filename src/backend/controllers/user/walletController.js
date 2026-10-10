import Wallet from '../../models/Wallet.js';
import WalletTransaction from '../../models/WalletTransaction.js';
import User from '../../models/User.js';

/**
 * Customer wallet.
 *
 * The Wallet and WalletTransaction models already existed but were only
 * reachable through admin and rider routes; this exposes the customer's own
 * balance and ledger for the app's Wallet screen.
 */

const MIN_TRANSFER = 100;

/** One wallet per user, created on first read rather than at signup. */
const walletFor = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) wallet = await Wallet.create({ userId, balance: 0 });
  return wallet;
};

/** GET /api/wallet */
export const getWallet = async (req, res) => {
  try {
    const wallet = await walletFor(req.user._id);
    const transactions = await WalletTransaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      status: 'success',
      data: {
        wallet: {
          balance: wallet.balance,
          currency: wallet.currency || 'INR',
          minTransfer: MIN_TRANSFER,
          /*
           * Money held back by support - a disputed refund, a chargeback
           * under review. It is still the customer's, so it stays in the
           * balance, but it cannot be paid with, and saying so here is
           * kinder than letting checkout refuse the amount they can see.
           */
          heldAmount: Number(wallet.heldAmount || 0),
          spendable: wallet.isFrozen
            ? 0
            : Math.max(0, Number(wallet.balance || 0) - Number(wallet.heldAmount || 0)),
          isFrozen: Boolean(wallet.isFrozen),
        },
        transactions: transactions.map((txn) => ({
          id: txn._id,
          title: txn.description || (txn.type === 'credit' ? 'Added to Wallet' : 'Wallet debit'),
          type: txn.type,
          amount: txn.type === 'credit' ? txn.amount : -txn.amount,
          at: txn.createdAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** GET /api/wallet/transactions — the full ledger, paged. */
export const getTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      WalletTransaction.countDocuments({ userId: req.user._id }),
    ]);

    res.json({
      status: 'success',
      results: transactions.length,
      data: {
        transactions: transactions.map((txn) => ({
          id: txn._id,
          title: txn.description || (txn.type === 'credit' ? 'Added to Wallet' : 'Wallet debit'),
          type: txn.type,
          amount: txn.type === 'credit' ? txn.amount : -txn.amount,
          at: txn.createdAt,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * POST /api/wallet/add-money
 *
 * Credits the wallet, writing the ledger row before moving the balance so the
 * two can never disagree. Multi-document transactions are not an option:
 * standalone MongoDB, which local development and the in-memory server both
 * are, rejects them.
 */
export const addMoney = async (req, res) => {
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Provide a positive amount to add' });
  }

  try {
    const wallet = await walletFor(req.user._id);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    // Ledger first: if it fails the balance has not moved, so the two can
    // never disagree. Writing the balance first left them out of step.
    await WalletTransaction.create({
      userId: req.user._id,
      type: 'credit',
      amount,
      description: req.body.description || 'Added to Wallet',
      category: 'wallet_topup',
      status: 'completed',
      balanceBefore,
      balanceAfter,
    });

    wallet.balance = balanceAfter;
    await wallet.save();
    await User.findByIdAndUpdate(req.user._id, { walletBalance: balanceAfter });

    res.status(201).json({
      status: 'success',
      data: { balance: balanceAfter, added: amount },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** POST /api/wallet/send-to-bank — debits the wallet for a payout. */
export const sendToBank = async (req, res) => {
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount < MIN_TRANSFER) {
    return res.status(400).json({
      status: 'error',
      message: `Minimum transfer is ₹${MIN_TRANSFER}`,
    });
  }

  try {
    const wallet = await walletFor(req.user._id);

    /*
     * Only what is not on hold may leave the wallet.
     *
     * This read the raw balance, so a customer could withdraw to their bank
     * the very money support was withholding pending a dispute - the one
     * route where getting it wrong means the money is gone.
     */
    if (wallet.isFrozen) {
      return res.status(400).json({
        status: 'error',
        message: 'This wallet is on hold. Contact support.',
      });
    }

    const available = Math.max(
      0,
      Number(wallet.balance || 0) - Number(wallet.heldAmount || 0)
    );
    if (available < amount) {
      return res.status(400).json({
        status: 'error',
        message: `Insufficient balance. Available: ₹${available}`,
      });
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - amount;

    await WalletTransaction.create({
      userId: req.user._id,
      type: 'debit',
      amount,
      description: req.body.bankLabel ? `Sent to ${req.body.bankLabel}` : 'Sent to Bank',
      category: 'withdrawal',
      status: 'completed',
      balanceBefore,
      balanceAfter,
    });

    wallet.balance = balanceAfter;
    await wallet.save();
    await User.findByIdAndUpdate(req.user._id, { walletBalance: balanceAfter });

    res.json({
      status: 'success',
      data: { balance: balanceAfter, sent: amount },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

