/**
 * Admin Settings Controller
 * Handles system configuration and foundation controls
 */
import Settings from '../../models/Settings.js';
import Restaurant from '../../models/Restaurant.js';

const sanitizePublicLegalText = (value = '') =>
  String(value)
    .replace(/Vinsta platform/gi, 'Reditoe services')
    .replace(/Vinsta/gi, 'Reditoe');

const sanitizePublicCmsPage = (page, fallbackTitle) => ({
  title: sanitizePublicLegalText(page?.title || fallbackTitle),
  content: sanitizePublicLegalText(page?.content || ''),
});

/**
 * GET /api/admin/settings
 * Get all system settings
 */
export const getSettings = async (req, res) => {
  try {
    // Use direct database query instead of static method to avoid potential issues
    const settings = await Settings.findOne().lean();
    
    // If no settings exist, return default settings without trying to save
    if (!settings) {
      const defaultSettings = {
        tax: 0,
        commission: 0,
        deliveryFee: 0,
        platformFee: 0,
        currency: "PKR",
        deliveryCharges: {
          defaultCharge: 40,
          chargeType: 'flat',
          perKmCharge: 10,
          freeDeliveryThreshold: 0,
          vendorSpecificCharges: []
        },
        cancellationPolicy: {
          freeCancellationWindow: 5,
          lateCancellationFee: 20,
          feeType: 'fixed',
          feePercentage: 10,
          vendorSpecificPolicies: []
        },
        taxConfiguration: {
          gst: {
            enabled: true,
            percentage: 5,
            cgstPercentage: 2.5,
            sgstPercentage: 2.5
          },
          serviceTax: {
            enabled: false,
            percentage: 10
          },
          vat: {
            enabled: false,
            percentage: 5
          },
          platformFee: {
            enabled: true,
            type: 'fixed',
            amount: 5,
            percentage: 2
          }
        },
        appVersionControl: {
          currentVersions: {
            ios: {
              version: '1.0.0',
              buildNumber: '1',
              mandatory: false,
              releaseNotes: ''
            },
            android: {
              version: '1.0.0',
              buildNumber: '1',
              mandatory: false,
              releaseNotes: ''
            }
          },
          versionHistory: []
        },
        cmsPages: {
          aboutUs: {
            title: 'About Us',
            content: '',
            lastUpdated: new Date(),
            updatedBy: null
          },
          termsAndConditions: {
            title: 'Terms & Conditions',
            content: '',
            lastUpdated: new Date(),
            updatedBy: null
          },
          privacyPolicy: {
            title: 'Privacy Policy',
            content: '',
            lastUpdated: new Date(),
            updatedBy: null
          },
          faq: {
            title: 'Frequently Asked Questions',
            content: '',
            lastUpdated: new Date(),
            updatedBy: null
          }
        },
        auditTrail: []
      };
      return res.status(200).json({
        status: 'success',
        data: {
          settings: defaultSettings
        }
      });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        settings: settings
      }
    });
  } catch (error) {
    // Return default settings even on error to prevent frontend crashes
    const defaultSettings = {
      tax: 0,
      commission: 0,
      deliveryFee: 0,
      platformFee: 0,
      currency: "PKR",
      deliveryCharges: {
        defaultCharge: 40,
        chargeType: 'flat',
        perKmCharge: 10,
        freeDeliveryThreshold: 0,
        vendorSpecificCharges: []
      },
      cancellationPolicy: {
        freeCancellationWindow: 5,
        lateCancellationFee: 20,
        feeType: 'fixed',
        feePercentage: 10,
        vendorSpecificPolicies: []
      },
      taxConfiguration: {
        gst: {
          enabled: true,
          percentage: 5,
          cgstPercentage: 2.5,
          sgstPercentage: 2.5
        },
        serviceTax: {
          enabled: false,
          percentage: 10
        },
        vat: {
          enabled: false,
          percentage: 5
        },
        platformFee: {
          enabled: true,
          type: 'fixed',
          amount: 5,
          percentage: 2
        }
      },
      appVersionControl: {
        currentVersions: {
          ios: {
            version: '1.0.0',
            buildNumber: '1',
            mandatory: false,
            releaseNotes: ''
          },
          android: {
            version: '1.0.0',
            buildNumber: '1',
            mandatory: false,
            releaseNotes: ''
          }
        },
        versionHistory: []
      },
      cmsPages: {
        aboutUs: {
          title: 'About Us',
          content: '',
          lastUpdated: new Date(),
          updatedBy: null
        },
        termsAndConditions: {
          title: 'Terms & Conditions',
          content: '',
          lastUpdated: new Date(),
          updatedBy: null
        },
        privacyPolicy: {
          title: 'Privacy Policy',
          content: '',
          lastUpdated: new Date(),
          updatedBy: null
        },
        faq: {
          title: 'Frequently Asked Questions',
          content: '',
          lastUpdated: new Date(),
          updatedBy: null
        }
      },
      auditTrail: []
    };
    return res.status(200).json({
      status: 'success',
      data: {
        settings: defaultSettings
      }
    });
  }
};

/**
 * PATCH /api/admin/settings/delivery
 * Update delivery charges configuration
 */
export const updateDeliverySettings = async (req, res) => {
  try {
    const {
      defaultCharge,
      chargeType,
      perKmCharge,
      freeDeliveryThreshold,
      vendorSpecificCharges,
      distanceEnabled,
      thresholdKm,
      baseFee,
      perKmExtra,
      maxDeliveryKm,
      maxDeliveryFee,
    } = req.body;

    const settings = await Settings.getSettings();
    
    // Store previous values for audit
    const previousValues = { ...settings.deliveryCharges };
    
    // Update delivery charges
    if (defaultCharge !== undefined) settings.deliveryCharges.defaultCharge = defaultCharge;
    if (chargeType !== undefined) settings.deliveryCharges.chargeType = chargeType;
    if (perKmCharge !== undefined) settings.deliveryCharges.perKmCharge = perKmCharge;
    if (freeDeliveryThreshold !== undefined) settings.deliveryCharges.freeDeliveryThreshold = freeDeliveryThreshold;
    if (vendorSpecificCharges !== undefined) {
      // Validate restaurant IDs
      if (vendorSpecificCharges.length > 0) {
        const restaurantIds = vendorSpecificCharges.map(v => v.restaurantId);
        const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } });
        
        if (restaurants.length !== restaurantIds.length) {
          return res.status(400).json({
            status: 'error',
            message: 'One or more restaurant IDs are invalid',
          });
        }
      }
      settings.deliveryCharges.vendorSpecificCharges = vendorSpecificCharges;
    }
    if (!settings.distancePricing) settings.distancePricing = {};
    if (distanceEnabled !== undefined) settings.distancePricing.distanceEnabled = distanceEnabled;
    if (thresholdKm !== undefined) settings.distancePricing.thresholdKm = thresholdKm;
    if (baseFee !== undefined) settings.distancePricing.baseFee = baseFee;
    if (perKmExtra !== undefined) settings.distancePricing.perKmExtra = perKmExtra;
    if (maxDeliveryKm !== undefined) settings.distancePricing.maxDeliveryKm = maxDeliveryKm;
    if (maxDeliveryFee !== undefined) settings.distancePricing.maxDeliveryFee = maxDeliveryFee;

    await settings.save();

    // Add audit entry
    await settings.addAuditEntry(
      'UPDATE',
      'DELIVERY_CHARGES',
      {
        previous: previousValues,
        new: settings.deliveryCharges,
      },
      req.user?.id,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      status: 'success',
      message: 'Delivery settings updated successfully',
      data: {
        deliveryCharges: settings.deliveryCharges,
        distancePricing: settings.distancePricing,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update delivery settings',
    });
  }
};

/**
 * PATCH /api/admin/settings/cancellation
 * Update cancellation policy configuration
 */
export const updateCancellationSettings = async (req, res) => {
  try {
    const {
      freeCancellationWindow,
      lateCancellationFee,
      feeType,
      feePercentage,
      vendorSpecificPolicies,
    } = req.body;

    const settings = await Settings.getSettings();
    
    // Store previous values for audit
    const previousValues = { ...settings.cancellationPolicy };
    
    // Update cancellation policy
    if (freeCancellationWindow !== undefined) settings.cancellationPolicy.freeCancellationWindow = freeCancellationWindow;
    if (lateCancellationFee !== undefined) settings.cancellationPolicy.lateCancellationFee = lateCancellationFee;
    if (feeType !== undefined) settings.cancellationPolicy.feeType = feeType;
    if (feePercentage !== undefined) settings.cancellationPolicy.feePercentage = feePercentage;
    if (vendorSpecificPolicies !== undefined) {
      // Validate restaurant IDs
      if (vendorSpecificPolicies.length > 0) {
        const restaurantIds = vendorSpecificPolicies.map(v => v.restaurantId);
        const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } });
        
        if (restaurants.length !== restaurantIds.length) {
          return res.status(400).json({
            status: 'error',
            message: 'One or more restaurant IDs are invalid',
          });
        }
      }
      settings.cancellationPolicy.vendorSpecificPolicies = vendorSpecificPolicies;
    }

    await settings.save();

    // Add audit entry
    await settings.addAuditEntry(
      'UPDATE',
      'CANCELLATION_POLICY',
      {
        previous: previousValues,
        new: settings.cancellationPolicy,
      },
      req.user?.id,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      status: 'success',
      message: 'Cancellation settings updated successfully',
      data: {
        cancellationPolicy: settings.cancellationPolicy,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update cancellation settings',
    });
  }
};

/**
 * PATCH /api/admin/settings/tax
 * Update tax configuration
 */
export const updateTaxSettings = async (req, res) => {
  try {
    const {
      gst,
      serviceTax,
      vat,
      platformFee,
    } = req.body;

    const settings = await Settings.getSettings();
    
    // Store previous values for audit
    const previousValues = { ...settings.taxConfiguration };
    
    // Update tax configuration
    if (gst !== undefined) {
      if (gst.enabled !== undefined) settings.taxConfiguration.gst.enabled = gst.enabled;
      if (gst.percentage !== undefined) settings.taxConfiguration.gst.percentage = gst.percentage;
      if (gst.cgstPercentage !== undefined) settings.taxConfiguration.gst.cgstPercentage = gst.cgstPercentage;
      if (gst.sgstPercentage !== undefined) settings.taxConfiguration.gst.sgstPercentage = gst.sgstPercentage;
    }
    
    if (serviceTax !== undefined) {
      if (serviceTax.enabled !== undefined) settings.taxConfiguration.serviceTax.enabled = serviceTax.enabled;
      if (serviceTax.percentage !== undefined) settings.taxConfiguration.serviceTax.percentage = serviceTax.percentage;
    }
    
    if (vat !== undefined) {
      if (vat.enabled !== undefined) settings.taxConfiguration.vat.enabled = vat.enabled;
      if (vat.percentage !== undefined) settings.taxConfiguration.vat.percentage = vat.percentage;
    }
    
    if (platformFee !== undefined) {
      if (platformFee.enabled !== undefined) settings.taxConfiguration.platformFee.enabled = platformFee.enabled;
      if (platformFee.type !== undefined) settings.taxConfiguration.platformFee.type = platformFee.type;
      if (platformFee.amount !== undefined) settings.taxConfiguration.platformFee.amount = platformFee.amount;
      if (platformFee.percentage !== undefined) settings.taxConfiguration.platformFee.percentage = platformFee.percentage;
    }

    await settings.save();

    // Add audit entry
    await settings.addAuditEntry(
      'UPDATE',
      'TAX_CONFIGURATION',
      {
        previous: previousValues,
        new: settings.taxConfiguration,
      },
      req.user?.id,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      status: 'success',
      message: 'Tax settings updated successfully',
      data: {
        taxConfiguration: settings.taxConfiguration,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update tax settings',
    });
  }
};

/**
 * PATCH /api/admin/settings/app-version
 * Update app version control
 */
export const updateAppVersionSettings = async (req, res) => {
  try {
    const {
      platform,
      version,
      buildNumber,
      mandatory,
      releaseNotes,
    } = req.body;

    if (!platform || !version || !buildNumber) {
      return res.status(400).json({
        status: 'error',
        message: 'Platform, version, and build number are required',
      });
    }

    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({
        status: 'error',
        message: 'Platform must be either ios or android',
      });
    }

    const settings = await Settings.getSettings();
    
    // Store previous values for audit
    const previousValues = { ...settings.appVersionControl.currentVersions[platform] };
    
    // Add to version history
    settings.appVersionControl.versionHistory.push({
      platform,
      version,
      buildNumber,
      mandatory: mandatory || false,
      releaseNotes: releaseNotes || '',
      releaseDate: new Date(),
      isActive: true,
    });

    // Update current version
    settings.appVersionControl.currentVersions[platform] = {
      version,
      buildNumber,
      mandatory: mandatory || false,
      releaseNotes: releaseNotes || '',
    };

    await settings.save();

    // Add audit entry
    await settings.addAuditEntry(
      'UPDATE',
      'APP_VERSION_CONTROL',
      {
        previous: previousValues,
        new: settings.appVersionControl.currentVersions[platform],
        platform,
      },
      req.user?.id,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      status: 'success',
      message: 'App version settings updated successfully',
      data: {
        currentVersions: settings.appVersionControl.currentVersions,
        versionHistory: settings.appVersionControl.versionHistory,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update app version settings',
    });
  }
};

/**
 * PATCH /api/admin/settings/cms-pages
 * Update CMS pages content
 */
export const updateCmsPages = async (req, res) => {
  try {
    const {
      pageType,
      title,
      content,
    } = req.body;

    if (!pageType || !content) {
      return res.status(400).json({
        status: 'error',
        message: 'Page type and content are required',
      });
    }

    const validPages = ['aboutUs', 'termsAndConditions', 'privacyPolicy', 'faq'];
    if (!validPages.includes(pageType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid page type. Must be one of: ' + validPages.join(', '),
      });
    }

    const settings = await Settings.getSettings();
    
    // Store previous values for audit
    const previousValues = { ...settings.cmsPages[pageType] };
    
    // Update CMS page
    settings.cmsPages[pageType].title = title || settings.cmsPages[pageType].title;
    settings.cmsPages[pageType].content = content;
    settings.cmsPages[pageType].lastUpdated = new Date();
    settings.cmsPages[pageType].updatedBy = req.user?.id;

    await settings.save();

    // Add audit entry
    await settings.addAuditEntry(
      'UPDATE',
      'CMS_PAGES',
      {
        previous: previousValues,
        new: settings.cmsPages[pageType],
        pageType,
      },
      req.user?.id,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      status: 'success',
      message: 'CMS page updated successfully',
      data: {
        [pageType]: settings.cmsPages[pageType],
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update CMS page',
    });
  }
};

/**
 * GET /api/admin/settings/audit-trail
 * Get audit trail for settings changes
 */
export const getAuditTrail = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      section,
      startDate,
      endDate,
    } = req.query;

    const settings = await Settings.getSettings();
    
    // Build filter
    const filter = {};
    if (section) filter.section = section;
    if (startDate || endDate) {
      filter.updatedAt = {};
      if (startDate) filter.updatedAt.$gte = new Date(startDate);
      if (endDate) filter.updatedAt.$lte = new Date(endDate);
    }

    // Apply filter and pagination
    let auditTrail = settings.auditTrail;
    if (Object.keys(filter).length > 0) {
      auditTrail = auditTrail.filter(entry => {
        if (section && entry.section !== section) return false;
        if (startDate && new Date(entry.updatedAt) < new Date(startDate)) return false;
        if (endDate && new Date(entry.updatedAt) > new Date(endDate)) return false;
        return true;
      });
    }

    // Sort by date (newest first)
    auditTrail.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedTrail = auditTrail.slice(startIndex, endIndex);

    // Populate user information
    const populatedTrail = await Settings.populate(paginatedTrail, {
      path: 'auditTrail.updatedBy',
      select: 'name email',
    });

    res.status(200).json({
      status: 'success',
      data: {
        auditTrail: populatedTrail,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: auditTrail.length,
          pages: Math.ceil(auditTrail.length / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch audit trail',
    });
  }
};

/**
 * GET /api/admin/settings/public
 * Get public settings (for mobile apps)
 */
export const getPublicSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // If settings is null or undefined, return default public settings
    if (!settings) {
      const defaultPublicSettings = {
        deliveryCharges: {
          defaultCharge: 40,
          chargeType: 'flat',
          perKmCharge: 10,
          freeDeliveryThreshold: 0,
        },
        cancellationPolicy: {
          freeCancellationWindow: 5,
          lateCancellationFee: 20,
          feeType: 'fixed',
          feePercentage: 10,
        },
        taxConfiguration: {
          gst: {
            enabled: true,
            percentage: 5,
            cgstPercentage: 2.5,
            sgstPercentage: 2.5
          },
          serviceTax: {
            enabled: false,
            percentage: 10
          },
          vat: {
            enabled: false,
            percentage: 5
          },
          platformFee: {
            enabled: true,
            type: 'fixed',
            amount: 5,
            percentage: 2
          }
        },
        appVersionControl: {
          currentVersions: {
            ios: {
              version: '1.0.0',
              buildNumber: '1',
              mandatory: false,
              releaseNotes: ''
            },
            android: {
              version: '1.0.0',
              buildNumber: '1',
              mandatory: false,
              releaseNotes: ''
            }
          }
        },
        cmsPages: {
          aboutUs: {
            title: 'About Us',
            content: '',
          },
          termsAndConditions: {
            title: 'Terms & Conditions',
            content: '',
          },
          privacyPolicy: {
            title: 'Privacy Policy',
            content: '',
          },
          faq: {
            title: 'Frequently Asked Questions',
            content: '',
          },
        },
      };

      return res.status(200).json({
        status: 'success',
        data: {
          settings: defaultPublicSettings,
        },
      });
    }
    
    // Return only public-facing settings
    const publicSettings = {
      deliveryCharges: {
        defaultCharge: settings.deliveryCharges?.defaultCharge || 40,
        chargeType: settings.deliveryCharges?.chargeType || 'flat',
        perKmCharge: settings.deliveryCharges?.perKmCharge || 10,
        freeDeliveryThreshold: settings.deliveryCharges?.freeDeliveryThreshold || 0,
      },
      cancellationPolicy: {
        freeCancellationWindow: settings.cancellationPolicy?.freeCancellationWindow || 5,
        lateCancellationFee: settings.cancellationPolicy?.lateCancellationFee || 20,
        feeType: settings.cancellationPolicy?.feeType || 'fixed',
        feePercentage: settings.cancellationPolicy?.feePercentage || 10,
      },
      taxConfiguration: settings.taxConfiguration || {
        gst: {
          enabled: true,
          percentage: 5,
          cgstPercentage: 2.5,
          sgstPercentage: 2.5
        },
        serviceTax: {
          enabled: false,
          percentage: 10
        },
        vat: {
          enabled: false,
          percentage: 5
        },
        platformFee: {
          enabled: true,
          type: 'fixed',
          amount: 5,
          percentage: 2
        }
      },
      appVersionControl: {
        currentVersions: settings.appVersionControl?.currentVersions || {
          ios: {
            version: '1.0.0',
            buildNumber: '1',
            mandatory: false,
            releaseNotes: ''
          },
          android: {
            version: '1.0.0',
            buildNumber: '1',
            mandatory: false,
            releaseNotes: ''
          }
        }
      },
      cmsPages: {
        aboutUs: sanitizePublicCmsPage(settings.cmsPages?.aboutUs, 'About Us'),
        termsAndConditions: sanitizePublicCmsPage(settings.cmsPages?.termsAndConditions, 'Terms & Conditions'),
        privacyPolicy: sanitizePublicCmsPage(settings.cmsPages?.privacyPolicy, 'Privacy Policy'),
        faq: sanitizePublicCmsPage(settings.cmsPages?.faq, 'Frequently Asked Questions'),
      },
    };

    res.status(200).json({
      status: 'success',
      data: {
        settings: publicSettings,
      },
    });
  } catch (error) {
    // Return default public settings even on error to prevent mobile app crashes
    const defaultPublicSettings = {
      deliveryCharges: {
        defaultCharge: 40,
        chargeType: 'flat',
        perKmCharge: 10,
        freeDeliveryThreshold: 0,
      },
      cancellationPolicy: {
        freeCancellationWindow: 5,
        lateCancellationFee: 20,
        feeType: 'fixed',
        feePercentage: 10,
      },
      taxConfiguration: {
        gst: {
          enabled: true,
          percentage: 5,
          cgstPercentage: 2.5,
          sgstPercentage: 2.5
        },
        serviceTax: {
          enabled: false,
          percentage: 10
        },
        vat: {
          enabled: false,
          percentage: 5
        },
        platformFee: {
          enabled: true,
          type: 'fixed',
          amount: 5,
          percentage: 2
        }
      },
      appVersionControl: {
        currentVersions: {
          ios: {
            version: '1.0.0',
            buildNumber: '1',
            mandatory: false,
            releaseNotes: ''
          },
          android: {
            version: '1.0.0',
            buildNumber: '1',
            mandatory: false,
            releaseNotes: ''
          }
        }
      },
      cmsPages: {
        aboutUs: sanitizePublicCmsPage(null, 'About Us'),
        termsAndConditions: sanitizePublicCmsPage(null, 'Terms & Conditions'),
        privacyPolicy: sanitizePublicCmsPage(null, 'Privacy Policy'),
        faq: sanitizePublicCmsPage(null, 'Frequently Asked Questions'),
      },
    };

    res.status(200).json({
      status: 'success',
      data: {
        settings: defaultPublicSettings,
      },
    });
  }
};

export const updateWalletReferralSettings = async (req, res) => {
  try {
    const { walletSettings, referralSettings } = req.body;
    
    let settings = await Settings.findOne({});
    if (!settings) {
      settings = new Settings({});
    }

    if (walletSettings !== undefined) {
      if (walletSettings.enabled !== undefined)
        settings.walletSettings = settings.walletSettings || {};
      settings.walletSettings.enabled = walletSettings.enabled;
      if (walletSettings.maxUsagePercentage !== undefined)
        settings.walletSettings.maxUsagePercentage = 
          Number(walletSettings.maxUsagePercentage);
    }

    if (referralSettings !== undefined) {
      settings.referralSettings = settings.referralSettings || {};
      if (referralSettings.enabled !== undefined)
        settings.referralSettings.enabled = referralSettings.enabled;
      if (referralSettings.referrerAmount !== undefined)
        settings.referralSettings.referrerAmount = Number(referralSettings.referrerAmount);
      if (referralSettings.userReferralAmount !== undefined)
        settings.referralSettings.userReferralAmount = Number(referralSettings.userReferralAmount);
      if (referralSettings.vendorReferralAmount !== undefined)
        settings.referralSettings.vendorReferralAmount = Number(referralSettings.vendorReferralAmount);
      if (referralSettings.deliveryReferralAmount !== undefined)
        settings.referralSettings.deliveryReferralAmount = Number(referralSettings.deliveryReferralAmount);
      if (referralSettings.refereeAmount !== undefined)
        settings.referralSettings.refereeAmount = 
          Number(referralSettings.refereeAmount);
      if (referralSettings.creditAfterDelivery !== undefined)
        settings.referralSettings.creditAfterDelivery = 
          referralSettings.creditAfterDelivery;
    }

    settings.auditTrail = settings.auditTrail || [];
    settings.auditTrail.push({
      action: 'update',
      section: 'wallet_referral',
      updatedAt: new Date(),
    });

    await settings.save();

    return res.status(200).json({
      status: 'success',
      message: 'Wallet & referral settings updated',
      data: {
        walletSettings: settings.walletSettings,
        referralSettings: settings.referralSettings,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update settings',
    });
  }
};

/**
 * The sections a PUT is allowed to write. Anything outside this list is
 * ignored rather than stored, so a client sending a stray field — or a whole
 * GET response echoed back, audit trail and all — can't push junk into the
 * document.
 */
const WRITABLE_SECTIONS = [
  'deliveryCharges',
  'distancePricing',
  'riderDispatch',
  'cancellationPolicy',
  'taxConfiguration',
  'appVersionControl',
  'cmsPages',
  'walletSettings',
  'referralSettings',
];

/**
 * Merges `patch` into `target` in place, descending into plain objects and
 * replacing anything else outright.
 *
 * Arrays are replaced, not merged: these hold ordered lists such as CMS pages
 * and vendor-specific charges, where merging by index would corrupt the list
 * whenever an entry was removed.
 */
function mergeSection(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;

  const result = target && typeof target === 'object' && !Array.isArray(target)
    ? target
    : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeSection(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * PUT /api/admin/settings
 *
 * The per-section PATCH routes each cover one tab. The admin console saves the
 * settings document as a whole, so this accepts any combination of sections in
 * one call and writes only the ones present — a body carrying just
 * `taxConfiguration` leaves delivery and wallet untouched.
 */
export const updateSettings = async (req, res) => {
  try {
    /**
     * Accept the same shape this endpoint's own GET returns.
     *
     * GET answers { data: { settings: {...} } }, so a client that reads the
     * settings, edits them and sends them back posts { settings: {...} } — and
     * this looked for the sections at the top level, found none, and answered
     * "Nothing to update" for a body that contained every one of them. Saving
     * from the console failed on every tab for that reason alone.
     */
    const raw = req.body ?? {};
    const body =
      raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)
        ? raw.settings
        : raw;

    const provided = WRITABLE_SECTIONS.filter((section) =>
      Object.prototype.hasOwnProperty.call(body, section)
    );

    if (provided.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: `Nothing to update. Send at least one of: ${WRITABLE_SECTIONS.join(', ')}`,
      });
    }

    const settings = await Settings.getSettings();

    const previous = {};
    for (const section of provided) {
      previous[section] = JSON.parse(JSON.stringify(settings[section] ?? null));
      settings[section] = mergeSection(
        settings[section]?.toObject?.() ?? settings[section],
        body[section]
      );
      // Mixed and nested paths need marking or mongoose won't persist an
      // in-place mutation.
      settings.markModified(section);
    }

    await settings.save();

    await settings.addAuditEntry(
      'UPDATE',
      'SETTINGS',
      { sections: provided, previous, new: provided.reduce((acc, section) => {
        acc[section] = settings[section];
        return acc;
      }, {}) },
      req.user?.id,
      req.ip,
      req.get('User-Agent')
    );

    const saved = await Settings.findById(settings._id).select('-auditTrail').lean();

    return res.status(200).json({
      status: 'success',
      message: `Updated ${provided.length} section${provided.length === 1 ? '' : 's'}`,
      data: { settings: saved, updated: provided },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update settings',
    });
  }
};
