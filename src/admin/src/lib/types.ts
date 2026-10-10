/**
 * Shapes returned by the backend. Populated refs come back either as an id
 * string or as the embedded document, so refs are modelled as `Ref<T>`.
 */

export type Ref<T> = string | T | null | undefined;

/** Narrows a possibly-populated reference to the document, or null. */
export function refDoc<T extends object>(ref: Ref<T>): T | null {
  return ref && typeof ref === "object" ? (ref as T) : null;
}

export function refId<T extends { _id?: string }>(ref: Ref<T>): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return ref._id ?? null;
}

export interface Timestamped {
  createdAt?: string;
  updatedAt?: string;
}

/* ── People ─────────────────────────────────────────────────────────────── */

export interface Customer extends Timestamped {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  profilePhoto?: string;
  role?: string;
  isBlocked?: boolean;
  isProfileComplete?: boolean;
  /** Undefined on accounts that predate verification; only false means unverified. */
  accountVerified?: boolean;
  /** Whether this customer may pay cash on delivery. Off unless an admin allows it. */
  codEnabled?: boolean;
  /** Reditoe Plus, which waives the delivery fee. Null when they hold none. */
  membership?: {
    active: boolean;
    plan?: string;
    planLabel?: string;
    validTill?: string;
    grantedByAdmin?: boolean;
  } | null;
  /** Named savedAddresses on the user document, which is what the API returns. */
  savedAddresses?: Array<{
    label?: string;
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }>;
  /** Aggregated by the list endpoint. */
  totalOrders?: number;
  totalSpent?: number;
  walletBalance?: number;

  /*
   * Worked out by the detail endpoint from this customer's own orders,
   * reviews and wallet. The page used to make these up - a fixed 4.7 rating,
   * a "Gold" tier, savings guessed at 14% of spend, and a wallet that had
   * always added 1000 and spent 750 whoever was being looked at.
   */
  stats?: {
    totalOrders: number;
    totalSpent: number;
    totalSavings: number;
    lastOrderAt: string | null;
    /** Null when they have never rated anything - shown as a dash. */
    averageRating: number | null;
    ratingCount: number;
  };
  wallet?: {
    balance: number;
    totalAdded: number;
    totalSpent: number;
    isFrozen: boolean;
    lastTransactionAt: string | null;
    /** Money an admin is withholding. Part of the balance, not spendable. */
    heldAmount?: number;
    spendable?: number;
  };
  /** Every admin change to this wallet, newest first. */
  walletActivity?: {
    id: string;
    action: "add" | "remove" | "hold" | "unhold";
    type: "credit" | "debit";
    amount: number;
    comment: string;
    balanceBefore?: number;
    balanceAfter?: number;
    by: string | null;
    at: string;
  }[];
  /**
   * What this customer has actually paid with before. Razorpay holds card
   * details, not this platform, so there is no saved-card vault to read.
   */
  paymentMethods?: Array<{
    method: string;
    timesUsed: number;
    lastUsedAt: string;
  }>;
}

export interface Rider extends Timestamped {
  _id: string;
  /**
   * How far through signing up they are.
   *
   * "onboarding_pending" also covers people with no account yet - somebody
   * who verified their contact details and stopped - so `hasAccount` says
   * whether there is anything to open.
   */
  onboardingStatus?: "onboarding_pending" | "onboarded";
  hasAccount?: boolean;
  name?: string;
  riderId?: string;
  email?: string;
  phone?: string;
  image?: string;
  status?: string;
  isBlocked?: boolean;
  kycStatus?: string;
  rating?: number;
  currentRating?: number;
  vehicleType?: string;
  vehicleName?: string;
  vehicleNumber?: string;
  totalDeliveries?: number;
  completedDeliveries?: number;
  cancelledDeliveries?: number;
  totalEarnings?: number;
  successRate?: number;
  isOnline?: boolean;
  perKmCharge?: number;
  /** GeoJSON, so coordinates are [longitude, latitude] — not the other way. */
  currentLocation?: { type?: string; coordinates?: [number, number] } | null;
  /** Set while the rider is carrying an order; this is what colours the pin. */
  currentOrderId?: string | null;
  /** Where they work, for filtering the live map. */
  city?: string | null;
  state?: string | null;

  /* The rest of the profile. All of it was already stored and returned; the
   * partner page simply never showed any of it, so an admin opening a rider
   * saw a name, a vehicle and a delivery count and nothing else. */
  dateOfBirth?: string | null;
  idType?: string | null;
  aadhaarVerified?: boolean;
  insuranceNumber?: string | null;
  emergencyContactName?: string | null;
  emergencyRelationship?: string | null;
  emergencyContactPhone?: string | null;
  address?: {
    fullAddress?: string;
    pincode?: string;
    landmark?: string;
    city?: string;
    state?: string;
  } | null;
  bankDetails?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifsc?: string;
    bankName?: string;
    branch?: string;
  } | null;
  /** Each value is the stored file's URL, or null when not uploaded. */
  kycDocuments?: Record<string, string | null> | null;

  /** False while the contact details staff typed are still unconfirmed. */
  accountVerified?: boolean;
  /** Present only on accounts an admin created. Never carries the codes. */
  contactVerification?: {
    pending: boolean;
    emailVerified: boolean;
    phoneVerified: boolean;
    expiresAt: string | null;
  } | null;
}

/* ── Businesses ─────────────────────────────────────────────────────────── */

/** One statutory document on a restaurant's file. */
export interface RestaurantDocument {
  url?: string;
  /** Licence or registration number, where the admin recorded one. */
  number?: string;
  uploadedAt?: string;
  expiryDate?: string;
  status?: "pending" | "verified" | "rejected";
  /** The admin who approved or rejected it, by name. */
  verifiedBy?: string;
  verifiedAt?: string;
  /** Why it was rejected, or any note left against it. */
  note?: string;
}

export interface Restaurant extends Timestamped {
  /**
   * The account this vendor is paid into. It is on the restaurant record and
   * always has been; the detail page used to claim otherwise and send staff
   * to Finance to look for it.
   */
  bankDetails?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifsc?: string;
    bankName?: string;
    branchName?: string;
  } | null;
  /** Present only while staff still have to confirm the vendor's contact details. */
  contactVerification?: {
    pending: boolean;
    emailVerified: boolean;
    phoneVerified: boolean;
    expiresAt: string | null;
  } | null;
  _id: string;
  name?: string;
  image?: string;
  rating?: number;
  deliveryTime?: string;
  deliveryFee?: number;
  categories?: string[];
  description?: string;
  phone?: string;
  status?: string;
  kycStatus?: string;
  /**
   * Per-document flags, not a status string — { fssaiVerified, gstVerified,
   * bankVerified }. Declaring it as a string is what let the documents screen
   * pass an object to a badge and crash on .toLowerCase().
   *
   * Kept for the screens that read it; `documentRecords` below is the fuller
   * record and what Documents itself uses.
   */
  documentVerificationStatus?: Record<string, boolean>;
  /**
   * The compliance file, keyed by document — fssai, pan, gst, bank, aadhaar,
   * shop, fire, health. This is what the Documents screen reads; the two
   * fields above are the older, narrower views of the same thing.
   */
  documentRecords?: Record<string, RestaurantDocument>;
  /** Why the last application decision went the way it did. */
  statusReason?: string;
  statusChangedAt?: string;
  submittedAt?: string;
  /** Every decision on the application, oldest first. */
  approvalHistory?: {
    status?: string;
    reason?: string;
    by?: string;
    at?: string;
  }[];
  commissionPercent?: number;
  /**
   * How far this restaurant will deliver, in kilometres.
   *
   * Vendor-specific and decisive: a customer outside it cannot order from
   * this restaurant, however close they are to another one.
   */
  deliveryRadius?: number;
  isApproved?: boolean;
  isActive?: boolean;
  isOpen?: boolean;
  isEnabled?: boolean;
  isFeatured?: boolean;
  foodType?: string;
  owner?: Ref<Customer>;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    /** The centre of the delivery radius. Without it nobody can order. */
    coordinates?: { latitude?: number; longitude?: number };
  };
  /** Aggregated by the list endpoint. */
  totalOrders?: number;
  totalRevenue?: number;
}

export interface MenuItem extends Timestamped {
  _id: string;
  name?: string;
  description?: string;
  image?: string;
  price?: number;
  originalPrice?: number;
  category?: string;
  cuisine?: string;
  isVeg?: boolean;
  isAvailable?: boolean;
  isActive?: boolean;
  rating?: number;
  restaurantId?: Ref<Restaurant>;
}

/* ── Orders ─────────────────────────────────────────────────────────────── */

export type OrderStatus =
  | "Pending"
  | "Payment Pending"
  | "Waiting for Confirmation"
  | "Order Confirmed"
  | "In Progress"
  | "Processing"
  | "Ready"
  | "OnWay"
  | "Delivered"
  | "Cancelled"
  | "RiderRejected";

export interface OrderItem {
  _id?: string;
  foodItemId?: Ref<MenuItem>;
  name?: string;
  quantity?: number;
  price?: number;
  selectedAddons?: Array<{ name?: string; price?: number }>;
}

export interface Order extends Timestamped {
  _id: string;
  /**
   * The reference every app shows - "AAA-116". The API guarantees one: it
   * derives a deterministic value from the id for older orders that lack a
   * stored number, so this is never absent and screens must not invent a
   * fallback. Each one that did produced a different string for the same
   * order.
   */
  orderNumber: string;
  userId?: Ref<Customer>;
  restaurantId?: Ref<Restaurant>;
  riderId?: Ref<Rider>;
  items?: OrderItem[];
  subtotal?: number;
  tax?: number;
  gstAndPackaging?: number;
  platformFee?: number;
  deliveryFee?: number;
  packagingFee?: number;
  walletUsed?: number;
  tip?: number;
  discount?: number;
  couponCode?: string;
  total?: number;
  status?: OrderStatus | string;
  paymentMethod?: string;
  paymentStatus?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  deliveryAddress?: {
    label?: string;
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  notes?: string;
  adminNotes?: string;
  disputeStatus?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  timeline?: Array<{
    status?: string;
    timestamp?: string;
    message?: string;
  }>;
  refundInfo?: {
    status?: string;
    amount?: number;
    reason?: string;
    refundedAt?: string;
  };
}

/* ── Money ──────────────────────────────────────────────────────────────── */

export interface Payout extends Timestamped {
  _id: string;
  payoutId?: string;
  amount?: number;
  netAmount?: number;
  status?: string;
  method?: string;
  reference?: string;
  periodStart?: string;
  periodEnd?: string;
  restaurantId?: Ref<Restaurant>;
  riderId?: Ref<Rider>;
}

export interface Transaction extends Timestamped {
  _id: string;
  transactionId?: string;
  type?: string;
  amount?: number;
  status?: string;
  method?: string;
  orderId?: Ref<Order>;
  userId?: Ref<Customer>;
  description?: string;
}

export interface Invoice extends Timestamped {
  _id: string;
  invoiceNumber?: string;
  amount?: number;
  totalAmount?: number;
  status?: string;
  dueDate?: string;
  issuedDate?: string;
  restaurantId?: Ref<Restaurant>;
  orderId?: Ref<Order>;
}

export interface Refund extends Timestamped {
  _id: string;
  refundId?: string;
  amount?: number;
  status?: string;
  reason?: string;
  method?: string;
  orderId?: Ref<Order>;
  userId?: Ref<Customer>;
  processedAt?: string;
  processingDetails?: {
    /** The bank's reference for the money moving — Razorpay's ARN. */
    bankRRN?: string;
    transactionId?: string;
  };
}

/* ── Marketing ──────────────────────────────────────────────────────────── */

export interface Coupon extends Timestamped {
  _id: string;
  code?: string;
  title?: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  minOrderValue?: number;
  usageLimit?: number;
  usedCount?: number;
  validFrom?: string;
  validTill?: string;
  isActive?: boolean;
  status?: string;
  applicableFor?: string;
}

/**
 * As the API stores it. Budget, metrics and dates are nested rather than flat,
 * and status comes back upper-case — reading them as plain numbers rendered
 * every budget as NaN and left the status tiles counting zero while the table
 * beside them listed the campaigns.
 */
export interface Campaign extends Timestamped {
  _id: string;
  name?: string;
  description?: string;
  /** Delivery channel. `campaignType` is the stored name; `type` mirrors it. */
  type?: string;
  campaignType?: string;
  /** DRAFT | SCHEDULED | ACTIVE | PAUSED | COMPLETED | CANCELLED */
  status?: string;
  budget?: { total?: number; spent?: number; costPerSend?: number };
  content?: { title?: string; message?: string; actionText?: string };
  targeting?: { userRoles?: string[]; cities?: string[] };
  schedule?: { type?: string; scheduledAt?: string; timezone?: string };
  metrics?: {
    targetCount?: number;
    sentCount?: number;
    deliveredCount?: number;
    openCount?: number;
    clickCount?: number;
    conversionCount?: number;
    revenueGenerated?: number;
  };
  activatedAt?: string;
  completedAt?: string;
}

export interface Banner extends Timestamped {
  _id: string;
  title?: string;
  image?: string;
  link?: string;
  position?: string;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
  /* The model's own names. `image` and `link` above are what the table
     reads; these are what the API stores and the apps display. */
  description?: string;
  bannerType?: "image" | "carousel" | "video";
  mediaUrl?: string;
  mediaType?: "image" | "video";
  altText?: string;
  displayOrder?: number;
  actionUrl?: string;
}

/* ── Feedback & support ─────────────────────────────────────────────────── */

export interface Review extends Timestamped {
  _id: string;
  rating?: number;
  comment?: string;
  reply?: string;
  isVisible?: boolean;
  userId?: Ref<Customer>;
  restaurantId?: Ref<Restaurant>;
  riderId?: Ref<Rider>;
  orderId?: Ref<Order>;
}

export interface SupportTicket extends Timestamped {
  /** The reference shown in the apps, e.g. CHT-NYQJQ78TY. */
  ticketNumber?: string;
  _id: string;
  ticketId?: string;
  subject?: string;
  description?: string;
  category?: string;
  priority?: string;
  status?: string;
  raisedBy?: string;
  userId?: Ref<Customer>;
  restaurantId?: Ref<Restaurant>;
  assignedTo?: Ref<Customer>;
}

export interface Dispute extends Timestamped {
  _id: string;
  disputeId?: string;
  reason?: string;
  status?: string;
  amount?: number;
  resolution?: string;
  orderId?: Ref<Order>;
  raisedBy?: string;
}

/* ── System ─────────────────────────────────────────────────────────────── */

export interface Role extends Timestamped {
  _id: string;
  /** The code identifier, e.g. `refund_team`. */
  name?: string;
  /** What the team is called in the console, e.g. "Refund team". */
  displayName?: string;
  description?: string;
  permissions?: string[];
  isSystem?: boolean;
  userCount?: number;
  /** Lower numbers outrank higher ones. */
  level?: number;
}

export interface ActivityLog extends Timestamped {
  _id: string;
  action?: string;
  module?: string;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  userId?: Ref<Customer>;
  metadata?: Record<string, unknown>;
}

export interface NotificationRecord extends Timestamped {
  _id: string;
  title?: string;
  message?: string;
  type?: string;
  audience?: string;
  status?: string;
  sentAt?: string;
  readCount?: number;
  sentCount?: number;
}

export interface AdminTask extends Timestamped {
  _id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  module?: string;
  assignedTo?: Ref<Customer>;
  createdBy?: Ref<Customer>;
}

/** Shared shape for the small taxonomy lists (categories, cuisines). */
export interface Taxonomy extends Timestamped {
  _id: string;
  name?: string;
  slug?: string;
  description?: string;
  image?: string;
  icon?: string;
  isActive?: boolean;
  sortOrder?: number;
  /** How many restaurants or items sit under it. */
  count?: number;
  itemCount?: number;
  restaurantCount?: number;
}

export interface CustomerGroup extends Timestamped {
  _id: string;
  name?: string;
  description?: string;
  customerCount?: number;
  isActive?: boolean;
  isDefault?: boolean;
  criteria?: string;
}

export interface ReferralRecord extends Timestamped {
  _id: string;
  code?: string;
  status?: string;
  rewardAmount?: number;
  referrer?: Ref<Customer>;
  referee?: Ref<Customer>;
  completedAt?: string;
}

export interface WalletRecord extends Timestamped {
  _id: string;
  balance?: number;
  totalCredited?: number;
  totalDebited?: number;
  ownerType?: string;
  isActive?: boolean;
  userId?: Ref<Customer>;
  restaurantId?: Ref<Restaurant>;
  riderId?: Ref<Rider>;
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

export interface DashboardAnalytics {
  totalOrders?: number;
  /** Restaurants overall. Named for the card it originally fed. */
  activeVendors?: number;
  totalRevenue?: number;
  newRegistrations?: number;
  cancelledOrders?: number;
  averageOrderValue?: number;
  totalRestaurants?: number;
  activeRestaurants?: number;
  newRestaurants?: number;
  totalRiders?: number;
  /** Riders able to take work: cleared KYC and not blocked. */
  activeRiders?: number;
  newRiders?: number;
  /** Null when nothing has been rated — distinct from an average of zero. */
  averageRating?: number | null;
  ratedRestaurants?: number;
  /** Vendor share of settled transactions, refunds excluded. */
  totalPayouts?: number;
  payoutsThisWeek?: number;
}

export interface RevenueTrend {
  categories?: string[];
  revenue?: number[];
  orders?: number[];
}
