/**
 * Admin rider controller. List/update riders from User collection (role: 'rider').
 * Does NOT modify existing rider routes or mobile app logic.
 * No new collections; uses existing User schema only.
 */
import User from '../../models/User.js';
import SignupVerification from '../../models/SignupVerification.js';
import { readIdentifier } from '../../utils/identifier.js';
import Order from '../../models/Order.js';
import mongoose from 'mongoose';
import {
  issueContactVerification,
  confirmContactVerification,
} from '../../services/contactVerificationService.js';
import { getKycDisplayStatus } from '../../utils/kycStatus.js';

const VEHICLE_TYPES = ['Bike', 'Scooter', 'Car', 'Cycle'];

/**
 * The vehicle a rider is on, for display.
 *
 * User does carry a vehicleType (bike/scooter/car/van/cycle), so it is read
 * first. This previously derived the value from vehicleName alone and fell back
 * to 'Bike', which meant a rider who had recorded a scooter or a cycle was
 * still listed as riding a bike — the screen stated something the record did
 * not say. Where neither field is set it now says so rather than guessing.
 */
function deriveVehicleType(vehicleName, vehicleType) {
  const known = { bike: 'Bike', scooter: 'Scooter', car: 'Car', van: 'Van', cycle: 'Cycle' };
  if (vehicleType && known[String(vehicleType).toLowerCase()]) {
    return known[String(vehicleType).toLowerCase()];
  }

  if (!vehicleName || typeof vehicleName !== 'string') return null;
  const lower = vehicleName.toLowerCase();
  if (lower.includes('scooter')) return 'Scooter';
  if (lower.includes('car')) return 'Car';
  if (lower.includes('van')) return 'Van';
  if (lower.includes('cycle') || lower.includes('bicycle')) return 'Cycle';
  return 'Bike';
}

function formatRider(user) {
  const u = user && typeof user.toObject === 'function' ? user.toObject() : (user || {});
  const formatted = {
    _id: u._id,
    id: u._id?.toString?.() || u.id,
    name: u.name ?? '',
    phone: u.phone ?? '',
    email: u.email ?? '',
    vehicleType: deriveVehicleType(u.vehicleName, u.vehicleType),
    vehicleName: u.vehicleName ?? null,
    vehicleNumber: u.vehicleNumber ?? null,
    isOnline: Boolean(u.isOnline),
    currentRating: Number(u.currentRating) || 0,
    riderId: u.riderId ?? null,
    isBlocked: Boolean(u.isBlocked),
    kycStatus: u.kycStatus || 'pending',
    kycDisplayStatus: getKycDisplayStatus(u.kycStatus),
    perKmCharge: Number(u.perKmCharge) || 10,
    incentives: Array.isArray(u.incentives) ? u.incentives : [],
    penalties: Array.isArray(u.penalties) ? u.penalties : [],
    bankDetails: u.bankDetails || {
      accountHolderName: '',
      accountNumber: '',
      ifsc: '',
      bankName: '',
      branch: '',
      city: '',
      country: '',
    },
    kycDocuments: {
      aadhaar: u.kycDocuments?.aadhaar || null,
      pan: u.kycDocuments?.pan || null,
      photo: u.kycDocuments?.photo ||
        u.kycDocuments?.selfie ||
        u.avatar ||
        u.profilePhoto || null,
      selfie: u.kycDocuments?.photo ||
        u.kycDocuments?.selfie ||
        u.avatar ||
        u.profilePhoto || null,
      drivingLicense: u.kycDocuments?.drivingLicense || null,
      vehicleRC: u.kycDocuments?.vehicleRC || null,
      vehiclePhoto: u.kycDocuments?.vehiclePhoto || null,
      gst: u.kycDocuments?.gst || null,
      fssaiLicense: u.kycDocuments?.fssaiLicense || null,
      passbookCancelledCheque:
        u.kycDocuments?.passbookCancelledCheque || null,
    },
    avatar: u.avatar || u.profilePhoto ||
      u.kycDocuments?.photo || null,
    profilePhoto: u.profilePhoto || u.avatar ||
      u.kycDocuments?.photo || null,
    // PERFORMANCE TRACKING FIELDS - CRITICAL FOR RIDER DETAILS PAGE
    totalTrips: Number(u.totalTrips) || 0,
    completedTrips: Number(u.completedTrips) || 0,
    cancelledTrips: Number(u.cancelledTrips) || 0,
    totalEarnings: Number(u.totalEarnings) || 0,
    successRate: Number(u.successRate) || 0,
    // VEHICLE AND TRACKING FIELDS
    insuranceNumber: u.insuranceNumber || null,
    currentLocation: u.currentLocation || null,
    currentOrderId: u.currentOrderId || null,
    deliveryETA: u.deliveryETA || null,
    idType: u.idType || 'Aadhaar',
    /*
     * Who to call if something happens to the rider mid-shift. Stored on the
     * account since they registered, but never sent to the console, so the
     * partner profile showed no way to reach anyone.
     */
    emergencyContactName: u.emergencyContactName || null,
    emergencyRelationship: u.emergencyRelationship || null,
    emergencyContactPhone: u.emergencyContactPhone || null,
    /*
     * Whether staff still have to confirm the contact details they typed for
     * this rider. Only the state travels, never the codes.
     */
    accountVerified: u.accountVerified !== false,
    contactVerification: u.contactVerification?.requiredBy
      ? {
          pending: u.accountVerified !== true,
          emailVerified: u.contactVerification.emailVerified === true,
          phoneVerified: u.contactVerification.phoneVerified === true,
          expiresAt: u.contactVerification.expiresAt || null,
        }
      : null,
    dateOfBirth: u.dateOfBirth || null,
    aadhaarVerified: Boolean(u.aadhaarVerified),
    lastActiveAt: u.lastActiveAt || null,
    address: u.address || {
      fullAddress: '',
      pincode: '',
      landmark: ''
    },
    /**
     * Where the rider works, for the live map's filters.
     *
     * Lifted out of the address document so the console can group by them
     * without knowing which of the several address shapes this record uses.
     */
    city: u.city || u.address?.city || null,
    state: u.state || u.address?.state || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
  return formatted;
}

/**
 * GET /admin/riders - List riders (users with role 'rider' + delivery boys), pagination + optional search
 */
export const getRiders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const kycStatus = req.query.kycStatus;
    const isBlocked = req.query.isBlocked;

    // Build search regex if needed
    let searchRegex = null;
    if (search) {
      searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    // Build filters for User collection
    const userFilter = { role: 'rider' };
    if (searchRegex) {
      userFilter.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { vehicleName: searchRegex },
        { vehicleNumber: searchRegex },
        { riderId: searchRegex },
      ];
    }
    if (kycStatus && ['pending', 'approved', 'rejected'].includes(kycStatus)) {
      userFilter.kycStatus = kycStatus;
    }
    if (isBlocked !== undefined) {
      userFilter.isBlocked = isBlocked === 'true';
    }

    /*
     * "Onboarding pending" is not a field on either collection - it is a
     * state derived below, and one of the two kinds of row it covers has no
     * account at all. So it cannot be a database filter; it is applied to the
     * combined list once the state is known.
     */
    const onboarding = String(req.query.onboardingStatus ?? '').trim();

    // Build filters for DeliveryBoy collection
    const deliveryBoyFilter = {};
    if (searchRegex) {
      deliveryBoyFilter.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { vehicleName: searchRegex },
        { vehicleNumber: searchRegex },
        { riderId: searchRegex },
      ];
    }
    if (kycStatus && ['pending', 'approved', 'rejected'].includes(kycStatus)) {
      deliveryBoyFilter.kycStatus = kycStatus;
    }
    if (isBlocked !== undefined) {
      deliveryBoyFilter.isBlocked = isBlocked === 'true';
    }

    // Fetch from both collections
    const [users, deliveryBoys, userTotal, deliveryBoyTotal] = await Promise.all([
      User.find(userFilter)
        .select('-password -otp -otpExpires -__v -savedAddresses')
        .sort({ createdAt: -1 })
        .lean(),
      (await import('../../models/DeliveryBoy.js')).default.find(deliveryBoyFilter)
        .select('-password -otp -otpExpires -__v')
        .sort({ createdAt: -1 })
        .lean(),
      User.countDocuments(userFilter),
      (await import('../../models/DeliveryBoy.js')).default.countDocuments(deliveryBoyFilter),
    ]);

    // Format users
    const formattedUsers = users.map(formatRider);

    // Format delivery boys
    const formattedDeliveryBoys = deliveryBoys.map(deliveryBoy => ({
      _id: deliveryBoy._id,
      id: deliveryBoy._id?.toString?.() || deliveryBoy.id,
      name: deliveryBoy.name ?? '',
      phone: deliveryBoy.phone ?? '',
      email: deliveryBoy.email ?? '',
      vehicleType: deliveryBoy.vehicleType ?? 'Bike',
      vehicleName: deliveryBoy.vehicleName ?? null,
      vehicleNumber: deliveryBoy.vehicleNumber ?? null,
      isOnline: Boolean(deliveryBoy.isOnline),
      currentRating: Number(deliveryBoy.currentRating) || 0,
      riderId: deliveryBoy.riderId ?? null,
      isBlocked: Boolean(deliveryBoy.isBlocked),
      kycStatus: deliveryBoy.kycStatus || 'pending',
      perKmCharge: Number(deliveryBoy.perKmCharge) || 10,
      incentives: Array.isArray(deliveryBoy.incentives) ? deliveryBoy.incentives : [],
      penalties: Array.isArray(deliveryBoy.penalties) ? deliveryBoy.penalties : [],
      bankDetails: deliveryBoy.bankDetails || {
        accountHolderName: '',
        accountNumber: '',
        ifsc: '',
        bankName: '',
        branch: '',
        city: '',
        country: '',
      },
      kycDocuments: {
        aadhaar: deliveryBoy.kycDocuments?.aadhaar || null,
        pan: deliveryBoy.kycDocuments?.pan || null,
        photo: deliveryBoy.kycDocuments?.photo ||
          deliveryBoy.kycDocuments?.selfie ||
          deliveryBoy.avatar ||
          deliveryBoy.profilePhoto || null,
        selfie: deliveryBoy.kycDocuments?.photo ||
          deliveryBoy.kycDocuments?.selfie ||
          deliveryBoy.avatar ||
          deliveryBoy.profilePhoto || null,
        drivingLicense: deliveryBoy.kycDocuments?.drivingLicense || null,
        vehicleRC: deliveryBoy.kycDocuments?.vehicleRC || null,
        vehiclePhoto: deliveryBoy.kycDocuments?.vehiclePhoto || null,
        gst: deliveryBoy.kycDocuments?.gst || null,
        fssaiLicense: deliveryBoy.kycDocuments?.fssaiLicense || null,
        passbookCancelledCheque:
          deliveryBoy.kycDocuments?.passbookCancelledCheque || null,
      },
      avatar: deliveryBoy.avatar || deliveryBoy.profilePhoto ||
        deliveryBoy.kycDocuments?.photo || null,
      profilePhoto: deliveryBoy.profilePhoto || deliveryBoy.avatar ||
        deliveryBoy.kycDocuments?.photo || null,
      // PERFORMANCE TRACKING FIELDS
      totalTrips: Number(deliveryBoy.totalTrips) || Number(deliveryBoy.totalDeliveries) || 0,
      completedTrips: Number(deliveryBoy.completedTrips) || Number(deliveryBoy.completedDeliveries) || 0,
      cancelledTrips: Number(deliveryBoy.cancelledTrips) || Number(deliveryBoy.cancelledDeliveries) || 0,
      totalEarnings: Number(deliveryBoy.totalEarnings) || 0,
      successRate: Number(deliveryBoy.successRate) || 0,
      // VEHICLE AND TRACKING FIELDS
      insuranceNumber: deliveryBoy.insuranceNumber || null,
      currentLocation: deliveryBoy.currentLocation || null,
      currentOrderId: deliveryBoy.currentOrderId || null,
      deliveryETA: deliveryBoy.deliveryETA || null,
      address: deliveryBoy.fullAddress ? {
        fullAddress: deliveryBoy.fullAddress,
        pincode: deliveryBoy.pincode || '',
        landmark: deliveryBoy.landmark || ''
      } : {
        fullAddress: '',
        pincode: '',
        landmark: ''
      },
      createdAt: deliveryBoy.createdAt,
      updatedAt: deliveryBoy.updatedAt,
    }));

    /*
     * People who verified their contact details and then stopped.
     *
     * No account exists for them - one is not created until the last step of
     * the form, deliberately, so an abandoned signup leaves no unusable
     * account behind. That also means the console could not see them at all:
     * somebody who verified an email and a phone and never came back was
     * simply invisible, and nobody could follow them up.
     *
     * They are listed from the verification records instead, matched into one
     * row per person by phone where both details were verified.
     */
    const verified = await SignupVerification.find({ verified: true })
      .select('channel value counterpart updatedAt createdAt')
      .lean();

    const knownEmails = new Set(
      [...formattedUsers, ...formattedDeliveryBoys]
        .map((rider) => String(rider.email || '').toLowerCase())
        .filter(Boolean)
    );
    const knownPhones = new Set(
      [...formattedUsers, ...formattedDeliveryBoys]
        .map((rider) => String(rider.phone || '').replace(/\D/g, '').slice(-10))
        .filter(Boolean)
    );

    const pendingByKey = new Map();
    for (const row of verified) {
      const isPhone = row.channel === 'phone';
      const digits = isPhone ? String(row.value).replace(/\D/g, '').slice(-10) : '';
      // Already registered: not pending, whatever the verification says.
      if (isPhone ? knownPhones.has(digits) : knownEmails.has(String(row.value).toLowerCase())) {
        continue;
      }
      /*
       * One key per person, not per contact detail.
       *
       * The phone is the key wherever it is known - from the row itself, or
       * from the counterpart an email row carries - so the two rows a signup
       * leaves behind fold into one. Without it the console listed somebody
       * who verified both details twice, as two half-people.
       */
      const partnerPhone = isPhone
        ? digits
        : String(row.counterpart ?? '').replace(/\D/g, '').slice(-10);
      const key = partnerPhone || String(row.value).toLowerCase();
      const existing = pendingByKey.get(key) ?? {
        email: null,
        phone: null,
        startedAt: row.createdAt,
      };
      if (isPhone) {
        existing.phone = row.value;
        if (row.counterpart && !existing.email) existing.email = row.counterpart;
      } else {
        existing.email = row.value;
        if (row.counterpart && !existing.phone) existing.phone = row.counterpart;
      }
      if (new Date(row.createdAt) < new Date(existing.startedAt)) {
        existing.startedAt = row.createdAt;
      }
      pendingByKey.set(key, existing);
    }

    /*
     * A shape the list can render beside real partners. There is no id and no
     * account, so the row is marked as such rather than pretending: opening
     * one would 404.
     */
    const pendingSignups = [...pendingByKey.values()].map((entry) => ({
      _id: `pending:${entry.phone || entry.email}`,
      id: `pending:${entry.phone || entry.email}`,
      name: 'Signup not finished',
      email: entry.email || '',
      phone: entry.phone || '',
      status: 'onboarding_pending',
      onboardingStatus: 'onboarding_pending',
      hasAccount: false,
      kycStatus: 'pending',
      isBlocked: false,
      isOnline: false,
      currentRating: 0,
      totalDeliveries: 0,
      totalEarnings: 0,
      createdAt: entry.startedAt,
      updatedAt: entry.startedAt,
    }));

    // Combine and sort by creation date
    const allRiders = [...formattedUsers, ...formattedDeliveryBoys, ...pendingSignups]
      .map((rider) => ({
        ...rider,
        hasAccount: rider.hasAccount !== false,
        /*
         * Where this partner has got to.
         *
         * Registered but never submitted counts as pending too - but only
         * while their KYC is still pending. Every rider on the platform today
         * has isProfileComplete false, because nothing called finalize until
         * it was fixed, and calling those approved and working riders
         * "onboarding pending" would be wrong.
         */
        onboardingStatus:
          rider.onboardingStatus ??
          (rider.isProfileComplete === false && (rider.kycStatus ?? 'pending') === 'pending'
            ? 'onboarding_pending'
            : 'onboarded'),
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const visibleRiders = onboarding
      ? allRiders.filter((rider) => rider.onboardingStatus === onboarding)
      : allRiders;

    /*
     * Counted from the list actually being shown. The old total added the two
     * collection counts, which now misses the pending signups and ignores the
     * filter entirely - so the pager offered pages that were empty.
     */
    const total = visibleRiders.length;
    const riders = visibleRiders.slice(skip, skip + limit);

    res.status(200).json({
      status: 'success',
      data: { riders },
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch riders',
    });
  }
};

/**
 * GET /admin/riders/:id/orders - Get orders for a specific rider
 */
export const getRiderOrders = async (req, res) => {
  try {
    const { id: riderId } = req.params;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    if (!riderId || !mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid rider ID' });
    }
    const rider = await User.findOne({ _id: riderId, role: 'rider' });
    if (!rider) {
      const DeliveryBoy = (await import('../../models/DeliveryBoy.js')).default;
      const db = await DeliveryBoy.findById(riderId);
      if (!db) {
        return res.status(404).json({ status: 'error', message: 'Rider not found' });
      }
    }
    const [orders, total] = await Promise.all([
      Order.find({ riderId: new mongoose.Types.ObjectId(riderId) })
        .populate('userId', 'name email phone')
        .populate('restaurantId', 'name image rating deliveryTime deliveryFee')
        .populate('riderId', 'name email phone riderId vehicleName vehicleNumber')
        .populate('items.foodItemId', 'name image price')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Order.countDocuments({ riderId: new mongoose.Types.ObjectId(riderId) }),
    ]);
    res.status(200).json({
      status: 'success',
      results: orders.length,
      total,
      data: { orders },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message || 'Failed to fetch rider orders' });
  }
};

/**
 * GET /admin/riders/:id - Get one rider by id
 */
export const getRiderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid rider ID',
      });
    }

    // First try to find in User collection (role: 'rider')
    let user = await User.findOne({ _id: id, role: 'rider' })
      .select('-password -otp -otpExpires -__v')
      .lean();

    if (user) {
      return res.status(200).json({
        status: 'success',
        data: { rider: formatRider(user) },
      });
    }

    // If not found in User collection, try DeliveryBoy collection
    const DeliveryBoy = (await import('../../models/DeliveryBoy.js')).default;
    const deliveryBoy = await DeliveryBoy.findById(id)
      .select('-password -otp -otpExpires -__v')
      .lean();

    if (!deliveryBoy) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    // Format delivery boy data to match rider format
    const formattedDeliveryBoy = {
      _id: deliveryBoy._id,
      id: deliveryBoy._id?.toString?.() || deliveryBoy.id,
      name: deliveryBoy.name ?? '',
      phone: deliveryBoy.phone ?? '',
      email: deliveryBoy.email ?? '',
      vehicleType: deliveryBoy.vehicleType ?? 'Bike',
      vehicleName: deliveryBoy.vehicleName ?? null,
      vehicleNumber: deliveryBoy.vehicleNumber ?? null,
      isOnline: Boolean(deliveryBoy.isOnline),
      currentRating: Number(deliveryBoy.currentRating) || 0,
      riderId: deliveryBoy.riderId ?? null,
      isBlocked: Boolean(deliveryBoy.isBlocked),
      kycStatus: deliveryBoy.kycStatus || 'pending',
      perKmCharge: Number(deliveryBoy.perKmCharge) || 10,
      incentives: Array.isArray(deliveryBoy.incentives) ? deliveryBoy.incentives : [],
      penalties: Array.isArray(deliveryBoy.penalties) ? deliveryBoy.penalties : [],
      bankDetails: deliveryBoy.bankDetails || {
        accountHolderName: '',
        accountNumber: '',
        ifsc: '',
        bankName: '',
        branch: '',
        city: '',
        country: '',
      },
      kycDocuments: {
        aadhaar: deliveryBoy.kycDocuments?.aadhaar || null,
        pan: deliveryBoy.kycDocuments?.pan || null,
        photo: deliveryBoy.kycDocuments?.photo ||
          deliveryBoy.kycDocuments?.selfie ||
          deliveryBoy.avatar ||
          deliveryBoy.profilePhoto || null,
        selfie: deliveryBoy.kycDocuments?.photo ||
          deliveryBoy.kycDocuments?.selfie ||
          deliveryBoy.avatar ||
          deliveryBoy.profilePhoto || null,
        drivingLicense: deliveryBoy.kycDocuments?.drivingLicense || null,
        vehicleRC: deliveryBoy.kycDocuments?.vehicleRC || null,
        vehiclePhoto: deliveryBoy.kycDocuments?.vehiclePhoto || null,
        gst: deliveryBoy.kycDocuments?.gst || null,
        fssaiLicense: deliveryBoy.kycDocuments?.fssaiLicense || null,
        passbookCancelledCheque:
          deliveryBoy.kycDocuments?.passbookCancelledCheque || null,
      },
      avatar: deliveryBoy.avatar || deliveryBoy.profilePhoto ||
        deliveryBoy.kycDocuments?.photo || null,
      profilePhoto: deliveryBoy.profilePhoto || deliveryBoy.avatar ||
        deliveryBoy.kycDocuments?.photo || null,
      // PERFORMANCE TRACKING FIELDS - CRITICAL FOR RIDER DETAILS PAGE
      totalTrips: Number(deliveryBoy.totalTrips) || Number(deliveryBoy.totalDeliveries) || 0,
      completedTrips: Number(deliveryBoy.completedTrips) || Number(deliveryBoy.completedDeliveries) || 0,
      cancelledTrips: Number(deliveryBoy.cancelledTrips) || Number(deliveryBoy.cancelledDeliveries) || 0,
      totalEarnings: Number(deliveryBoy.totalEarnings) || 0,
      successRate: Number(deliveryBoy.successRate) || 0,
      // VEHICLE AND TRACKING FIELDS
      insuranceNumber: deliveryBoy.insuranceNumber || null,
      currentLocation: deliveryBoy.currentLocation || null,
      currentOrderId: deliveryBoy.currentOrderId || null,
      deliveryETA: deliveryBoy.deliveryETA || null,
      address: deliveryBoy.fullAddress ? {
        fullAddress: deliveryBoy.fullAddress,
        pincode: deliveryBoy.pincode || '',
        landmark: deliveryBoy.landmark || ''
      } : {
        fullAddress: '',
        pincode: '',
        landmark: ''
      },
      createdAt: deliveryBoy.createdAt,
      updatedAt: deliveryBoy.updatedAt,
    };

    res.status(200).json({
      status: 'success',
      data: { rider: formattedDeliveryBoy },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch rider',
    });
  }
};

/**
 * PATCH /admin/riders/:id/status - Set rider isOnline (admin override)
 * Body: { isOnline: boolean }
 */
export const updateRiderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isOnline } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid rider ID',
      });
    }

    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide isOnline (boolean)',
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: 'rider' },
      { $set: { isOnline } },
      { new: true, runValidators: true }
    )
      .select('-password -otp -otpExpires -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    try {
      const { approveReferralInvite } = await import('../../services/referralService.js');
      await approveReferralInvite({ entityId: user._id, targetType: 'delivery_partner', approved: kycStatus === 'approved' });
    } catch (referralError) { console.warn('Rider referral reward update skipped:', referralError.message); }

    res.status(200).json({
      status: 'success',
      data: { rider: formatRider(user) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update rider status',
    });
  }
};

/**
 * PATCH /admin/riders/:id/kyc-status - Update rider KYC status
 * Body: { kycStatus: 'approved' | 'rejected' }
 */
export const updateRiderKycStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { kycStatus } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid rider ID',
      });
    }

    if (!['approved', 'rejected'].includes(kycStatus)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide valid kycStatus (approved or rejected)',
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: 'rider' },
      { $set: { kycStatus } },
      { new: true, runValidators: true }
    )
      .select('-password -otp -otpExpires -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { rider: formatRider(user) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update KYC status',
    });
  }
};

/**
 * PATCH /admin/riders/:id/bank-verification - Verify or reject rider bank account
 * Body: { verificationStatus: 'verified' | 'rejected', reason?: string }
 */
export const updateRiderBankVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationStatus, reason } = req.body || {};

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid rider ID',
      });
    }

    if (!['verified', 'rejected'].includes(verificationStatus)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide valid verificationStatus (verified or rejected)',
      });
    }

    const rider = await User.findOne({ _id: id, role: 'rider' });
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    if (!rider.bankDetails) {
      rider.bankDetails = {};
    }

    rider.bankDetails.verificationStatus = verificationStatus;
    rider.bankDetails.isVerified = verificationStatus === 'verified';

    if (!rider.bankDetails.autopay) {
      rider.bankDetails.autopay = {
        eligible: false,
        reason: '',
        lastEvaluatedAt: null,
      };
    }

    if (verificationStatus === 'verified') {
      rider.bankDetails.autopay.eligible = true;
      rider.bankDetails.autopay.reason = '';
    } else {
      rider.bankDetails.autopay.eligible = false;
      rider.bankDetails.autopay.reason = String(reason || 'Bank account verification rejected').trim();
      // Safety: disable autopay when bank is rejected.
      rider.bankDetails.autopayEnabled = false;
    }
    rider.bankDetails.autopay.lastEvaluatedAt = new Date();

    await rider.save();

    const responseRider = await User.findById(id)
      .select('-password -otp -otpExpires -__v')
      .lean();

    res.status(200).json({
      status: 'success',
      message: `Bank verification marked as ${verificationStatus}`,
      data: { rider: formatRider(responseRider) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update bank verification status',
    });
  }
};

/**
 * PATCH /admin/riders/:id/block - Block or unblock rider
 * Body: { isBlocked: boolean }
 */
export const updateRiderBlockStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid rider ID',
      });
    }

    if (typeof isBlocked !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide isBlocked (boolean)',
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: 'rider' },
      { $set: { isBlocked, isOnline: isBlocked ? false : undefined } },
      { new: true, runValidators: true }
    )
      .select('-password -otp -otpExpires -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { rider: formatRider(user) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update block status',
    });
  }
};

/**
 * PATCH /admin/riders/:id/per-km - Update rider per-km charge
 * Body: { perKmCharge: number }
 */
export const updateRiderPerKmCharge = async (req, res) => {
  try {
    const { id } = req.params;
    const { perKmCharge } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid rider ID',
      });
    }

    if (typeof perKmCharge !== 'number' || perKmCharge < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide valid perKmCharge (number >= 0)',
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: 'rider' },
      { $set: { perKmCharge } },
      { new: true, runValidators: true }
    )
      .select('-password -otp -otpExpires -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { rider: formatRider(user) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update per-km charge',
    });
  }
};

/**
 * POST /admin/riders/:id/incentive - Add incentive for rider
 * Body: { type: 'daily' | 'weekly' | 'monthly', amount: number, conditions?: string }
 */
export const addRiderIncentive = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, conditions } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid rider ID',
      });
    }

    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide valid type (daily, weekly, or monthly)',
      });
    }

    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide valid amount (number >= 0)',
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: 'rider' },
      { 
        $push: { 
          incentives: { 
            type, 
            amount, 
            conditions: conditions || '', 
            createdAt: new Date() 
          } 
        } 
      },
      { new: true, runValidators: true }
    )
      .select('-password -otp -otpExpires -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { rider: formatRider(user) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to add incentive',
    });
  }
};

/**
 * POST /admin/riders/:id/penalty - Apply penalty to rider
 * Body: { reason: string, amount: number }
 */
export const addRiderPenalty = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, amount } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid rider ID',
      });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide valid reason',
      });
    }

    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide valid amount (number >= 0)',
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: 'rider' },
      { 
        $push: { 
          penalties: { 
            reason: reason.trim(), 
            amount, 
            createdAt: new Date() 
          } 
        } 
      },
      { new: true, runValidators: true }
    )
      .select('-password -otp -otpExpires -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { rider: formatRider(user) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to add penalty',
    });
  }
};

/**
 * POST /admin/riders - Create a new rider
 * Body: { name, email, phone, password, vehicleType, vehicleNumber, perKmCharge, address, emergencyContact }
 */
export const createRider = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      password, 
      vehicleType, 
      vehicleNumber, 
      vehicleName,
      insuranceNumber,
      perKmCharge, 
      address, 
      emergencyContact,
      bankDetails,
      kycDocuments,
      totalTrips,
      completedTrips,
      cancelledTrips,
      totalEarnings,
      totalIncentives,
      totalPenalties,
      successRate,
      currentLocation,
      deviceToken,
      isOnline,
      lastActive,
      idType
    } = req.body;
    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide name, email, and phone',
      });
    }

    /**
     * The email and the mobile number are both sign-in credentials, so both
     * have to be unique.
     *
     * Only the email was checked. Two riders could therefore be created on one
     * mobile number, and a sign-in by that number resolves to whichever was
     * created first — so the second rider was handed a password that works for
     * an account they are not, and their own credentials appeared simply to be
     * wrong. That is the reported fault.
     */
    const emailId = readIdentifier(email);
    if (emailId.kind !== 'email') {
      return res.status(400).json({
        status: 'error',
        message: 'That email address does not look right.',
      });
    }

    const phoneId = readIdentifier(phone);
    if (phoneId.kind !== 'phone') {
      return res.status(400).json({ status: 'error', message: phoneId.reason });
    }

    const existingUser = await User.findOne({ email: emailId.value });
    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        code: 'EMAIL_ALREADY_EXISTS',
        message: `${emailId.value} is already registered.`,
      });
    }

    const phoneTaken = await User.findOne({ phone: { $in: phoneId.variants } });
    if (phoneTaken) {
      return res.status(409).json({
        status: 'error',
        code: 'PHONE_ALREADY_EXISTS',
        message: `${phoneId.value} is already registered to ${phoneTaken.name || 'another account'}. Use a different mobile number.`,
      });
    }

    // Generate rider ID
    const riderId = 'RIDER' + Date.now().toString().slice(-6);

    /**
     * Every rider created here used to get the same hardcoded 'Rider@123',
     * which nobody was told - so the account could not be signed into, and
     * every rider on the platform shared one guessable password.
     *
     * A password the admin supplies is used as-is. Otherwise one is generated
     * per rider and returned once in the response so it can be handed over.
     * It cannot be read back later: the stored value is hashed.
     */
    const generated = !password;
    const issuedPassword =
      password ||
      `Rdr@${Math.random().toString(36).slice(-6)}${Math.floor(10 + Math.random() * 89)}`;

    // Create new rider
    const rider = await User.create({
      name,
      email: emailId.value,
      password: issuedPassword,
      phone: phoneId.value,
      /**
       * Where the rider works from, when the admin knows it.
       *
       * Dispatch measures distance from here, so a rider created without one
       * is only ever reachable by the fallback that offers work to everyone
       * online — they are invisible to the radius rules the platform runs on.
       */
      ...(Number.isFinite(Number(req.body.latitude)) &&
      Number.isFinite(Number(req.body.longitude))
        ? {
            currentLocation: {
              type: 'Point',
              coordinates: [Number(req.body.longitude), Number(req.body.latitude)],
            },
          }
        : {}),
      role: 'rider',
      riderId,
      // The schema's enum is lower-case (bike/scooter/car/van/cycle), so a
      // capitalised default fails validation and the rider is never created.
      vehicleType: String(vehicleType || 'bike').toLowerCase(),
      vehicleNumber: vehicleNumber || '',
      vehicleName: vehicleName || 'Honda Activa 6G',
      insuranceNumber: insuranceNumber || 'INS' + Date.now().toString().slice(-8),
      perKmCharge: perKmCharge || 10,
      isOnline: isOnline || false,
      currentRating: 0,
      isBlocked: false,
      kycStatus: 'pending',
      idType: idType || 'Aadhaar',
      // Address and emergency contact
      address: address || '',
      emergencyContact: emergencyContact || phone,
      // Use bank details from request or provide defaults
      bankDetails: bankDetails || {
        accountHolderName: name,
        accountNumber: '0000000000',
        ifsc: 'SBIN0000000',
        bankName: 'State Bank of India',
        branch: 'Main Branch',
        city: 'Mumbai',
        country: 'India'
      },
      // Use KYC documents from request or provide structure
      kycDocuments: kycDocuments || {
        aadhaar: null,
        drivingLicense: null,
        vehicleRC: null,
        selfie: null,
      },
      // Performance metrics
      totalTrips: totalTrips || 0,
      completedTrips: completedTrips || 0,
      cancelledTrips: cancelledTrips || 0,
      totalEarnings: totalEarnings || 0,
      totalIncentives: totalIncentives || 0,
      totalPenalties: totalPenalties || 0,
      successRate: successRate || 0.0,
      // Location and device info
      currentLocation: currentLocation || {
        type: 'Point',
        coordinates: [72.8777, 19.0760]
      },
      deviceToken: deviceToken || null,
      lastActive: lastActive || new Date()
    });

    /*
     * Confirm the contact details before the account is allowed to work.
     *
     * Staff typed this email address and this phone number on the rider's
     * behalf; nobody has shown they belong to them. A mistyped digit makes an
     * account that cannot be signed into, and that is only discovered when
     * the rider tries. The account is blocked until both codes come back.
     */
    rider.isBlocked = true;
    rider.accountVerified = false;
    const delivery = await issueContactVerification(rider, { role: 'rider' });

    // Remove password from output
    rider.password = undefined;
    res.status(201).json({
      status: 'success',
      message:
        'Rider created. They are blocked until the email and mobile codes are confirmed.',
      data: {
        rider: formatRider(rider),
        verification: {
          required: true,
          emailSent: delivery.email,
          smsSent: delivery.sms,
          problems: delivery.errors,
        },
        // The only time these can be shown. `password` is present only when
        // we generated it - an admin who chose one already knows it - and the
        // stored value is hashed, so it cannot be read back later.
        credentials: {
          email: rider.email,
          phone: rider.phone,
          password: generated ? issuedPassword : undefined,
          generated,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create rider',
    });
  }
};

// Export formatRider function for testing
export { formatRider };

/**
 * POST /admin/riders/:id/verify-contact
 *
 * Confirms the codes sent when the account was created. Each channel is
 * checked on its own, so a correct email code is not thrown away because the
 * mobile code was mistyped beside it. The rider stays blocked until both are
 * in.
 */
export const verifyRiderContact = async (req, res) => {
  try {
    const rider = await User.findOne({ _id: req.params.id, role: 'rider' }).select(
      '+contactVerification.emailOtp +contactVerification.phoneOtp'
    );
    if (!rider) {
      return res.status(404).json({ status: 'error', message: 'Rider not found' });
    }

    const result = await confirmContactVerification(rider, req.body || {});
    if (!result.ok) {
      return res.status(400).json({ status: 'error', message: result.message });
    }

    if (result.complete) {
      rider.isBlocked = false;
      await rider.save({ validateBeforeSave: false });
    }

    return res.json({
      status: 'success',
      message: result.message,
      data: {
        complete: result.complete,
        emailVerified: result.emailVerified,
        phoneVerified: result.phoneVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/** POST /admin/riders/:id/resend-verification - issue a fresh pair of codes. */
export const resendRiderContactVerification = async (req, res) => {
  try {
    const rider = await User.findOne({ _id: req.params.id, role: 'rider' });
    if (!rider) {
      return res.status(404).json({ status: 'error', message: 'Rider not found' });
    }
    const delivery = await issueContactVerification(rider, { role: 'rider' });
    return res.json({
      status: 'success',
      message: 'New codes sent.',
      data: { emailSent: delivery.email, smsSent: delivery.sms, problems: delivery.errors },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};
