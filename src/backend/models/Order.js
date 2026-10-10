import mongoose from 'mongoose';
import crypto from 'crypto';
import { getNextOrderNumber } from './Counter.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I,O to avoid confusion with 1,0

/** Derive display orderNumber from _id for legacy orders (deterministic). Exported for API use. */
export function deriveOrderNumberFromId(id) {
  if (!id) return null;
  const str = id.toString();
  if (str.length < 12) return `ORD${str.slice(-3).padStart(3, '0')}`;
  let result = '';
  for (let i = 0; i < 3; i++) {
    const idx = parseInt(str.slice(i * 2, i * 2 + 2), 16) % LETTERS.length;
    result += LETTERS[idx];
  }
  for (let i = 0; i < 3; i++) {
    result += String(parseInt(str.slice(18 + i * 2, 20 + i * 2) || '0', 16) % 10);
  }
  return `${result.slice(0, 3)}-${result.slice(3)}`;
}

const timelineSchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  message: {
    type: String,
  },
}, {
  _id: true,
});

const orderItemSchema = new mongoose.Schema({
  foodItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FoodItem',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  selectedAddons: {
    type: [{
      name: String,
      price: Number,
    }],
    default: [],
  },
  selectedModifiers: {
    type: [{
      groupId: String,
      groupName: String,
      optionIds: [String],
      options: [{
        id: String,
        name: String,
        price: Number,
      }],
      totalPrice: {
        type: Number,
        default: 0,
      },
    }],
    default: [],
  },
  modifiersTotal: {
    type: Number,
    default: 0,
    min: 0,
  },
  price: {
    type: Number,
    required: true,
  },
  name: String, // Store food item name at time of order
}, {
  _id: true,
});

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Order must have a user'],
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Order must have a restaurant'],
  },
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // Optional - assigned when rider accepts order
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  tax: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  gstAndPackaging: {
    type: Number,
    default: 0,
    min: 0,
  },
  platformFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  distanceKmUsed: {
    type: Number,
    default: 0,
    min: 0,
  },
  distanceSource: {
    type: String,
    enum: ['route_api', 'cache', 'haversine_fallback'],
    default: 'haversine_fallback',
  },
  deliveryFeeBreakdown: {
    baseFee: {
      type: Number,
      default: 0,
    },
    extraKm: {
      type: Number,
      default: 0,
    },
    extraFee: {
      type: Number,
      default: 0,
    },
    totalDeliveryFee: {
      type: Number,
      default: 0,
    },
  },
  walletUsed: {
    type: Number,
    default: 0,
    min: 0,
  },
  tip: {
    type: Number,
    default: 0,
    min: 0,
  },
  packagingFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  couponCode: {
    type: String,
    default: '',
    uppercase: true,
    trim: true,
  },
  total: {
    type: Number,
    required: [true, 'Order must have a total amount'],
    min: 0,
  },
  status: {
    type: String,
    enum: [
      'Waiting for Confirmation',
      'Order Confirmed',
      'In Progress',
      'Processing',
      'Ready',
      'OnWay',
      'Delivered',
      'Cancelled',
      'RiderRejected',
      'Pending', // Keep for backward compatibility
      'Payment Pending',
    ],
    default: 'Waiting for Confirmation',
  },
  /**
   * Where this delivery sits in the rider's current run, counting from 1.
   *
   * A rider can be carrying more than one order at a time. Without an order
   * to work them in, two customers are each told their food is next and one
   * of them is wrong; the rider has no stated sequence to follow either.
   *
   * Set when the order is accepted and cleared when it is delivered, so it
   * describes the run in hand rather than a permanent property of the order.
   */
  stopIndex: {
    type: Number,
    default: null,
  },

  timeline: {
    type: [timelineSchema],
    default: [],
  },
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
  },
  paymentMethod: {
    type: String,
    enum: ['cod', 'wallet', 'cashfree', 'razorpay'],
    default: 'cod',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  razorpayOrderId: {
    type: String,
  },
  razorpayPaymentId: {
    type: String,
  },
  // Multi-tenant organization support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
  notes: {
    type: String,
  },
  // Admin Order Control Fields
  adminNotes: {
    type: String,
  },
  disputeStatus: {
    type: String,
    enum: ['none', 'open', 'resolved'],
    default: 'none',
  },
  disputeNotes: {
    type: String,
  },
  refundInfo: {
    isRefunded: {
      type: Boolean,
      default: false,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundReason: {
      type: String,
    },
    refundNotes: {
      type: String,
    },
    refundDate: {
      type: Date,
    },
    refundedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  assignmentHistory: [{
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assignmentType: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'manual',
    },
    notes: {
      type: String,
    },
  }],
  dispatchState: {
    type: String,
    enum: ['pending', 'assigned', 'expired', 'cancelled', null],
    default: null,
  },
  dispatchStartedAt: {
    type: Date,
    default: null,
  },
  dispatchExpiresAt: {
    type: Date,
    default: null,
  },
  dispatchRadiusKmUsed: {
    type: Number,
    default: null,
  },
  candidateRiderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  /**
   * Whose money the discount on this order came out of.
   *
   * Fixed at the time of the order: a coupon's terms can be edited later, and
   * a payout must settle on what was agreed when the sale happened.
   */
  discountFundedBy: {
    type: String,
    enum: ['vendor', 'platform'],
    default: 'platform',
  },

  /**
   * Riders who have already said no to this order.
   *
   * Kept so dispatch does not offer it to them again. Without it a rider who
   * declined was put back in the candidate pool on the next sweep and shown
   * the same request every few seconds.
   */
  declinedRiderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  assignedAt: {
    type: Date,
    default: null,
  },
  dispatchFailureReason: {
    type: String,
    default: null,
  },

  /**
   * Handover verification, at both ends of the journey.
   *
   * `pickup` is shown by the vendor and entered or scanned by the rider, so
   * the food cannot leave the counter with the wrong person. `delivery` is
   * shown by the customer and entered by the rider, so it cannot be recorded
   * as delivered to someone who never received it.
   *
   * Both are generated when the order is placed rather than at the moment of
   * handover: the vendor's screen and the customer's screen need to be able to
   * display the code before the rider arrives, and generating on demand means
   * two devices can disagree about what the code is.
   *
   * The QR code is not a second secret — it encodes the same code, so a
   * vendor can offer either without the API having to track which was used.
   */
  pickupVerification: {
    code: { type: String, select: false },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** How the rider proved it: 'otp' when typed, 'qr' when scanned. */
    method: { type: String, enum: ['otp', 'qr'], default: undefined },
    attempts: { type: Number, default: 0 },
  },
  deliveryVerification: {
    code: { type: String, select: false },
    verifiedAt: Date,
    method: { type: String, enum: ['otp', 'qr'], default: undefined },
    attempts: { type: Number, default: 0 },
  },

  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  cancellationReason: {
    type: String,
  },
  cancellationNotes: {
    type: String,
  },
  // Human-readable order ID: 3 letters + 3 digits (e.g. ABC123)
  orderNumber: {
    type: String,
    unique: true,
    sparse: true, // Allow null for legacy orders
    uppercase: true,
    trim: true,
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(doc, ret) {
      if (!ret.orderNumber && ret._id) {
        ret.orderNumber = deriveOrderNumberFromId(ret._id);
      }
      return ret;
    },
  },
  toObject: { virtuals: true },
});

// Ensure orderNumber in API responses (for legacy orders without it). Never overwrite stored.
function ensureOrderNumber(doc) {
  if (!doc || !doc._id) return doc;
  const hasStored = doc.orderNumber && String(doc.orderNumber).trim().length > 0;
  if (!hasStored) {
    doc.orderNumber = deriveOrderNumberFromId(doc._id);
  }
  return doc;
}

orderSchema.post(['find', 'findOne'], function(result) {
  if (Array.isArray(result)) {
    result.forEach(ensureOrderNumber);
  } else {
    ensureOrderNumber(result);
  }
});

// Generate sequential orderNumber for new orders: AAA111 -> AAA112 -> ... -> AAA999 -> AAB111
orderSchema.pre('save', async function() {
  if (this.isNew && !this.orderNumber) {
    this.orderNumber = await getNextOrderNumber();
  }
});

/**
 * Handover codes, minted with the order.
 *
 * Four digits: this is read aloud across a counter and typed on a phone, and
 * the window to use it is minutes long against one specific order, so length
 * buys far less here than legibility does. crypto.randomInt is used rather
 * than Math.random because these authorise a handover.
 */
orderSchema.pre('save', function (next) {
  if (this.isNew) {
    const code = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');
    if (!this.pickupVerification?.code) {
      this.pickupVerification = { ...(this.pickupVerification || {}), code: code(), attempts: 0 };
    }
    if (!this.deliveryVerification?.code) {
      this.deliveryVerification = { ...(this.deliveryVerification || {}), code: code(), attempts: 0 };
    }
  }
  next();
});

// Auto-create initial timeline entry when order is created
orderSchema.pre('save', function(next) {
  if (this.isNew && this.timeline.length === 0) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      message: `Order ${this.status}`,
    });
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);

export default Order;
