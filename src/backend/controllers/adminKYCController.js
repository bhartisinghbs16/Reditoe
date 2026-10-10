/**
 * Admin KYC Controller
 * Handles admin-side KYC verification and approval workflow
 */

import VendorKYC from '../models/VendorKYC.js';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import FileUpload from '../models/FileUpload.js';

/**
 * Get all KYC applications - GET /api/admin/kyc/applications
 */
export const getKycApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    
    // Build query
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { 'personalInfo.firstName': { $regex: search, $options: 'i' } },
        { 'personalInfo.lastName': { $regex: search, $options: 'i' } },
        { 'businessInfo.businessName': { $regex: search, $options: 'i' } },
        { 'personalInfo.email': { $regex: search, $options: 'i' } },
        { 'personalInfo.phone': { $regex: search, $options: 'i' } },
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const applications = await VendorKYC.find(query)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('reviewedBy', 'name email')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await VendorKYC.countDocuments(query);
    
    res.status(200).json({
      status: 'success',
      data: {
        applications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch KYC applications',
    });
  }
};

/**
 * Get KYC application details - GET /api/admin/kyc/:id
 */
export const getKycApplicationDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid KYC application ID',
      });
    }
    
    const application = await VendorKYC.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name address')
      .populate('reviewedBy', 'name email')
      .populate('documents.verifiedBy', 'name email');
    
    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'KYC application not found',
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: application,
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch KYC application details',
    });
  }
};

/**
 * Approve KYC application - POST /api/admin/kyc/:id/approve
 */
export const approveKycApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid KYC application ID',
      });
    }
    
    const application = await VendorKYC.findById(id);
    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'KYC application not found',
      });
    }
    
    if (application.status !== 'submitted' && application.status !== 'under_review') {
      return res.status(400).json({
        status: 'error',
        message: 'KYC application must be submitted or under review to approve',
      });
    }
    
    // Approve KYC
    await application.approveKYC(adminId, notes);
    
    // Update restaurant status
    await Restaurant.findByIdAndUpdate(application.restaurantId, {
      kycStatus: 'approved',
      isEnabled: true,
      status: 'approved',
    });
    
    // Update user role if needed
    await User.findByIdAndUpdate(application.vendorId, {
      kycStatus: 'approved',
    });
    
    res.status(200).json({
      status: 'success',
      message: 'KYC application approved successfully',
      data: {
        applicationId: application._id,
        status: 'verified',
        approvedAt: application.verifiedAt,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to approve KYC application',
    });
  }
};

/**
 * Reject KYC application - POST /api/admin/kyc/:id/reject
 */
export const rejectKycApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reasons, notes } = req.body;
    const adminId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid KYC application ID',
      });
    }
    
    if (!reasons || !Array.isArray(reasons) || reasons.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Rejection reasons are required',
      });
    }
    
    const application = await VendorKYC.findById(id);
    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'KYC application not found',
      });
    }
    
    if (application.status !== 'submitted' && application.status !== 'under_review') {
      return res.status(400).json({
        status: 'error',
        message: 'KYC application must be submitted or under review to reject',
      });
    }
    
    // Reject KYC
    await application.rejectKYC(adminId, reasons, notes);
    
    // Update restaurant status
    await Restaurant.findByIdAndUpdate(application.restaurantId, {
      kycStatus: 'rejected',
      isEnabled: false,
    });
    
    // Update user status
    await User.findByIdAndUpdate(application.vendorId, {
      kycStatus: 'rejected',
    });
    
    res.status(200).json({
      status: 'success',
      message: 'KYC application rejected successfully',
      data: {
        applicationId: application._id,
        status: 'rejected',
        rejectedAt: application.rejectedAt,
        rejectionReasons: reasons,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to reject KYC application',
    });
  }
};

/**
 * Verify individual document - POST /api/admin/kyc/:id/documents/:documentType/verify
 */
export const verifyDocument = async (req, res) => {
  try {
    const { id, documentType } = req.params;
    const { status, rejectionReason } = req.body;
    const adminId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid KYC application ID',
      });
    }
    
    const application = await VendorKYC.findById(id);
    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'KYC application not found',
      });
    }
    
    // Verify document
    await application.verifyDocument(documentType, adminId, status, rejectionReason);
    
    res.status(200).json({
      status: 'success',
      message: `Document ${documentType} ${status} successfully`,
      data: {
        documentType,
        status,
        verifiedAt: new Date(),
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to verify document',
    });
  }
};

/**
 * Get KYC statistics - GET /api/admin/kyc/stats
 */
export const getKycStats = async (req, res) => {
  try {
    const stats = await VendorKYC.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$count' },
          statuses: {
            $push: {
              status: '$_id',
              count: '$count',
            },
          },
        },
      },
    ]);
    
    const statusBreakdown = stats[0]?.statuses || [];
    const totalApplications = stats[0]?.total || 0;
    
    // Calculate completion rate
    const completedApplications = statusBreakdown.find(s => s.status === 'verified')?.count || 0;
    const completionRate = totalApplications > 0 ? (completedApplications / totalApplications) * 100 : 0;
    
    // Get recent applications
    const recentApplications = await VendorKYC.find()
      .populate('vendorId', 'name email')
      .sort({ submittedAt: -1 })
      .limit(5);
    
    res.status(200).json({
      status: 'success',
      data: {
        totalApplications,
        completionRate: Math.round(completionRate * 100) / 100,
        statusBreakdown,
        recentApplications,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch KYC statistics',
    });
  }
};

/**
 * Download KYC document - GET /api/admin/kyc/:id/documents/:documentType/download
 */
export const downloadKycDocument = async (req, res) => {
  try {
    const { id, documentType } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid KYC application ID',
      });
    }
    
    const application = await VendorKYC.findById(id);
    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'KYC application not found',
      });
    }
    
    const document = application.documents.find(doc => doc.type === documentType);
    if (!document) {
      return res.status(404).json({
        status: 'error',
        message: 'Document not found',
      });
    }
    
    // Get file record for additional info
    const fileRecord = await FileUpload.findById(document.filename);
    if (!fileRecord) {
      return res.status(404).json({
        status: 'error',
        message: 'File record not found',
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        document: {
          type: document.type,
          url: document.url,
          filename: fileRecord.originalName,
          uploadedAt: document.uploadedAt,
          status: document.status,
          verifiedAt: document.verifiedAt,
          rejectionReason: document.rejectionReason,
        },
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to download document',
    });
  }
};

export default {
  getKycApplications,
  getKycApplicationDetails,
  approveKycApplication,
  rejectKycApplication,
  verifyDocument,
  getKycStats,
  downloadKycDocument,
};
