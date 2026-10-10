import Order from '../../models/Order.js';
import { checkFully } from '../../services/serviceabilityService.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import FoodItem from '../../models/FoodItem.js';
import Combo from '../../models/Combo.js';
import Coupon from '../../models/Coupon.js';
import Refund from '../../models/Refund.js';
import PaymentLog from '../../models/PaymentLog.js';
import RefundLog from '../../models/RefundLog.js';
import Settings from '../../models/Settings.js';
import Wallet from '../../models/Wallet.js';
import { deriveOrderNumberFromId } from '../../models/Order.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import axios from 'axios';
import { computeDynamicEta } from '../../services/etaService.js';
import notificationService from '../../services/notificationService.js';
import websocketService from '../../services/websocketService.js';

const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = toRad((b.latitude || 0) - (a.latitude || 0));
  const dLng = toRad((b.longitude || 0) - (a.longitude || 0));
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(a.latitude || 0)) * Math.cos(toRad(b.latitude || 0)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - (s1 + s2)));
};

const computeDistancePricing = async ({ restaurant, deliveryAddress }) => {
  const settings = await Settings.getSettings();
  const cfg = settings?.distancePricing || {
    distanceEnabled: true, thresholdKm: 3, baseFee: 30, perKmExtra: 10, maxDeliveryKm: null, maxDeliveryFee: null,
  };
  const thresholdKm = Number(cfg.thresholdKm ?? 3);
  const baseFee = Number(cfg.baseFee ?? 30);
  const perKmExtra = Number(cfg.perKmExtra ?? 10);
  const maxDeliveryKm = cfg.maxDeliveryKm == null ? null : Number(cfg.maxDeliveryKm);
  const maxDeliveryFee = cfg.maxDeliveryFee == null ? null : Number(cfg.maxDeliveryFee);

  const restCoords = restaurant?.address?.coordinates || {};
  const userCoords = deliveryAddress?.coordinates || {};
  const cacheKey = [
    Number(restCoords.latitude || 0).toFixed(4),
    Number(restCoords.longitude || 0).toFixed(4),
    Number(userCoords.latitude || 0).toFixed(4),
    Number(userCoords.longitude || 0).toFixed(4),
  ].join(':');
  if (!global.__distanceCache) global.__distanceCache = new Map();
  let distanceKmUsed = 0;
  let distanceSource = 'haversine_fallback';

  const cached = global.__distanceCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts < 15 * 60 * 1000)) {
    distanceKmUsed = cached.km;
    distanceSource = 'cache';
  } else if (restCoords.latitude && restCoords.longitude && userCoords.latitude && userCoords.longitude) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (key) {
      try {
        const origins = `${restCoords.latitude},${restCoords.longitude}`;
        const destinations = `${userCoords.latitude},${userCoords.longitude}`;
        const dm = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
          params: {
            origins,
            destinations,
            mode: 'driving',
            units: 'metric',
            key,
          },
          timeout: 8000,
        });
        const meters = dm?.data?.rows?.[0]?.elements?.[0]?.distance?.value;
        if (Number.isFinite(meters) && meters > 0) {
          distanceKmUsed = meters / 1000;
          distanceSource = 'route_api';
        }
      } catch (err) {
        console.warn('[DistancePricing] Distance Matrix failed, fallback to haversine');
      }
    }
    if (!distanceKmUsed) {
      distanceKmUsed = haversineKm(restCoords, userCoords);
      distanceSource = 'haversine_fallback';
    }
    if (distanceKmUsed > 0) {
      global.__distanceCache.set(cacheKey, { km: distanceKmUsed, ts: Date.now() });
    }
  }
  if (!Number.isFinite(distanceKmUsed) || distanceKmUsed < 0) distanceKmUsed = 0;

  if (maxDeliveryKm != null && distanceKmUsed > maxDeliveryKm) {
    const err = new Error(`Delivery unavailable beyond ${maxDeliveryKm} km`);
    err.code = 'DELIVERY_OUT_OF_RANGE';
    throw err;
  }

  // Distance/radius pricing is the source of truth for customer quotes and
  // order creation. The fee is calculated from the driving route distance
  // when Google Maps is configured, with Haversine as a safe fallback.
  let deliveryFee = Number(restaurant?.deliveryFee || 0);
  let extraKm = 0;
  let extraFee = 0;
  if (cfg.distanceEnabled !== false) {
    // The first threshold is covered by the base fee. Every started kilometre
    // beyond it adds the configured per-km amount, matching food-delivery
    // radius pricing while keeping all values configurable from Admin.
    extraKm = Math.max(0, Math.ceil(Math.max(0, distanceKmUsed - thresholdKm)));
    extraFee = extraKm * perKmExtra;
    deliveryFee = baseFee + extraFee;
    if (maxDeliveryFee != null) deliveryFee = Math.min(deliveryFee, maxDeliveryFee);
  }
  return {
    distanceKmUsed: Number(distanceKmUsed.toFixed(2)),
    distanceSource,
    deliveryFee: Number(deliveryFee.toFixed(2)),
    deliveryFeeBreakdown: {
      baseFee,
      extraKm,
      extraFee: Number(extraFee.toFixed(2)),
      totalDeliveryFee: Number(deliveryFee.toFixed(2)),
    },
  };
};

const buildPricedOrderItems = async ({ restaurant, items = [] }) => {
  const orderItems = [];
  let subtotal = 0;

  for (const item of items) {
    if (!item.foodItemId) {
      const err = new Error('Food item ID is required for all items');
      err.statusCode = 400;
      throw err;
    }

    if (!mongoose.Types.ObjectId.isValid(item.foodItemId)) {
      const err = new Error('Invalid ObjectId provided for foodItemId');
      err.statusCode = 400;
      throw err;
    }

    // Check FoodItem first, then Combo
    let foodItem = await FoodItem.findById(item.foodItemId);
    let isCombo = false;

    if (!foodItem) {
      // Try Combo collection
      const combo = await Combo.findById(item.foodItemId);
      if (combo) {
        isCombo = true;
        // Treat combo as a food item for pricing
        foodItem = {
          _id: combo._id,
          name: combo.name,
          price: combo.comboPrice,
          isAvailable: combo.isAvailable,
          restaurantId: combo.restaurantId,
          image: combo.image || '',
        };
      }
    }

    if (!foodItem) {
      const err = new Error(`Food item not found with ID: ${item.foodItemId}. Please add items to cart again from the restaurant menu.`);
      err.statusCode = 400;
      err.code = 'FOOD_ITEM_NOT_FOUND';
      throw err;
    }

    /*
     * The switch and the schedule, together.
     *
     * `isAvailable` alone was the whole test, so a dish limited to specific
     * hours or specific days could be ordered at any hour of any day — the
     * schedule the vendor set was stored and never consulted anywhere.
     */
    if (typeof foodItem.isOrderableAt === 'function'
      ? !foodItem.isOrderableAt()
      : !foodItem.isAvailable) {
      const err = new Error(`${foodItem.name} is currently unavailable`);
      err.statusCode = 400;
      throw err;
    }

    const itemRestaurantId = foodItem.restaurantId?.toString?.() || foodItem.restaurantId;
    const requestedRestaurantId = restaurant._id?.toString?.() || restaurant.id;
    if (itemRestaurantId !== requestedRestaurantId) {
      const err = new Error('You can only order from one restaurant at a time. Please clear your cart and add items from a single restaurant.');
      err.statusCode = 400;
      err.code = 'MULTIPLE_RESTAURANTS';
      throw err;
    }

    const qty = Number(item.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      const err = new Error('Invalid item quantity');
      err.statusCode = 400;
      throw err;
    }

    const modifierGroups = Array.isArray(foodItem.modifierGroups) ? foodItem.modifierGroups : [];
    const legacyGroups = modifierGroups.length > 0 ? modifierGroups : ((item.selectedAddons || []).length > 0 ? [{
      _id: 'legacy-addons',
      name: 'Add-ons',
      required: false,
      minSelect: 0,
      maxSelect: null,
      options: (foodItem.addons || []).map((addon, idx) => ({
        _id: addon._id || `legacy-${idx}`,
        name: addon.name,
        price: addon.price || 0,
        isAvailable: true,
      })),
    }] : []);

    const selectedModifiersInput = Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [];
    const selectedModifiers = [];
    let modifiersTotal = 0;
    /*
     * A size group prices the dish rather than adding to it, so the chosen
     * option's price replaces the base price. Null until such a group is
     * resolved; the dish's own price stands otherwise.
     */
    let absoluteBase = null;

    for (const group of legacyGroups) {
      const groupId = String(group._id);
      const selectedGroup = selectedModifiersInput.find((g) => String(g.groupId) === groupId);
      const selectedOptionIds = Array.isArray(selectedGroup?.optionIds) ? selectedGroup.optionIds.map((id) => String(id)) : [];
      const availableOptions = Array.isArray(group.options) ? group.options.filter((o) => o.isAvailable !== false) : [];
      let pickedOptions = availableOptions.filter((opt) => selectedOptionIds.includes(String(opt._id)));

      /*
       * Nothing chosen in a required group means the default, not a refusal.
       *
       * The vendor marks one option as the default and the menu quotes its
       * price, so an order that names no option is an order for that one. It
       * used to be rejected outright, which made every dish a vendor gave
       * variants to impossible to order.
       */
      if (!pickedOptions.length && availableOptions.length && group.required) {
        const fallback = availableOptions.find((o) => o.isDefault) || availableOptions[0];
        pickedOptions = [fallback];
      }

      const minSelect = Number(group.minSelect ?? (group.required ? 1 : 0));
      const maxSelect = group.maxSelect == null ? null : Number(group.maxSelect);

      if (group.required && pickedOptions.length < Math.max(1, minSelect)) {
        const err = new Error(`Please select required options for "${group.name}"`);
        err.statusCode = 400;
        err.code = 'REQUIRED_MODIFIER_MISSING';
        throw err;
      }
      if (pickedOptions.length < minSelect) {
        const err = new Error(`Please select at least ${minSelect} option(s) for "${group.name}"`);
        err.statusCode = 400;
        err.code = 'MIN_MODIFIER_NOT_MET';
        throw err;
      }
      if (maxSelect != null && pickedOptions.length > maxSelect) {
        const err = new Error(`Please select at most ${maxSelect} option(s) for "${group.name}"`);
        err.statusCode = 400;
        err.code = 'MAX_MODIFIER_EXCEEDED';
        throw err;
      }

      const groupTotal = pickedOptions.reduce((sum, option) => sum + Number(option.price || 0), 0);
      // An absolute group sets the price; it does not add to it. Adding it
      // charged the dish twice — "Full ₹220" on a ₹220 dish billed ₹440.
      if (group.priceMode === 'absolute' && pickedOptions.length) {
        absoluteBase = groupTotal;
      } else {
        modifiersTotal += groupTotal;
      }
      selectedModifiers.push({
        groupId,
        groupName: group.name,
        optionIds: pickedOptions.map((o) => String(o._id)),
        options: pickedOptions.map((o) => ({
          id: String(o._id),
          name: o.name,
          price: Number(o.price || 0),
        })),
        totalPrice: groupTotal,
      });
    }

    const addonsTotal = (item.selectedAddons || []).reduce(
      (sum, addon) => sum + Number(addon.price || 0),
      0
    );
    const itemPrice = (absoluteBase ?? Number(foodItem.price || 0)) + modifiersTotal + addonsTotal;
    const itemTotal = itemPrice * qty;
    subtotal += itemTotal;

    orderItems.push({
      foodItemId: foodItem._id,
      quantity: qty,
      selectedAddons: item.selectedAddons || [],
      selectedModifiers: isCombo ? [] : selectedModifiers,
      modifiersTotal: isCombo ? 0 : modifiersTotal,
      price: itemPrice,
      name: foodItem.name,
      isCombo: isCombo,
    });
  }

  return {
    orderItems,
    subtotal: Number(subtotal.toFixed(2)),
  };
};

const calculateCouponDiscount = async ({ couponCode, orderTotal, restaurantId, userId }) => {
  const code = String(couponCode || '').trim().toUpperCase();
  if (!code) return { couponCode: '', discount: 0, coupon: null };

  const now = new Date();
  const coupon = await Coupon.findOne({ code, isActive: true });
  if (!coupon) {
    const err = new Error('Invalid or expired coupon code');
    err.statusCode = 400;
    err.code = 'INVALID_COUPON';
    throw err;
  }

  if ((coupon.startDate && now < coupon.startDate) || (coupon.endDate && now > coupon.endDate)) {
    const err = new Error('Invalid or expired coupon code');
    err.statusCode = 400;
    err.code = 'INVALID_COUPON';
    throw err;
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    const err = new Error('Coupon usage limit reached');
    err.statusCode = 400;
    err.code = 'COUPON_LIMIT_REACHED';
    throw err;
  }

  if (coupon.perUserLimit) {
    const userUsageCount = coupon.redemptionHistory.filter(
      (entry) => entry.userId && String(entry.userId) === String(userId)
    ).length;
    if (userUsageCount >= coupon.perUserLimit) {
      const err = new Error('You have already used this coupon');
      err.statusCode = 400;
      err.code = 'COUPON_USER_LIMIT_REACHED';
      throw err;
    }
  }

  if (coupon.minOrderValue && orderTotal < coupon.minOrderValue) {
    const err = new Error(`Minimum order value is ₹${coupon.minOrderValue}`);
    err.statusCode = 400;
    err.code = 'COUPON_MIN_ORDER_NOT_MET';
    throw err;
  }

  if (!coupon.isGlobal && coupon.applicableRestaurants?.length > 0) {
    const applies = coupon.applicableRestaurants.some((id) => String(id) === String(restaurantId));
    if (!applies) {
      const err = new Error('Coupon not applicable for this restaurant');
      err.statusCode = 400;
      err.code = 'COUPON_NOT_APPLICABLE';
      throw err;
    }
  }

  let discount = 0;
  if (coupon.type === 'flat') {
    discount = Number(coupon.discountValue || 0);
  } else if (coupon.type === 'percentage') {
    discount = (orderTotal * Number(coupon.discountValue || 0)) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else if (coupon.type === 'bogo') {
    discount = Number(coupon.discountValue || 0);
  }

  return {
    couponCode: code,
    discount: Math.min(Math.round(discount), Math.round(orderTotal)),
    coupon,
    // Carried onto the order so the payout knows whose money this was.
    fundedBy: coupon.fundedBy === 'vendor' ? 'vendor' : 'platform',
  };
};

export const previewOrderPricing = async (req, res) => {
  try {
    const { restaurantId, items = [], deliveryAddress, tip = 0 } = req.body;
    if (!restaurantId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'restaurantId and items are required' });
    }
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ status: 'error', message: 'Restaurant not found' });

    const { subtotal } = await buildPricedOrderItems({ restaurant, items });

    const platformFee = Math.max(subtotal * 0.02, 8);
    const pricing = await computeDistancePricing({ restaurant, deliveryAddress });
    const tax = subtotal * 0.05;
    const deliveryGSTAmount = pricing.deliveryFee * 0.18;
    const platformGSTAmount = platformFee * 0.18;
    const gstAndPackaging = tax + deliveryGSTAmount + platformGSTAmount;
    const eta = await computeDynamicEta({
      restaurant,
      userCoordinates: deliveryAddress?.coordinates,
    });
    const packagingFee = Number(restaurant.dailyPackagingFee || 0);
    const finalTotal = subtotal + gstAndPackaging + platformFee + pricing.deliveryFee + Number(tip || 0) + packagingFee;

    return res.status(200).json({
      status: 'success',
      data: {
        subtotal: Number(subtotal.toFixed(2)),
        gst: Number(tax.toFixed(2)),
        deliveryGST: Number(deliveryGSTAmount.toFixed(2)),
        platformGST: Number(platformGSTAmount.toFixed(2)),
        totalGST: Number(gstAndPackaging.toFixed(2)),
        platformFee: Number(platformFee.toFixed(2)),
        packagingFee: Number(packagingFee.toFixed(2)),
        tip: Number(tip || 0),
        distanceKmUsed: pricing.distanceKmUsed,
        distanceSource: pricing.distanceSource,
        deliveryFee: pricing.deliveryFee,
        deliveryFeeBreakdown: pricing.deliveryFeeBreakdown,
        estimatedDeliveryMinutes: eta.estimatedDeliveryMinutes,
        etaSource: eta.etaSource,
        etaBreakdown: eta.etaBreakdown,
        finalTotal: Number(finalTotal.toFixed(2)),
      },
    });
  } catch (error) {
    if (error?.code === 'DELIVERY_OUT_OF_RANGE') {
      return res.status(409).json({ status: 'error', message: error.message, code: error.code });
    }
    return res.status(error.statusCode || 500).json({ status: 'error', code: error.code, message: error.message || 'Failed to preview pricing' });
  }
};

// Create order - POST /api/orders/create
export const createOrder = async (req, res) => {
  try {
    // DEBUG LOGGING
    console.log("ORDER CREATE PAYLOAD:");
    console.log(JSON.stringify(req.body, null, 2));
    
    const {
      restaurantId,
      items,
      useWallet = false,
      deliveryAddress,
      paymentMethod = 'cod',
      notes,
      tip = 0,
      packagingFee = 0,
      couponCode = '',
    } = req.body;

    // DEBUG LOGGING
    console.log("PAYMENT METHOD:", paymentMethod);
    console.log("RESTAURANT ID:", restaurantId);
    console.log("ADDRESS ID:", deliveryAddress?.id || 'N/A');

    // Get user from auth middleware
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    // OBJECTID VALIDATION
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ObjectId provided for userId'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ObjectId provided for restaurantId'
      });
    }

    // Validate addressId if provided
    if (deliveryAddress?.id && !mongoose.Types.ObjectId.isValid(deliveryAddress.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ObjectId provided for addressId'
      });
    }

    // Validate required fields
    if (!restaurantId) {
      return res.status(400).json({
        status: 'error',
        message: 'Restaurant ID is required',
      });
    }

    // Validate restaurantId is a valid MongoDB ObjectId - with enhanced fallback
    let restaurant = null;
    
    // Strategy 1: Try ObjectId validation and lookup
    if (mongoose.Types.ObjectId.isValid(restaurantId)) {
      restaurant = await Restaurant.findById(restaurantId);
    }
    
    // Strategy 2: If ObjectId fails, try string-based lookup
    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [
          { _id: restaurantId },
          { customId: restaurantId },
          { name: { $regex: new RegExp(`^${restaurantId}$`, 'i') } }
        ]
      });
    }
    
    // Strategy 3: Final attempt with direct string match
    if (!restaurant && typeof restaurantId === 'string') {
      restaurant = await Restaurant.findOne({ 
        name: restaurantId 
      });
    }
    
    if (!restaurant) {
      return res.status(400).json({
        status: 'error',
        message: `Restaurant not found with ID: ${restaurantId}. Please add items to cart again from the restaurant menu.`,
        code: 'RESTAURANT_NOT_FOUND',
        suggestion: 'Try browsing restaurants and adding items fresh from the menu.'
      });
    }

    const isApprovedForOrdering =
      restaurant.status === 'approved' &&
      restaurant.isEnabled === true &&
      restaurant.isApproved !== false &&
      restaurant.isActive !== false;

    if (!isApprovedForOrdering) {
      return res.status(409).json({
        status: 'error',
        message: 'Restaurant is currently unavailable',
        code: 'RESTAURANT_UNAVAILABLE',
      });
    }

    // Authoritative availability guard: block new orders when restaurant is offline
    if (restaurant.isOpen !== true) {
      return res.status(409).json({
        status: 'error',
        message: 'Restaurant is currently offline',
        code: 'RESTAURANT_OFFLINE',
      });
    }

    /**
     * The last word on whether this delivery may be offered at all.
     *
     * The listing already said yes or no, and the app acted on it - but a
     * customer can change their address between the menu and the payment
     * screen, a vendor can shrink their radius while a basket sits open, and
     * an app can be persuaded to send whatever it likes. So the question is
     * asked again here, against the address the order is actually for, and
     * this answer is the one that counts.
     */
    const reach = await checkFully({
      restaurant,
      customer: deliveryAddress?.coordinates,
    });

    if (!reach.serviceable && reach.reason !== 'customer_location_unknown') {
      return res.status(409).json({
        status: 'error',
        code: 'NOT_SERVICEABLE',
        message: reach.message,
        data: {
          deliveryRadiusKm: reach.radiusKm,
          distanceKm: reach.distanceKm,
          reason: reach.reason,
        },
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Order must contain at least one item',
      });
    }

    // Validate restaurant exists - moved up since we already fetched it
    // The restaurant validation is now done above with the ObjectId check

    // Validate user exists and get wallet balance
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    const { orderItems, subtotal } = await buildPricedOrderItems({ restaurant, items });

    // Calculate platform fee (2% of subtotal, minimum ₹8)
    const platformFee = Math.max(subtotal * 0.02, 8);

    const distancePricing = await computeDistancePricing({ restaurant, deliveryAddress });
    const deliveryFee = distancePricing.deliveryFee;

    // Calculate GST: 5% on items, 18% on delivery, 18% on platform fee
    const tax = subtotal * 0.05;
    const deliveryGSTAmount = deliveryFee * 0.18;
    const platformGSTAmount = platformFee * 0.18;
    const gstAndPackaging = tax + deliveryGSTAmount + platformGSTAmount;

    // Use tip and packaging fee from frontend if provided, otherwise use defaults
    const finalTip = tip || 0;
    const finalPackagingFee = Number(restaurant.dailyPackagingFee || packagingFee || 0);

    // Calculate total before wallet deduction
    const totalBeforeWallet = subtotal + gstAndPackaging + platformFee + deliveryFee + finalTip + finalPackagingFee;
    const couponResult = await calculateCouponDiscount({
      couponCode,
      orderTotal: totalBeforeWallet,
      restaurantId: restaurant._id,
      userId,
    });

    // Apply wallet deduction logic if useWallet is true
    let walletUsed = 0;
    if (useWallet) {
      try {
        // Get actual balance from Wallet collection
        const userWallet = await Wallet.findOne({
          userId: user._id
        });
        /*
         * What the customer may actually spend: the balance less anything an
         * admin has put on hold, and nothing while the wallet is frozen. Held
         * money is still theirs - it simply cannot be paid with until it is
         * released - so reading the raw balance here would have let them spend
         * the very amount that was being withheld.
         */
        const rawBalance = Number(userWallet?.balance ?? user.walletBalance ?? 0);
        const heldAmount = Number(userWallet?.heldAmount ?? 0);
        const actualBalance = userWallet?.isFrozen
          ? 0
          : Math.max(0, rawBalance - heldAmount);

        if (actualBalance > 0) {
          /**
           * How much of this order the wallet may cover.
           *
           * Ten percent by the client's rule - the wallet is a sweetener on
           * an order, not a way to pay for one. Read from settings so it can
           * be changed without a deploy, and enforced here rather than in the
           * app: a cap the client can edit in a phone is not a cap.
           */
          let maxWalletPercent = 10;
          try {
            const settings = await Settings.findOne({});
            if (settings?.walletSettings?.enabled &&
                settings?.walletSettings?.maxUsagePercentage) {
              maxWalletPercent =
                settings.walletSettings.maxUsagePercentage;
            }
            // Never more than the whole order, whatever the setting says.
            maxWalletPercent = Math.min(100, Math.max(0, maxWalletPercent));
          } catch (e) {
            console.log('Settings fetch error:', e.message);
          }

          const maxWalletUsage =
            totalBeforeWallet * (maxWalletPercent / 100);
          // Rounded down to whole rupees: a customer paying 49.97 from a
          // wallet is a rounding argument nobody needs.
          walletUsed = Math.floor(Math.min(actualBalance, maxWalletUsage));

          console.log('💰 Wallet check:', {
            actualBalance,
            maxWalletPercent,
            maxWalletUsage,
            walletUsed
          });
        }
      } catch (walletCheckErr) {
        console.log('Wallet check error:',
          walletCheckErr.message);
      }
    }

    // Calculate final total after wallet deduction. Backend is authoritative.
    const total = totalBeforeWallet - walletUsed - couponResult.discount;

    // Validate that total is not negative
    if (total < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order total calculation',
      });
    }

    // Round total to 2 decimal places for accuracy
    const roundedTotal = Number(total.toFixed(2));

    /*
     * The method has to be one the server knows, and cash has to be allowed.
     *
     * Anything unrecognised used to fall through to 'cod'. The app sends the
     * label the customer picked - "UPI", "Credit / Debit Card" - none of which
     * are in this list, so orders meant to be paid online were written as cash
     * orders and went straight to the restaurant with nothing collected. One
     * of the two orders on the live server (AAA-119) is exactly that. Refusing
     * an unknown method is the difference between a failed order and an order
     * nobody was ever going to be paid for.
     */
    const KNOWN_METHODS = ['cod', 'wallet', 'cashfree', 'razorpay'];
    if (!KNOWN_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        status: 'error',
        code: 'unknown_payment_method',
        message: `Unsupported payment method: ${paymentMethod}`,
      });
    }

    /*
     * Cash is offered per customer, not to everyone: it is the one method
     * where the platform is owed money after the food has already gone.
     */
    if (paymentMethod === 'cod' && user.codEnabled !== true) {
      return res.status(403).json({
        status: 'error',
        code: 'cod_not_allowed',
        message: 'Cash on delivery is not available on this account.',
      });
    }

    const finalPaymentMethod = paymentMethod;
    const isOnlinePayment = ['cashfree', 'razorpay'].includes(finalPaymentMethod);
    const initialOrderStatus = isOnlinePayment ? 'Payment Pending' : 'Waiting for Confirmation';
    const initialTimelineMessage = isOnlinePayment
      ? 'Order created. Waiting for payment confirmation.'
      : 'Order placed successfully';
    
    // Create order
    const order = new Order({
      userId,
      restaurantId,
      riderId: null, // Explicitly set to null - order not assigned to any rider yet
      items: orderItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      gstAndPackaging: parseFloat(gstAndPackaging.toFixed(2)),
      platformFee: parseFloat(platformFee.toFixed(2)),
      deliveryFee: parseFloat(deliveryFee.toFixed(2)),
      distanceKmUsed: distancePricing.distanceKmUsed,
      distanceSource: distancePricing.distanceSource,
      deliveryFeeBreakdown: distancePricing.deliveryFeeBreakdown,
      walletUsed: parseFloat(walletUsed.toFixed(2)),
      tip: parseFloat(finalTip.toFixed(2)),
      packagingFee: parseFloat(finalPackagingFee.toFixed(2)),
      discount: parseFloat(couponResult.discount.toFixed(2)),
      couponCode: couponResult.couponCode,
      /**
       * Whose promotion this was, recorded at the time.
       *
       * Read later when the vendor is settled: a discount the vendor funded
       * comes out of their payout, one the platform funded does not. Copied
       * onto the order rather than looked up from the coupon, because a
       * coupon's terms can change after the order it was used on.
       */
      discountFundedBy: couponResult.fundedBy || 'platform',
      total: roundedTotal,
      status: initialOrderStatus,
      deliveryAddress: deliveryAddress || user.savedAddresses[0] || {},
      paymentMethod: finalPaymentMethod,
      paymentStatus: 'pending',
      notes: notes || '',
      timeline: [
        {
          status: initialOrderStatus,
          timestamp: new Date(),
          message: initialTimelineMessage,
        },
      ],
    });

    await order.save();

    if (couponResult.coupon) {
      couponResult.coupon.usedCount = Number(couponResult.coupon.usedCount || 0) + 1;
      couponResult.coupon.redemptionHistory.push({
        orderId: order._id,
        userId,
        restaurantId: restaurant._id,
        discountAmount: couponResult.discount,
      });
      await couponResult.coupon.save();
    }

    if (!isOnlinePayment && restaurant.owner) {
      try {
        await notificationService.storeNotification(
          restaurant.owner.toString(),
          {
            title: 'New Order Received',
            body: `New order ${order.orderNumber || deriveOrderNumberFromId(order._id)} received. Please accept to start preparing.`,
            type: 'order',
            data: {
              orderId: order._id.toString(),
              orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
              type: 'new_order',
            },
          },
          'vendor'
        );
      } catch (notifyError) {
        console.error('[VendorOrderNotificationError]', notifyError?.message || notifyError);
      }
    }

    console.log('[OrderCreate] restaurant.owner:', 
      restaurant.owner);
    console.log('[OrderCreate] vendorId being passed:', 
      restaurant.owner ? String(restaurant.owner) : null);
    console.log('[OrderCreate] Full restaurant object keys:', 
      Object.keys(restaurant.toObject ? 
        restaurant.toObject() : restaurant));

    websocketService.emitOrderLifecycle({
      order,
      eventName: 'order_created',
      source: 'user',
      userId,
      vendorId: restaurant.owner ? String(restaurant.owner) : null,
    });

    // Deduct wallet balance if used
    if (walletUsed > 0) {
      // Update User.walletBalance
      user.walletBalance = Math.max(0, user.walletBalance - walletUsed);
      await user.save();

      // Also update Wallet collection (used by payment screen)
      try {
        await Wallet.findOneAndUpdate(
          { userId: user._id },
          {
            $inc: {
              balance: -walletUsed,
              totalSpent: walletUsed
            },
            $set: {
              lastUpdated: new Date(),
              lastTransactionAt: new Date()
            }
          }
        );
      } catch (walletErr) {
        console.log('Wallet collection update error:',
          walletErr.message);
      }

      console.log('💰 Wallet deducted:', walletUsed,
        'New balance:', user.walletBalance);
    }

    // CRITICAL: Refresh user session to prevent token expiry issues
    // Touch user document to update updatedAt timestamp (keeps session alive)
    // This ensures the user's session stays valid after order creation
    await user.save({ validateBeforeSave: false });

    
    // Populate order with details for response
    const eta = await computeDynamicEta({
      restaurant,
      userCoordinates: order.deliveryAddress?.coordinates,
    });

    await order.populate('restaurantId', 'name image rating deliveryTime deliveryFee address');
    await order.populate('userId', 'name email phone');
    await order.populate('items.foodItemId', 'name image price');

    // CRITICAL: Ensure valid JSON response with proper structure
    // Convert MongoDB ObjectIds to strings to prevent JSON serialization issues
    const responseData = {
      status: 'success',
      message: 'Order created successfully',
      data: {
        order: {
          id: order._id.toString(),
          _id: order._id.toString(),
          orderNumber: order.orderNumber || null,
          userId: order.userId.toString(),
          restaurantId: order.restaurantId.toString(),
          items: order.items.map(item => ({
            ...(item.toObject ? item.toObject() : item),
            foodItemId: item.foodItemId?._id?.toString() || item.foodItemId?.toString() || item.foodItemId,
          })),
          subtotal: order.subtotal,
          tax: order.tax,
          gstAndPackaging: order.gstAndPackaging || order.tax,
          platformFee: order.platformFee || 0,
          deliveryFee: order.deliveryFee,
          walletUsed: order.walletUsed,
          tip: order.tip || 0,
          packagingFee: order.packagingFee || 0,
          discount: order.discount || 0,
          couponCode: order.couponCode || '',
          total: order.total,
          estimatedDeliveryMinutes: eta.estimatedDeliveryMinutes,
          deliveryTime: eta.deliveryTime,
          etaSource: eta.etaSource,
          etaBreakdown: eta.etaBreakdown,
          status: order.status,
          timeline: order.timeline,
          deliveryAddress: order.deliveryAddress,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          notes: order.notes || '',
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
        updatedWalletBalance: walletUsed > 0 ? user.walletBalance : undefined,
      },
    };
    
    // Ensure response is sent as valid JSON
    res.status(201).json(responseData);
  } catch (error) {
    // CRITICAL: Ensure error response is also valid JSON
    res.status(error.statusCode || 500).json({
      status: 'error',
      code: error.code,
      message: error.message || 'Failed to create order',
      success: false,
    });
  }
};

/**
 * Withdraws an order whose online payment never completed.
 *
 * DELETE /api/orders/:orderId/pending
 *
 * An online order is written before the customer reaches the gateway, because
 * the gateway charges against an order id. If they cancel the sheet, the card
 * is declined, or the sheet never opens, that row describes an order nobody
 * placed: no restaurant saw it, no rider was assigned, no money moved.
 *
 * Cancelling it would leave a "Cancelled" order in the customer's history for
 * every abandoned payment, which is noise about something that never happened.
 * So it is removed outright, and the coupon it consumed is handed back - the
 * redemption was counted at creation, and a coupon burnt on an order that was
 * never placed would quietly use up a one-per-customer offer.
 *
 * Deliberately narrow: only the order's owner, only while still unpaid, and
 * only from "Payment Pending". Anything that reached a restaurant goes through
 * the ordinary cancellation route instead, which keeps its record and refunds.
 */
export const abandonPendingOrder = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }
    if (order.userId.toString() !== userId.toString()) {
      return res.status(403).json({ status: 'error', message: 'Not authorized' });
    }
    if (order.status !== 'Payment Pending' || order.paymentStatus === 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'This order has already been placed and cannot be withdrawn here.',
      });
    }

    if (order.couponCode) {
      await Coupon.updateOne(
        { code: order.couponCode },
        {
          $inc: { usedCount: -1 },
          $pull: { redemptionHistory: { orderId: order._id } },
        }
      );
    }

    await Order.deleteOne({ _id: order._id });

    return res.json({ status: 'success', message: 'Pending order withdrawn' });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to withdraw the pending order',
    });
  }
};

// Get user's orders - GET /api/orders/my-orders
export const getMyOrders = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    /*
     * An online-payment order is written before the customer is sent to
     * Razorpay, because the gateway needs an order id to attach the payment
     * to. Until that payment succeeds the order is not a real order: the
     * restaurant never sees it and nobody is cooking. Showing it here made
     * customers believe an abandoned or failed payment had still placed an
     * order. The vendor and admin lists already excluded it; this one didn't.
     */
    const orders = await Order.find({ userId, status: { $ne: 'Payment Pending' } })
      .populate('restaurantId', 'name image rating deliveryTime deliveryFee address currentPrepTimeMinutes deliveryBufferMinutes')
      .populate('riderId', 'name phone rating currentRating image profileImage')
      .populate('items.foodItemId', 'name image price')
      .sort({ createdAt: -1 });
    const formattedOrders = await Promise.all(orders.map(async (order) => {
      const eta = await computeDynamicEta({
        restaurant: order.restaurantId,
        userCoordinates: order.deliveryAddress?.coordinates,
      });

      return {
        id: order._id,
        _id: order._id,
        orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
        orderId: order.orderNumber || deriveOrderNumberFromId(order._id),
        restaurantId: order.restaurantId,
        riderId: order.riderId,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        gstAndPackaging: order.gstAndPackaging || order.tax,
        platformFee: order.platformFee || 0,
        deliveryFee: order.deliveryFee,
        distanceKmUsed: order.distanceKmUsed || 0,
        distanceSource: order.distanceSource,
        deliveryFeeBreakdown: order.deliveryFeeBreakdown,
        walletUsed: order.walletUsed,
        tip: order.tip || 0,
        packagingFee: order.packagingFee || 0,
        discount: order.discount || 0,
        couponCode: order.couponCode || '',
        total: order.total,
        estimatedDeliveryMinutes: eta.estimatedDeliveryMinutes,
        deliveryTime: eta.deliveryTime,
        etaSource: eta.etaSource,
        etaBreakdown: eta.etaBreakdown,
        status: order.status,
        timeline: order.timeline,
        deliveryAddress: order.deliveryAddress,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        notes: order.notes,
        /*
         * What the customer may still do with this order, decided here rather
         * than guessed in the app. The rules are the ones the cancel endpoint
         * enforces, so the button the app shows and the answer it gets back
         * cannot disagree.
         */
        canCancel: ['Payment Pending', 'Waiting for Confirmation'].includes(order.status),
        // A cancellation is refunded only if money was actually taken.
        refundOnCancel: order.paymentStatus === 'paid',
        // Once it is out for delivery the way to get money back is to raise a
        // refund against the delivered order, not to cancel it.
        canRequestRefund:
          order.paymentStatus === 'paid' &&
          ['Delivered', 'Cancelled'].includes(order.status),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    }));

    res.status(200).json({
      status: 'success',
      data: {
        orders: formattedOrders,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch orders',
    });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, status } = req.body;
    const userId = req.user.id;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Only allow cancellation if order belongs to user
    if (order.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this order',
      });
    }

    // Only cancel if payment pending or waiting
    const cancellableStatuses = [
      'Payment Pending',
      'Waiting for Confirmation',
    ];

    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled in ${order.status} status`,
      });
    }

    /*
     * A cancelled order that was paid for is owed a refund.
     *
     * This marked every cancellation 'failed', including orders the customer
     * had already paid for - the record then said the payment never went
     * through while the money sat with the gateway, and nothing was ever
     * raised to give it back. An unpaid order really did fail, and still
     * reads that way.
     */
    const wasPaid = order.paymentStatus === 'paid';

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        status: status || 'Cancelled',
        paymentStatus: wasPaid ? 'paid' : 'failed',
        cancellationReason: reason || 'Cancelled by user',
        $push: {
          timeline: {
            status: 'Cancelled',
            timestamp: new Date(),
            message: reason || 'Order cancelled by user',
          },
        },
      },
      { new: true }
    );

    let refundRaised = null;
    if (wasPaid) {
      // Raised, not granted: it joins the admin panel's Refund Requests like
      // any other, and a person decides. Nothing is paid out here.
      const existing = await Refund.findOne({ orderId: order._id });
      if (!existing) {
        refundRaised = await Refund.create({
          orderId: order._id,
          userId: order.userId,
          refundAmount: Number(order.total),
          refundReason: `Order cancelled: ${reason || 'cancelled by customer'}`,
          refundStatus: 'pending',
          refundMethod: order.paymentMethod === 'wallet' ? 'wallet' : 'original_payment',
          refundTimeline: [
            {
              status: 'requested',
              timestamp: new Date(),
              message: `Raised automatically when the order was cancelled: ₹${order.total}`,
              updatedBy: order.userId,
            },
          ],
        });
      } else {
        refundRaised = existing;
      }
    }

    return res.json({
      success: true,
      message: wasPaid
        ? 'Order cancelled. A refund has been raised and will be reviewed.'
        : 'Order cancelled successfully',
      data: {
        order: updatedOrder,
        refund: refundRaised
          ? { id: refundRaised._id, refundId: refundRaised.refundId, amount: refundRaised.refundAmount }
          : null,
      },
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
    });
  }
};


// Process refund - POST /api/orders/:orderId/refund
export const processRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount, reason, refundWallet = false } = req.body;
    const adminId = req.user._id;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Refund amount must be greater than 0',
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Refund reason is required',
      });
    }

    // Find order
    const order = await Order.findById(orderId).populate('userId');
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot refund unpaid order',
      });
    }

    // Find payment log
    const paymentLog = await PaymentLog.findOne({ orderId });
    if (!paymentLog) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment log not found',
      });
    }

    // Check if refund already exists
    const existingRefund = await RefundLog.findOne({
      orderId,
      status: { $in: ['initiated', 'processed'] }
    });

    if (existingRefund) {
      return res.status(400).json({
        status: 'error',
        message: 'Refund already processed for this order',
      });
    }

    // For now, create refund log and update order
    const refundId = `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create refund log
    const refundLog = new RefundLog({
      orderId,
      paymentId: paymentLog.paymentId,
      refundId,
      amount,
      reason: reason.trim(),
      processedBy: adminId,
      status: 'processed', // Auto-process for now
      processedAt: new Date(),
      metadata: {
        refundWallet,
        originalAmount: paymentLog.amount,
      }
    });

    await refundLog.save();

    // Update order
    order.paymentStatus = 'refunded';
    order.status = 'Refunded';
    order.timeline.push({
      status: 'Refunded',
      timestamp: new Date(),
      message: `Refund of ₹${amount} processed: ${reason}`,
    });
    await order.save();

    // Refund to wallet if requested
    if (refundWallet && order.userId) {
      const user = await User.findById(order.userId);
      if (user) {
        user.walletBalance += amount;
        await user.save();

        refundLog.walletRefunded = amount;
        await refundLog.save();
      }
    }
    res.status(200).json({
      status: 'success',
      message: 'Refund processed successfully',
      data: {
        refundId,
        amount,
        status: 'processed',
        walletRefunded: refundLog.walletRefunded,
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Refund processing failed',
    });
  }
};

// Get refund history - GET /api/orders/:orderId/refunds
export const getRefundHistory = async (req, res) => {
  try {
    const { orderId } = req.params;

    const refunds = await RefundLog.find({ orderId })
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: {
        refunds: refunds.map(refund => ({
          refundId: refund.refundId,
          amount: refund.amount,
          status: refund.status,
          reason: refund.reason,
          processedBy: refund.processedBy?.name || 'System',
          processedAt: refund.processedAt,
          walletRefunded: refund.walletRefunded,
          failureReason: refund.failureReason,
        }))
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch refund history',
    });
  }
};
