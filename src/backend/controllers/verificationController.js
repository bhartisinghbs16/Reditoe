/**
 * Identity verification for vendors and delivery partners.
 *
 * Wraps the CGPey provider. Each handler does three things: refuse work that
 * has already been paid for, call the provider, and record the outcome against
 * the account so the admin console can see who was checked and when.
 *
 * Every call is billed, so "already verified" short-circuits before the
 * request rather than after it.
 */
import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import cgpey, { VerificationError } from '../services/cgpeyVerification.js';

/** Sends a VerificationError with its own status; anything else is a 500. */
function fail(res, error, fallback = 'Verification failed') {
  if (error instanceof VerificationError) {
    return res.status(error.status).json({
      status: 'error',
      code: error.code,
      message: error.message,
      error: error.details,
    });
  }
  return res.status(500).json({
    status: 'error',
    message: error?.message || fallback,
  });
}

/**
 * Records an outcome without overwriting the whole document, so two checks
 * finishing at once cannot lose one another's result.
 */
async function record(Model, id, service, outcome) {
  const entry = {
    service,
    verified: outcome.verified,
    reference: outcome.reference ?? null,
    checkedAt: new Date(),
    // The provider's own payload is kept for the audit trail: when someone
    // disputes a rejection months later, "the API said no" is not an answer.
    response: outcome.raw ?? null,
  };

  await Model.updateOne(
    { _id: id },
    {
      $push: { verificationRecords: entry },
      $set: { [`verifications.${service}`]: { verified: outcome.verified, checkedAt: entry.checkedAt } },
    }
  );
  return entry;
}

/** True when this account already has a passing check for the service. */
async function alreadyVerified(Model, id, service) {
  const doc = await Model.findById(id).select('verifications').lean();
  return Boolean(doc?.verifications?.[service]?.verified);
}

function actorFor(req) {
  // Riders and vendors both authenticate as users; the vendor's restaurant is
  // resolved separately because GST and bank details belong to the business.
  const id = req.user?.id || req.user?._id;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return String(id);
}

/** GET /api/verification/status — whether the integration can run at all. */
export const getVerificationStatus = async (req, res) => {
  const status = cgpey.configurationStatus();
  return res.status(200).json({
    status: 'success',
    data: {
      ...status,
      // Named so an operator seeing "not configured" knows what to ask for
      // rather than assuming the provider is down.
      note: status.configured
        ? 'Identity verification is live.'
        : 'CGPey issues these separately from the dashboard login. A portal email and password cannot authenticate API calls.',
      costPerCheck: cgpey.SERVICE_COST,
    },
  });
};

/** POST /api/rider/verify/pan  ·  POST /api/vendor/verify/pan */
export const verifyPan = async (req, res) => {
  try {
    const userId = actorFor(req);
    if (!userId) return res.status(401).json({ status: 'error', message: 'Not signed in' });

    const { pan, name, dob } = req.body;
    if (!pan) return res.status(400).json({ status: 'error', message: 'A PAN number is required' });

    if (await alreadyVerified(User, userId, cgpey.SERVICES.PAN)) {
      return res.status(200).json({
        status: 'success',
        message: 'PAN is already verified',
        data: { verified: true, cached: true },
      });
    }

    const data = await cgpey.verifyPan({ pan, name, dob });
    const verified = Boolean(data?.valid ?? data?.verified ?? data?.status === 'VALID');
    await record(User, userId, cgpey.SERVICES.PAN, { verified, reference: data?.requestId, raw: data });

    return res.status(200).json({ status: 'success', data: { verified, details: data } });
  } catch (error) {
    return fail(res, error, 'Could not verify the PAN');
  }
};

/** POST /api/rider/verify/aadhaar/initiate — sends an OTP to the linked mobile. */
export const initiateAadhaar = async (req, res) => {
  try {
    const userId = actorFor(req);
    if (!userId) return res.status(401).json({ status: 'error', message: 'Not signed in' });

    const { aadhaar } = req.body;
    if (!aadhaar) return res.status(400).json({ status: 'error', message: 'An Aadhaar number is required' });

    if (await alreadyVerified(User, userId, cgpey.SERVICES.OKYC_VERIFY)) {
      return res.status(200).json({
        status: 'success',
        message: 'Aadhaar is already verified',
        data: { verified: true, cached: true },
      });
    }

    const data = await cgpey.initiateAadhaarOkyc({ aadhaar });
    // The reference goes back to the caller because the second step needs it;
    // the Aadhaar number itself is deliberately not stored.
    return res.status(200).json({
      status: 'success',
      data: { requestId: data?.requestId ?? data?.refId, message: 'An OTP has been sent to the registered mobile number.' },
    });
  } catch (error) {
    return fail(res, error, 'Could not start Aadhaar verification');
  }
};

/** POST /api/rider/verify/aadhaar/verify — OTP plus the reference from step one. */
export const verifyAadhaar = async (req, res) => {
  try {
    const userId = actorFor(req);
    if (!userId) return res.status(401).json({ status: 'error', message: 'Not signed in' });

    const { requestId, otp } = req.body;
    if (!requestId || !otp) {
      return res.status(400).json({ status: 'error', message: 'The reference from the first step and the OTP are both required' });
    }

    const data = await cgpey.verifyAadhaarOkyc({ requestId, otp });
    const verified = Boolean(data?.valid ?? data?.verified ?? data?.status === 'VALID');
    await record(User, userId, cgpey.SERVICES.OKYC_VERIFY, { verified, reference: requestId, raw: data });

    return res.status(200).json({ status: 'success', data: { verified, details: data } });
  } catch (error) {
    return fail(res, error, 'Could not verify the Aadhaar OTP');
  }
};

/** POST /api/rider/verify/bank  ·  POST /api/vendor/verify/bank */
export const verifyBank = async (req, res) => {
  try {
    const userId = actorFor(req);
    if (!userId) return res.status(401).json({ status: 'error', message: 'Not signed in' });

    const { accountNumber, ifsc } = req.body;
    if (!accountNumber || !ifsc) {
      return res.status(400).json({ status: 'error', message: 'An account number and IFSC code are both required' });
    }

    if (await alreadyVerified(User, userId, cgpey.SERVICES.BANK)) {
      return res.status(200).json({ status: 'success', message: 'Bank account is already verified', data: { verified: true, cached: true } });
    }

    const data = await cgpey.verifyBankAccount({ accountNumber, ifsc });
    const verified = Boolean(data?.valid ?? data?.verified ?? data?.accountExists);
    await record(User, userId, cgpey.SERVICES.BANK, { verified, reference: data?.requestId, raw: data });

    return res.status(200).json({
      status: 'success',
      // The registered holder name comes back so the caller can compare it
      // with the applicant's — an account that exists is not the same as an
      // account that belongs to them.
      data: { verified, accountHolderName: data?.name ?? data?.accountHolderName ?? null, details: data },
    });
  } catch (error) {
    return fail(res, error, 'Could not verify the bank account');
  }
};

/** POST /api/rider/verify/driving-licence */
export const verifyDrivingLicence = async (req, res) => {
  try {
    const userId = actorFor(req);
    if (!userId) return res.status(401).json({ status: 'error', message: 'Not signed in' });

    const { licenceNumber, dob } = req.body;
    if (!licenceNumber || !dob) {
      return res.status(400).json({ status: 'error', message: 'A licence number and date of birth are both required' });
    }

    if (await alreadyVerified(User, userId, cgpey.SERVICES.DRIVING_LICENCE)) {
      return res.status(200).json({ status: 'success', message: 'Driving licence is already verified', data: { verified: true, cached: true } });
    }

    const data = await cgpey.verifyDrivingLicence({ licenceNumber, dob });
    const verified = Boolean(data?.valid ?? data?.verified ?? data?.status === 'VALID');
    await record(User, userId, cgpey.SERVICES.DRIVING_LICENCE, { verified, reference: data?.requestId, raw: data });

    // The rider model already tracks this one separately, for the admin list.
    if (verified) await User.updateOne({ _id: userId }, { $set: { drivingLicenceVerified: true } });

    return res.status(200).json({ status: 'success', data: { verified, details: data } });
  } catch (error) {
    return fail(res, error, 'Could not verify the driving licence');
  }
};

/** POST /api/vendor/verify/gst — recorded against the restaurant, not the user. */
export const verifyGst = async (req, res) => {
  try {
    const userId = actorFor(req);
    if (!userId) return res.status(401).json({ status: 'error', message: 'Not signed in' });

    const { gstNumber } = req.body;
    if (!gstNumber) return res.status(400).json({ status: 'error', message: 'A GST number is required' });

    const restaurant = await Restaurant.findOne({ owner: userId }).select('_id verifications').lean();
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'No restaurant found for this account' });
    }
    if (restaurant.verifications?.[cgpey.SERVICES.GST]?.verified) {
      return res.status(200).json({ status: 'success', message: 'GST is already verified', data: { verified: true, cached: true } });
    }

    const data = await cgpey.verifyGst({ gstNumber });
    const verified = Boolean(data?.valid ?? data?.verified ?? data?.status === 'ACTIVE');
    await record(Restaurant, restaurant._id, cgpey.SERVICES.GST, { verified, reference: data?.requestId, raw: data });

    return res.status(200).json({
      status: 'success',
      data: { verified, legalName: data?.legalName ?? data?.tradeName ?? null, details: data },
    });
  } catch (error) {
    return fail(res, error, 'Could not verify the GST number');
  }
};

export default {
  getVerificationStatus,
  verifyPan,
  initiateAadhaar,
  verifyAadhaar,
  verifyBank,
  verifyDrivingLicence,
  verifyGst,
};
