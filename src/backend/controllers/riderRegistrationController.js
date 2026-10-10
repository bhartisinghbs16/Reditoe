import User from '../models/User.js';
import cloudStorageService from '../services/cloudStorageService.js';
import { proofHolds } from './signupVerificationController.js';
import { getKycDisplayStatus } from '../utils/kycStatus.js';
import crypto from 'crypto';
import { checkPasswordStrength } from '../utils/identifier.js';

/** Names the apps have used for the same document, mapped to the stored one. */
const DOCUMENT_TYPE_ALIASES = {
  selfie: 'photo',
  insurance: 'vehicleInsurance',
  profilePhoto: 'photo',
  licence: 'drivingLicense',
  license: 'drivingLicense',
  rc: 'vehicleRC',
  cancelledCheque: 'passbookCancelledCheque',
  passbook: 'passbookCancelledCheque',
};

const REGISTRATION_DOCUMENT_TYPES = [
  'aadhaar',
  'pan',
  'photo',
  'gst',
  'fssaiLicense',
  'drivingLicense',
  'vehicleRC',
  'vehiclePhoto',
  'passbookCancelledCheque',
  'vehicleInsurance',
  'pucCertificate',
];

/**
 * What a rider must file before their application can be closed off.
 *
 * This asked for a GST registration and an FSSAI licence - a food business's
 * papers, carried over from the vendor list. No delivery rider has either, so
 * finalize refused every application that ever reached it. It also demanded
 * three documents the signup form never asks for, which no rider could have
 * supplied even knowing they were wanted.
 *
 * The list is now what the app collects and what actually matters for
 * somebody riding: who they are, that they may ride, and what they ride.
 * Everything else stays accepted above, just not compulsory.
 */
const REQUIRED_REGISTRATION_DOCUMENT_TYPES = [
  'aadhaar',
  'pan',
  'drivingLicense',
  // The RC book belongs to whoever owns the vehicle, which is often not the
  // rider, so it is accepted but not demanded. A photograph of the vehicle
  // they actually ride is, and so is somewhere to send their money.
  'vehiclePhoto',
  'passbookCancelledCheque',
];

/**
 * Validate and parse date string to prevent Invalid Date errors
 * Handles DD/MM/YYYY format from frontend
 */
const validateAndParseDate = (dateString) => {
  if (!dateString) return null;
  
  try {
    let date;
    
    // Handle DD/MM/YYYY format (from frontend)
    if (typeof dateString === 'string' && dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        // Create date in YYYY-MM-DD format
        const formattedDateString = `${year}-${month}-${day}`;
        date = new Date(formattedDateString);
      } else {
        date = new Date(dateString);
      }
    } else {
      date = new Date(dateString);
    }
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string provided:', dateString);
      return null;
    }
    
    // Check if the date is reasonable (not too far in the past or future)
    const currentYear = new Date().getFullYear();
    const year = date.getFullYear();
    
    if (year < 1900 || year > currentYear - 10) {
      console.warn('Date year out of reasonable range:', year);
      return null;
    }
    
    return date;
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
};

/**
 * Register new rider with complete sign-up data including documents
 * POST /api/rider/register
 */
export const registerRider = async (req, res) => {
  try {
    const idempotencyKey = String(req.headers['x-idempotency-key'] || '').trim();
    const {
      // Personal Information
      name,
      email,
      phone,
      dateOfBirth,
      gender,
      emergencyContactName,
      emergencyRelationship,
      emergencyContactPhone,
      
      // Vehicle Information
      vehicleName,
      vehicleNumber,
      vehicleType,
      vehicleBrand,
      vehicleModel,
      
      // Bank Information
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      branchName,
      upiId,
      
      // Documents (from multipart form)
      documents,

      // Credentials
      password,
      confirmPassword,

      // Where the rider lives, and where post should go
      fullAddress,
      city,
      landmark,
      state,
      pincode,
      communicationAddress,
      communicationCity,
      communicationLandmark,
      communicationState,
      communicationPincode,
      communicationSameAsAddress,

      // Where the rider is based
      latitude,
      longitude,

      /*
       * Proof that the codes sent to this email address and phone number were
       * confirmed. Handed out by the verification endpoints and checked here,
       * because a "verified" flag the app sets is not verification at all.
       */
      emailProof,
      phoneProof,
      referralCode,
    } = req.body;

    /*
     * Self-registration proves both contact details first.
     *
     * An admin creating a rider goes through a different path - they supply no
     * password, and the account is confirmed from the console afterwards - so
     * this only gates riders signing themselves up.
     */
    const selfRegistering = Boolean(password);
    if (selfRegistering) {
      const [emailOk, phoneOk] = await Promise.all([
        proofHolds('email', email, emailProof),
        proofHolds('phone', phone, phoneProof),
      ]);
      if (!emailOk || !phoneOk) {
        return res.status(400).json({
          status: 'error',
          code: 'contact_not_verified',
          message: !emailOk && !phoneOk
            ? 'Verify your email address and mobile number before finishing.'
            : !emailOk
              ? 'Verify your email address before finishing.'
              : 'Verify your mobile number before finishing.',
        });
      }
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      return res.status(400).json({
        status: 'error',
        message: 'The two passwords do not match.',
      });
    }

    /**
     * A rider who supplies no password is a rider an admin created on their
     * behalf; they receive one the same way vendors do. A rider signing
     * themselves up chooses one, and it has to clear the same floor as
     * everyone else's.
     */
    let chosenPassword;
    if (password) {
      const strength = checkPasswordStrength(password);
      if (!strength.ok) {
        return res.status(400).json({ status: 'error', message: strength.reason });
      }
      chosenPassword = password;
    } else {
      chosenPassword = crypto.randomBytes(18).toString('base64url');
    }

    // Handle multiple document uploads if files are provided
    let uploadedDocuments = {};
    if (req.files && req.files.length > 0) {
      try {
        // Parse documents metadata if provided
        let documentsData = {};
        if (documents) {
          try {
            documentsData = JSON.parse(documents);
          } catch (error) {
            console.error('Error parsing documents JSON:', error);
          }
        }
        
        console.log('Processing', req.files.length, 'files for upload');
        
        // Upload each file
        const uploadPromises = req.files.map(async (file) => {
          try {
            console.log('Uploading file:', file.originalname, 'field:', file.fieldname);
            
            const uploadResult = await cloudStorageService.uploadFile(
              file,
              's3',
              {
                category: 'rider-documents',
                folder: `rider-documents/${Date.now()}`,
              }
            );
            
            // Find the corresponding document key from fieldname
            const docKey = file.fieldname;
            const docMetadata = documentsData[docKey] || {};
            
            console.log('Upload successful for:', docKey);
            
            return {
              [docKey]: uploadResult.publicUrl
            };
          } catch (error) {
            console.error(`Error uploading file ${file.originalname}:`, error);
            // Don't return null, instead return a placeholder document
            return {
              [file.fieldname]: ''
            };
          }
        });
        
        const uploadResults = await Promise.all(uploadPromises);
        
        // Merge all uploaded documents
        uploadedDocuments = uploadResults.reduce((acc, result) => {
          if (result) {
            return { ...acc, ...result };
          }
          return acc;
        }, {});
        
      } catch (error) {
        console.error('Document upload error:', error);
        // Don't fail the entire registration, just log the error
        console.log('Continuing registration without document upload');
      }
    }

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, email, and phone are required',
      });
    }

    if (!vehicleType || !vehicleNumber || !vehicleBrand || !vehicleModel) {
      return res.status(400).json({
        status: 'error',
        message: 'Vehicle type, number, brand, and model are required',
      });
    }

    if (!accountHolderName || !accountNumber || !ifscCode || !bankName || !branchName) {
      return res.status(400).json({
        status: 'error',
        message: 'Bank account holder, account number, IFSC, bank name, and branch are required',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { phone: phone.replace(/\D/g, '').slice(-10) }
      ]
    });

    if (existingUser) {
      // Idempotency-friendly behavior for client retries/timeouts:
      // if key is present, treat existing rider as successful replay.
      if (idempotencyKey && existingUser.role === 'rider') {
        return res.status(200).json({
          status: 'success',
          message: 'Rider already registered (idempotent replay)',
          data: {
            rider: {
              id: existingUser._id,
              name: existingUser.name,
              email: existingUser.email,
              phone: existingUser.phone,
              riderId: existingUser.riderId,
              role: existingUser.role,
              vehicleName: existingUser.vehicleName,
              vehicleNumber: existingUser.vehicleNumber,
              vehicleType: existingUser.vehicleType,
              vehicleBrand: existingUser.vehicleBrand,
              vehicleModel: existingUser.vehicleModel,
              kycDocuments: existingUser.kycDocuments || {},
              bankDetails: existingUser.bankDetails || {},
              isProfileComplete: existingUser.isProfileComplete || true,
              kycStatus: existingUser.kycStatus || 'pending',
              kycDisplayStatus: getKycDisplayStatus(existingUser.kycStatus),
              signupSessionId: existingUser._id.toString(),
              createdAt: existingUser.createdAt,
            },
          },
        });
      }
      return res.status(409).json({
        status: 'error',
        message: 'User with this email or phone already exists',
      });
    }

    // Generate unique rider ID
    const riderId = `RID-${Date.now().toString(36).toUpperCase()}`;

    // Normalize phone number
    const phoneDigits = phone.replace(/\D/g, '').slice(-10);
    const normalizedPhone = phoneDigits ? `+91${phoneDigits}` : '';

    // Debug logging for date validation
    console.log('DateOfBirth received:', dateOfBirth, typeof dateOfBirth);
    const parsedDate = dateOfBirth ? validateAndParseDate(dateOfBirth) : null;
    console.log('Parsed date:', parsedDate);

    const signupProfilePhoto =
      uploadedDocuments?.photo ||
      uploadedDocuments?.profilePhoto ||
      '';

    // Create new rider user
    const rider = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: normalizedPhone,
      role: 'rider',
      riderId,
      /**
       * The password the rider chose.
       *
       * This was the literal string 'tempPassword123' for every rider on the
       * platform, and none of them was ever told it -- so the account could not
       * be signed into, and every rider shared one guessable credential.
       */
      password: chosenPassword,
      // Personal fields
      dateOfBirth: parsedDate,
      gender: gender || null,
      emergencyContactName: emergencyContactName?.trim() || '',
      emergencyRelationship: emergencyRelationship?.trim() || '',
      emergencyContactPhone: emergencyContactPhone?.replace(/\D/g, '').slice(-10) || '',
      
      /**
       * Where the rider is based, when the app captured it. Dispatch measures
       * distance from here, so a rider without it is only reachable by the
       * fallback that offers work to everyone online.
       */
      ...(Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
        ? {
            currentLocation: {
              type: 'Point',
              coordinates: [Number(longitude), Number(latitude)],
            },
          }
        : {}),

      /*
       * The address, in parts.
       *
       * The form has always sent these and the controller never read them, so
       * every rider registered with no address on file at all - nothing to
       * post to, and nothing for the console to show.
       */
      address: fullAddress?.trim() || '',
      city: city?.trim() || '',
      landmark: landmark?.trim() || '',
      state: state?.trim() || '',
      pincode: String(pincode ?? '').replace(/\D/g, '').slice(0, 6),
      communicationAddress: {
        address: communicationAddress?.trim() || fullAddress?.trim() || '',
        city: communicationCity?.trim() || city?.trim() || '',
        landmark: communicationLandmark?.trim() || landmark?.trim() || '',
        state: communicationState?.trim() || state?.trim() || '',
        pincode: String(communicationPincode ?? pincode ?? '').replace(/\D/g, '').slice(0, 6),
        sameAsPermanent: communicationSameAsAddress !== false,
      },

      // Vehicle fields
      vehicleName: vehicleName?.trim() || `${vehicleBrand?.trim() || ''} ${vehicleModel?.trim() || ''}`.trim(),
      vehicleNumber: vehicleNumber?.toUpperCase().trim() || '',
      vehicleType: vehicleType?.toLowerCase().trim() || '',
      vehicleBrand: vehicleBrand?.trim() || '',
      vehicleModel: vehicleModel?.trim() || '',
      avatar: signupProfilePhoto || '',
      profilePhoto: signupProfilePhoto || '',
      
      // Bank fields
      bankDetails: {
        accountHolderName: accountHolderName?.trim() || '',
        accountNumber: accountNumber?.trim() || '',
        ifscCode: ifscCode?.toUpperCase().trim() || '',
        ifsc: ifscCode?.toUpperCase().trim() || '',
        bankName: bankName?.trim() || '',
        branch: branchName?.trim() || '',
        upiId: upiId?.trim() || '',
      },
      
      // Documents
      kycDocuments: uploadedDocuments,
      
      // Default values
      isOnline: false,
      currentRating: 0,
      totalTrips: 0,
      completedTrips: 0,
      cancelledTrips: 0,
      totalEarnings: 0,
      kycStatus: 'pending',
      isProfileComplete: true,
    });

    if (referralCode) {
      try {
        const { registerReferralInvite } = await import('../services/referralService.js');
        await registerReferralInvite({ code: referralCode, targetType: 'delivery_partner', entityId: rider._id });
      } catch (referralError) {
        console.warn('Rider referral registration skipped:', referralError.message);
      }
    }

    // Remove password from response (not set for riders initially)
    const riderResponse = {
      id: rider._id,
      name: rider.name,
      email: rider.email,
      phone: rider.phone,
      riderId: rider.riderId,
      role: rider.role,
      dateOfBirth: rider.dateOfBirth,
      gender: rider.gender,
      emergencyContactName: rider.emergencyContactName,
      emergencyRelationship: rider.emergencyRelationship,
      emergencyContactPhone: rider.emergencyContactPhone,
      vehicleName: rider.vehicleName,
      vehicleNumber: rider.vehicleNumber,
      vehicleType: rider.vehicleType,
      vehicleBrand: rider.vehicleBrand,
      vehicleModel: rider.vehicleModel,
      kycDocuments: rider.kycDocuments,
      bankDetails: rider.bankDetails,
      isProfileComplete: rider.isProfileComplete,
      kycStatus: rider.kycStatus,
      kycDisplayStatus: getKycDisplayStatus(rider.kycStatus),
      signupSessionId: rider._id.toString(),
      createdAt: rider.createdAt,
    };

    res.status(201).json({
      status: 'success',
      message: 'Rider registered successfully',
      data: {
        rider: riderResponse,
      },
    });
  } catch (error) {
    console.error('Rider registration error:', error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      let field = 'email or phone';
      if (error.message.includes('email')) field = 'email';
      else if (error.message.includes('phone')) field = 'phone';
      else if (error.message.includes('riderId')) field = 'rider ID';
      
      return res.status(409).json({
        status: 'error',
        message: `This ${field} is already registered`,
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to register rider',
    });
  }
};

/**
 * Upload rider registration document before OTP verification.
 * POST /api/rider/register/upload-document
 */
export const uploadRiderRegistrationDocument = async (req, res) => {
  try {
    const { signupSessionId, email, phone } = req.body || {};
    // "selfie" is what the rider app calls the photo; store it as one.
    const documentType =
      DOCUMENT_TYPE_ALIASES[req.body?.documentType] ?? req.body?.documentType;

    if (!documentType || !REGISTRATION_DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({
        status: 'error',
        message: `Document type must be one of: ${REGISTRATION_DOCUMENT_TYPES.join(', ')}`,
      });
    }

    if (!email && !phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Email or phone is required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded',
      });
    }

    let rider = null;
    if (signupSessionId) {
      rider = await User.findOne({ _id: signupSessionId, role: 'rider' });
    }
    if (!rider) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const phoneDigits = String(phone || '').replace(/\D/g, '').slice(-10);
      const phoneVariants = phoneDigits ? [phoneDigits, `+91${phoneDigits}`] : [];
      rider = await User.findOne({
        role: 'rider',
        $or: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(phoneVariants.length ? [{ phone: { $in: phoneVariants } }] : []),
        ],
      });
    }

    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found for provided email/phone',
      });
    }

    const uploadResult = req.file?.location
      ? {
          provider: 's3',
          filename: req.file.key || req.file.originalname,
          storagePath: req.file.key || '',
          publicUrl: req.file.location,
          secureUrl: req.file.location,
        }
      : await cloudStorageService.uploadFile(req.file, 's3', {
          category: 'rider-documents',
          folder: `rider-documents/${Date.now()}`,
        });

    if (!rider.kycDocuments) {
      rider.kycDocuments = {};
    }
    rider.kycDocuments[documentType] = uploadResult.publicUrl;
    if (documentType === 'photo') {
      rider.avatar = uploadResult.publicUrl;
      rider.profilePhoto = uploadResult.publicUrl;
    }
    await rider.save();

    return res.status(201).json({
      status: 'success',
      message: `${documentType} uploaded successfully`,
      data: {
        documentType,
        url: uploadResult.publicUrl,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to upload registration document',
    });
  }
};

/**
 * Finalize rider registration once all required docs are uploaded.
 * POST /api/rider/register/finalize
 */
export const finalizeRiderRegistration = async (req, res) => {
  try {
    const idempotencyKey = String(req.headers['x-idempotency-key'] || '').trim();
    const { signupSessionId, email, phone } = req.body || {};

    if (!signupSessionId && !email && !phone) {
      return res.status(400).json({
        status: 'error',
        message: 'signupSessionId or email/phone is required',
      });
    }

    let rider = null;
    if (signupSessionId) {
      rider = await User.findOne({ _id: signupSessionId, role: 'rider' });
    }
    if (!rider) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const phoneDigits = String(phone || '').replace(/\D/g, '').slice(-10);
      const phoneVariants = phoneDigits ? [phoneDigits, `+91${phoneDigits}`] : [];
      rider = await User.findOne({
        role: 'rider',
        $or: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(phoneVariants.length ? [{ phone: { $in: phoneVariants } }] : []),
        ],
      });
    }

    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    const docs = rider.kycDocuments || {};
    const missingDocuments = REQUIRED_REGISTRATION_DOCUMENT_TYPES.filter((docKey) => !docs[docKey]);

    if (missingDocuments.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Required documents are missing',
        data: { missingDocuments },
      });
    }

    if (!rider.avatar && !rider.profilePhoto && rider?.kycDocuments?.photo) {
      rider.avatar = rider.kycDocuments.photo;
      rider.profilePhoto = rider.kycDocuments.photo;
    }
    rider.isProfileComplete = true;
    await rider.save();

    return res.status(200).json({
      status: 'success',
      message: idempotencyKey ? 'Registration finalized (idempotent)' : 'Registration finalized',
      data: {
        rider: {
          id: rider._id,
          signupSessionId: rider._id.toString(),
          kycStatus: rider.kycStatus || 'pending',
          kycDisplayStatus: getKycDisplayStatus(rider.kycStatus),
          isProfileComplete: rider.isProfileComplete,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to finalize registration',
    });
  }
};


