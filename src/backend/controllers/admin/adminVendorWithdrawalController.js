import VendorWithdrawal from '../../models/VendorWithdrawal.js';
import mongoose from 'mongoose';

export const getVendorWithdrawalRequests = async (req, res) => {
  try {
    const status = req.query.status;
    const filter = {};
    if (status) filter.status = status;
    const withdrawals = await VendorWithdrawal.find(filter)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .sort({ createdAt: -1 });
    return res.status(200).json({ status: 'success', data: { withdrawals } });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const approveVendorWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ status: 'error', message: 'Invalid id' });
    const withdrawal = await VendorWithdrawal.findById(id);
    if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ status: 'error', message: 'Only pending can be approved' });
    withdrawal.status = 'approved';
    withdrawal.processedBy = req.user.id;
    withdrawal.processedAt = new Date();
    withdrawal.adminNotes = req.body?.adminNotes || '';
    await withdrawal.save();
    return res.status(200).json({ status: 'success', message: 'Approved', data: { withdrawal } });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const rejectVendorWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = (req.body?.rejectionReason || '').trim();
    if (!reason) return res.status(400).json({ status: 'error', message: 'Rejection reason is required' });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ status: 'error', message: 'Invalid id' });
    const withdrawal = await VendorWithdrawal.findById(id);
    if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ status: 'error', message: 'Only pending can be rejected' });
    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = reason;
    withdrawal.processedBy = req.user.id;
    withdrawal.processedAt = new Date();
    await withdrawal.save();
    return res.status(200).json({ status: 'success', message: 'Rejected', data: { withdrawal } });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const processVendorWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const reference = (req.body?.transactionReference || '').trim();
    if (!reference) return res.status(400).json({ status: 'error', message: 'Transaction reference is required' });
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ status: 'error', message: 'Invalid id' });
    const withdrawal = await VendorWithdrawal.findById(id);
    if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Not found' });
    if (withdrawal.status !== 'approved') return res.status(400).json({ status: 'error', message: 'Only approved can be processed' });
    withdrawal.status = 'processed';
    withdrawal.transactionReference = reference;
    withdrawal.processedBy = req.user.id;
    withdrawal.processedAt = new Date();
    await withdrawal.save();
    return res.status(200).json({ status: 'success', message: 'Processed', data: { withdrawal } });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

