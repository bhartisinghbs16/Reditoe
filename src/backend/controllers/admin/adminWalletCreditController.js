/**
 * Crediting customer wallets from the admin console.
 *
 * Two ways in: one customer at a time, or a spreadsheet of them. Both go
 * through the same path, so a bulk upload cannot write a balance a manual
 * credit would have refused.
 *
 * Money is never written straight onto the user document. Every movement
 * lands in the wallet ledger with who did it and why, because a balance that
 * changed with no record of who changed it is not something anyone can audit
 * later - which is also why the customer edit form does not offer the balance
 * as a field.
 */
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import User from '../../models/User.js';
import Wallet from '../../models/Wallet.js';
import WalletTransaction from '../../models/WalletTransaction.js';

/** Nobody credits more than this in one go without splitting it up. */
const MAX_SINGLE_CREDIT = 100000;

/**
 * Puts money into one customer's wallet and records why.
 *
 * The wallet document and the `walletBalance` on the user are kept in step:
 * the app reads one and the console reads the other, and they were allowed to
 * disagree before anything wrote to both.
 */
const creditOne = async ({ user, amount, comment, adminId, adminName, session }) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Amount must be a positive number');
  }
  if (value > MAX_SINGLE_CREDIT) {
    throw new Error(`Amount cannot exceed ${MAX_SINGLE_CREDIT} in one credit`);
  }

  const rounded = Math.round(value * 100) / 100;

  const wallet =
    (await Wallet.findOne({ userId: user._id }).session(session ?? null)) ||
    new Wallet({ userId: user._id, balance: 0 });

  if (wallet.isFrozen) {
    throw new Error('This wallet is frozen');
  }

  const before = Number(wallet.balance || 0);
  const after = Math.round((before + rounded) * 100) / 100;

  wallet.balance = after;
  wallet.totalAdded = Math.round((Number(wallet.totalAdded || 0) + rounded) * 100) / 100;
  wallet.lastTransactionAt = new Date();
  await wallet.save({ session: session ?? undefined });

  await WalletTransaction.create(
    [
      {
        userId: user._id,
        type: 'credit',
        amount: rounded,
        description: comment?.trim() || 'Credited by admin',
        status: 'completed',
        category: 'wallet_topup',
        balanceBefore: before,
        balanceAfter: after,
        // Who did it. A balance that moved with nobody's name against it is
        // not something anyone can settle an argument with later.
        metadata: {
          action: 'add',
          comment: comment?.trim() || '',
          creditedBy: adminId ? String(adminId) : 'admin',
          adjustedBy: adminId ? String(adminId) : 'admin',
          // Named as well as identified: the activity list shows a person,
          // and a bulk credit was appearing there as "by None".
          adjustedByName: adminName || 'admin',
          source: 'admin',
        },
      },
    ],
    { session: session ?? undefined }
  );

  await User.updateOne(
    { _id: user._id },
    { $set: { walletBalance: after } },
    { session: session ?? undefined }
  );

  return { balanceBefore: before, balanceAfter: after, amount: rounded };
};

/**
 * POST /admin/users/:id/wallet/adjust
 * Body: { action: 'add' | 'remove' | 'hold' | 'unhold', amount, comment }
 *
 * One endpoint for the four things an admin can do to a wallet, because they
 * share every rule that matters: a real customer, a positive amount, a reason
 * written down, and a ledger entry naming who did it.
 *
 * The reason is required rather than optional. A balance that moved with no
 * explanation is the thing nobody can settle an argument about later, and
 * these are exactly the movements somebody will ask about.
 */
export const adjustCustomerWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const action = String(req.body?.action ?? 'add').toLowerCase();
    const comment = String(req.body?.comment ?? '').trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid user ID' });
    }
    if (!['add', 'remove', 'hold', 'unhold'].includes(action)) {
      return res.status(400).json({
        status: 'error',
        message: 'action must be add, remove, hold or unhold',
      });
    }
    if (comment.length < 3) {
      return res.status(400).json({
        status: 'error',
        message: 'Give a reason for this change. It is recorded against the wallet.',
      });
    }

    const value = Number(req.body?.amount);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ status: 'error', message: 'Amount must be a positive number' });
    }
    if (value > MAX_SINGLE_CREDIT) {
      return res.status(400).json({
        status: 'error',
        message: `Amount cannot exceed ${MAX_SINGLE_CREDIT} in one change`,
      });
    }
    const amount = Math.round(value * 100) / 100;

    const user = await User.findOne({ _id: id, role: 'user' }).lean();
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }

    const wallet =
      (await Wallet.findOne({ userId: user._id })) ||
      new Wallet({ userId: user._id, balance: 0 });

    if (wallet.isFrozen && action !== 'unhold') {
      return res.status(400).json({ status: 'error', message: 'This wallet is frozen' });
    }

    const before = Number(wallet.balance || 0);
    const heldBefore = Number(wallet.heldAmount || 0);
    const spendable = Math.max(0, before - heldBefore);

    /*
     * Holding and releasing move money between "spendable" and "held"; they
     * do not change the balance, because it is the customer's money either
     * way. Adding and removing change the balance itself.
     */
    if (action === 'remove' && amount > spendable) {
      return res.status(400).json({
        status: 'error',
        message: `Only ${spendable} is available to remove. ${heldBefore} is on hold.`,
      });
    }
    if (action === 'hold' && amount > spendable) {
      return res.status(400).json({
        status: 'error',
        message: `Only ${spendable} is available to hold.`,
      });
    }
    if (action === 'unhold' && amount > heldBefore) {
      return res.status(400).json({
        status: 'error',
        message: `Only ${heldBefore} is on hold.`,
      });
    }

    if (action === 'add') {
      wallet.balance = Math.round((before + amount) * 100) / 100;
      wallet.totalAdded = Math.round((Number(wallet.totalAdded || 0) + amount) * 100) / 100;
    } else if (action === 'remove') {
      wallet.balance = Math.round((before - amount) * 100) / 100;
      wallet.totalSpent = Math.round((Number(wallet.totalSpent || 0) + amount) * 100) / 100;
    } else if (action === 'hold') {
      wallet.heldAmount = Math.round((heldBefore + amount) * 100) / 100;
    } else {
      wallet.heldAmount = Math.round((heldBefore - amount) * 100) / 100;
    }

    wallet.lastTransactionAt = new Date();
    await wallet.save();

    const LEDGER = {
      add: { type: 'credit', label: 'Added by Reditoe' },
      remove: { type: 'debit', label: 'Removed by Reditoe' },
      hold: { type: 'debit', label: 'Put on hold by Reditoe' },
      unhold: { type: 'credit', label: 'Hold released by Reditoe' },
    }[action];

    await WalletTransaction.create({
      userId: user._id,
      type: LEDGER.type,
      amount,
      description: `${LEDGER.label}: ${comment}`,
      status: 'completed',
      // A hold is not a top-up and not a purchase; it is an adjustment.
      category: action === 'add' ? 'wallet_topup' : 'penalty',
      balanceBefore: before,
      balanceAfter: wallet.balance,
      metadata: {
        action,
        comment,
        heldBefore,
        heldAfter: wallet.heldAmount,
        adjustedBy: String(req.user?._id ?? 'admin'),
        adjustedByName: req.user?.name || req.user?.email || 'admin',
        source: 'admin',
      },
    });

    // The app reads this one and the console reads the wallet; they were free
    // to disagree until something wrote to both.
    await User.updateOne({ _id: user._id }, { $set: { walletBalance: wallet.balance } });

    return res.json({
      status: 'success',
      message: `${LEDGER.label.replace(' by Reditoe', '')} ${amount}.`,
      data: {
        balance: wallet.balance,
        heldAmount: wallet.heldAmount,
        spendable: Math.max(0, wallet.balance - wallet.heldAmount),
      },
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Could not change the wallet',
    });
  }
};

/** GET /admin/users/wallet/credit-template - the spreadsheet to fill in. */
export const downloadWalletCreditTemplate = async (_req, res) => {
  /*
   * Headings only.
   *
   * This used to ship a sample row and a blank one. Both fail validation -
   * the sample phone belongs to nobody, the blank row names no customer -
   * and since one bad row stops the whole upload, the file we handed people
   * could never be uploaded. It reported "2 row(s) need fixing" before they
   * had typed anything. The worked example now lives in the Notes sheet,
   * where it cannot be submitted by accident.
   */
  const sheet = XLSX.utils.aoa_to_sheet([
    ['customerId', 'phoneNumber', 'amount', 'comment'],
  ]);
  sheet['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 10 }, { wch: 40 }];

  const notes = XLSX.utils.aoa_to_sheet([
    ['How this file is read'],
    [''],
    ['An example of a filled row, on the Credits sheet:'],
    ['customerId', 'phoneNumber', 'amount', 'comment'],
    ['', '+919876543210', 500, 'Goodwill credit'],
    [''],
    ['Give either customerId or phoneNumber. If both are given, they must'],
    ['point at the same customer, or the row is rejected.'],
    ['amount must be a positive number, at most ' + MAX_SINGLE_CREDIT + '.'],
    ['comment is stored against the credit so the reason survives.'],
    [''],
    ['Every row is checked before any money moves. If one row is wrong,'],
    ['nothing is credited and the problems are listed back to you - a'],
    ['half-applied upload is worse than none.'],
  ]);

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Credits');
  XLSX.utils.book_append_sheet(book, notes, 'Notes');

  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="wallet-credits.xlsx"');
  return res.send(buffer);
};

/**
 * POST /admin/users/wallet/bulk-credit - a spreadsheet of credits.
 *
 * Every row is validated before any money moves. A file that is half applied
 * is worse than one that is refused: nobody can tell which customers were
 * credited without reading the ledger row by row.
 */
export const bulkCreditWallets = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ status: 'error', message: 'Attach an .xlsx file' });
    }

    const book = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = book.Sheets[book.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ status: 'error', message: 'That file has no rows' });
    }
    if (rows.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'That file has more than 1000 rows. Split it up.',
      });
    }

    // ---- Check everything first ----
    const problems = [];
    const planned = [];

    for (const [index, row] of rows.entries()) {
      const line = index + 2; // header is row 1
      const customerId = String(row.customerId ?? '').trim();
      const phone = String(row.phoneNumber ?? '').trim();
      const amount = Number(row.amount);
      const comment = String(row.comment ?? '').trim();

      /*
       * Skip rows with nothing in them. Spreadsheets carry trailing blank
       * rows as a matter of course, and refusing the whole file over one is
       * a puzzle for whoever has to find the row that "needs fixing".
       */
      if (!customerId && !phone && !String(row.amount ?? '').trim() && !comment) {
        continue;
      }

      if (!customerId && !phone) {
        problems.push(`Row ${line}: give either customerId or phoneNumber`);
        continue;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        problems.push(`Row ${line}: amount must be a positive number`);
        continue;
      }
      if (amount > MAX_SINGLE_CREDIT) {
        problems.push(`Row ${line}: amount cannot exceed ${MAX_SINGLE_CREDIT}`);
        continue;
      }

      const query = { role: 'user' };
      if (customerId) {
        if (!mongoose.Types.ObjectId.isValid(customerId)) {
          problems.push(`Row ${line}: customerId is not a valid id`);
          continue;
        }
        query._id = customerId;
      }
      if (phone) query.phone = phone;

      const user = await User.findOne(query).lean();
      if (!user) {
        problems.push(
          `Row ${line}: no customer matches ${customerId || phone}` +
            (customerId && phone ? ' (id and phone must be the same customer)' : '')
        );
        continue;
      }

      planned.push({ user, amount, comment, line });
    }

    if (problems.length === 0 && planned.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Every row in that file is empty',
      });
    }

    if (problems.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Nothing was credited. ${problems.length} row(s) need fixing.`,
        data: { problems },
      });
    }

    // ---- Then move the money ----
    const applied = [];
    const failures = [];
    for (const entry of planned) {
      try {
        const result = await creditOne({
          user: entry.user,
          amount: entry.amount,
          comment: entry.comment,
          adminId: req.user?._id,
          adminName: req.user?.name || req.user?.email || 'admin',
        });
        applied.push({
          line: entry.line,
          customer: entry.user.name || entry.user.phone || entry.user.email,
          amount: result.amount,
          balanceAfter: result.balanceAfter,
        });
      } catch (error) {
        failures.push(`Row ${entry.line}: ${error.message}`);
      }
    }

    return res.json({
      status: failures.length === 0 ? 'success' : 'partial',
      message:
        failures.length === 0
          ? `Credited ${applied.length} customer(s).`
          : `Credited ${applied.length}, but ${failures.length} row(s) failed while writing.`,
      data: { applied, failures },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not read that file',
    });
  }
};

export default {
  adjustCustomerWallet,
  bulkCreditWallets,
  downloadWalletCreditTemplate,
};
