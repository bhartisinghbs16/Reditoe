/**
 * Development fixtures.
 *
 * Opt-in via `NEXT_PUBLIC_MOCK=1`. Lets the console be run, reviewed and demoed
 * without a database behind it. Never active unless the flag is set, and the
 * whole module is tree-shaken out of a normal build.
 *
 * Data is generated from a fixed seed so screenshots and demos are stable.
 */

import type { QueryValue } from "@/lib/api";

export const MOCK_ENABLED = process.env.NEXT_PUBLIC_MOCK === "1";

/* ── Deterministic randomness ───────────────────────────────────────────── */

/** mulberry32 — small, fast, and stable across runs for a given seed. */
function makeRandom(seed: number) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260801);

const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const intBetween = (min: number, max: number) =>
  Math.floor(random() * (max - min + 1)) + min;
const chance = (probability: number) => random() < probability;

/**
 * Anchored to the real clock so "12 hours ago" actually reads as the past.
 * Rounded down to the hour to keep a session's screenshots consistent.
 */
const NOW = Math.floor(Date.now() / 3_600_000) * 3_600_000;
const DAY = 86_400_000;

const daysAgo = (days: number, jitterHours = 12) =>
  // Always at least a minute in the past — a "placed 3 hours from now" order
  // reads as a bug, not as fixture noise.
  new Date(
    NOW - days * DAY - intBetween(0, jitterHours) * 3_600_000 - 60_000
  ).toISOString();

const id = (prefix: string, index: number) =>
  `${prefix}${String(index).padStart(6, "0")}${"0".repeat(10)}`.slice(0, 24);

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

const FIRST_NAMES = [
  "Ananya", "Rahul", "Priya", "Vikram", "Meera", "Arjun", "Kavya", "Rohan",
  "Divya", "Karthik", "Sneha", "Aditya", "Nisha", "Suresh", "Pooja", "Manav",
  "Lakshmi", "Farhan", "Ritu", "Imran", "Tara", "Nikhil", "Zoya", "Harsh",
];

const LAST_NAMES = [
  "Sharma", "Iyer", "Reddy", "Nair", "Menon", "Patel", "Gupta", "Rao",
  "Verma", "Khan", "Joshi", "Desai", "Banerjee", "Pillai", "Chauhan", "Bose",
];

const RESTAURANT_NAMES = [
  "Corner Kitchen", "Saffron House", "The Curry Room", "Bombay Social",
  "Green Bowl", "Tandoor Lane", "Noodle Theory", "Coastal Catch",
  "Pizza Republic", "Dosa District", "Wok & Roll", "The Biryani Co.",
  "Sourdough & Co.", "Chaat Street", "Grill Nation", "Butter Chicken Club",
  "Poke House", "Sweet Corner", "Filter Coffee Works", "Momo Factory",
];

const CITIES = [
  { city: "Bengaluru", state: "Karnataka" },
  { city: "Chennai", state: "Tamil Nadu" },
  { city: "Hyderabad", state: "Telangana" },
  { city: "Mumbai", state: "Maharashtra" },
  { city: "Pune", state: "Maharashtra" },
  { city: "Kochi", state: "Kerala" },
];

const CUISINES = [
  "North Indian", "South Indian", "Chinese", "Italian", "Continental",
  "Thai", "Bakery", "Desserts", "Beverages", "Street Food",
];

const DISHES = [
  "Paneer Butter Masala", "Chicken Biryani", "Masala Dosa", "Veg Hakka Noodles",
  "Margherita Pizza", "Butter Naan", "Gulab Jamun", "Filter Coffee",
  "Chicken Tikka", "Pad Thai", "Fish Curry", "Chole Bhature",
  "Mushroom Risotto", "Cold Coffee", "Rasmalai", "Veg Fried Rice",
];

const VEHICLES = [
  { type: "bike", name: "Hero Splendor Plus" },
  { type: "scooter", name: "Honda Activa 6G" },
  { type: "scooter", name: "TVS Jupiter" },
  { type: "bike", name: "Bajaj Pulsar 150" },
  { type: "bicycle", name: "Hercules Roadeo" },
];

const ORDER_STATUSES = [
  "Waiting for Confirmation", "Order Confirmed", "Processing", "Ready",
  "OnWay", "Delivered", "Delivered", "Delivered", "Delivered", "Cancelled",
] as const;

const ACTIVE_STATUSES = [
  "Waiting for Confirmation", "Order Confirmed", "Processing", "Ready", "OnWay",
] as const;

const PAYMENT_METHODS = ["Online", "UPI", "Card", "COD", "Wallet"] as const;

/* ── Entities ───────────────────────────────────────────────────────────── */

function fullName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

const customers = Array.from({ length: 120 }, (_, index) => {
  const name = fullName();
  const slug = name.toLowerCase().replace(/\s+/g, ".");
  const orders = intBetween(0, 48);
  const place = pick(CITIES);
  return {
    _id: id("c", index),
    name,
    email: `${slug}@example.com`,
    phone: `9${intBetween(100000000, 999999999)}`,
    role: "user",
    isBlocked: chance(0.06),
    isProfileComplete: chance(0.78),
    totalOrders: orders,
    totalSpent: orders * intBetween(180, 720),
    walletBalance: chance(0.4) ? intBetween(0, 2500) : 0,
    addresses: [
      {
        label: "Home",
        street: `${intBetween(1, 90)}, ${pick(["Lake View", "MG Road", "Church Street", "Palm Grove"])}`,
        city: place.city,
        state: place.state,
        zipCode: String(intBetween(500001, 690001)),
      },
    ],
    createdAt: daysAgo(intBetween(5, 700)),
  };
});

const restaurants = RESTAURANT_NAMES.flatMap((baseName, nameIndex) =>
  Array.from({ length: 3 }, (_, copy) => {
    const index = nameIndex * 3 + copy;
    const place = pick(CITIES);
    const orders = intBetween(0, 1400);
    const approved = chance(0.82);
    return {
      _id: id("r", index),
      name: copy === 0 ? baseName : `${baseName} ${copy === 1 ? "II" : "III"} — ${place.city}`,
      rating: chance(0.9) ? Number((3.4 + random() * 1.6).toFixed(1)) : undefined,
      deliveryTime: `${intBetween(20, 40)}–${intBetween(41, 60)} mins`,
      deliveryFee: pick([0, 20, 30, 40, 50]),
      categories: [pick(CUISINES), pick(CUISINES)],
      description:
        "Neighbourhood favourite serving generous portions, cooked to order.",
      phone: `8${intBetween(100000000, 999999999)}`,
      status: approved ? (chance(0.9) ? "active" : "inactive") : "pending",
      kycStatus: approved ? (chance(0.85) ? "approved" : "pending") : "pending",
      documentVerificationStatus: approved ? "verified" : "pending",
      commissionPercent: pick([12, 15, 18, 20, 22]),
      isApproved: approved,
      isActive: approved,
      isOpen: approved && chance(0.7),
      isEnabled: approved,
      isFeatured: chance(0.15),
      foodType: pick(["veg", "nonveg", "both"]),
      address: {
        street: `${intBetween(1, 120)}, ${pick(["Indiranagar", "T. Nagar", "Banjara Hills", "Bandra West", "Koregaon Park"])}`,
        city: place.city,
        state: place.state,
        zipCode: String(intBetween(400001, 690001)),
      },
      owner: {
        _id: id("o", index),
        name: fullName(),
        email: `owner${index}@example.com`,
        phone: `7${intBetween(100000000, 999999999)}`,
      },
      totalOrders: orders,
      totalRevenue: orders * intBetween(220, 640),
      createdAt: daysAgo(intBetween(20, 800)),
    };
  })
);

const riders = Array.from({ length: 64 }, (_, index) => {
  const vehicle = pick(VEHICLES);
  const total = intBetween(0, 2100);
  const cancelled = Math.floor(total * (random() * 0.08));
  const blocked = chance(0.05);
  return {
    _id: id("d", index),
    name: fullName(),
    riderId: `DP${String(1000 + index)}`,
    email: `rider${index}@example.com`,
    phone: `9${intBetween(100000000, 999999999)}`,
    status: blocked ? "blocked" : pick(["active", "active", "active", "busy", "inactive"]),
    isBlocked: blocked,
    kycStatus: chance(0.8) ? "approved" : chance(0.5) ? "pending" : "rejected",
    currentRating: Number((3.5 + random() * 1.5).toFixed(1)),
    vehicleType: vehicle.type,
    vehicleName: vehicle.name,
    vehicleNumber: `${pick(["KA", "TN", "TS", "MH", "KL"])}-${intBetween(10, 99)}-${pick(["AB", "HX", "JK", "CP"])}-${intBetween(1000, 9999)}`,
    totalDeliveries: total,
    completedDeliveries: total - cancelled,
    cancelledDeliveries: cancelled,
    totalEarnings: total * intBetween(38, 72),
    successRate: total > 0 ? Number((((total - cancelled) / total) * 100).toFixed(1)) : 0,
    isOnline: !blocked && chance(0.55),
    perKmCharge: pick([8, 10, 12]),
    createdAt: daysAgo(intBetween(10, 620)),
  };
});

const menuItems = Array.from({ length: 180 }, (_, index) => {
  const restaurant = pick(restaurants);
  const price = intBetween(60, 480);
  const discounted = chance(0.45);
  return {
    _id: id("m", index),
    name: pick(DISHES),
    description: "House recipe, prepared fresh after you order.",
    price,
    originalPrice: discounted ? Math.round(price * (1.1 + random() * 0.3)) : undefined,
    category: pick(["Starters", "Main Course", "Breads", "Desserts", "Beverages", "Combos"]),
    cuisine: pick(CUISINES),
    isVeg: chance(0.55),
    isAvailable: chance(0.86),
    isActive: true,
    rating: Number((3.6 + random() * 1.4).toFixed(1)),
    restaurantId: { _id: restaurant._id, name: restaurant.name },
    createdAt: daysAgo(intBetween(1, 400)),
  };
});

const orders = Array.from({ length: 260 }, (_, index) => {
  const customer = pick(customers);
  const restaurant = pick(restaurants);
  const status = pick(ORDER_STATUSES);
  const rider =
    status === "Waiting for Confirmation" || status === "Order Confirmed"
      ? chance(0.4)
        ? pick(riders)
        : null
      : status === "Cancelled"
        ? null
        : pick(riders);

  const itemCount = intBetween(1, 4);
  const items = Array.from({ length: itemCount }, (_, itemIndex) => {
    const price = intBetween(70, 420);
    return {
      _id: id("i", index * 10 + itemIndex),
      name: pick(DISHES),
      quantity: intBetween(1, 3),
      price,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0);
  const deliveryFee = pick([0, 25, 35, 45]);
  const packagingFee = intBetween(10, 30);
  const platformFee = Math.round(subtotal * 0.04);
  const tax = Math.round(subtotal * 0.05);
  const discount = chance(0.3) ? intBetween(20, 120) : 0;
  const total = subtotal + deliveryFee + packagingFee + platformFee + tax - discount;
  const placed = index < 14 ? intBetween(0, 1) : intBetween(0, 45);
  // One timestamp for the order, with the timeline stepping forward from it —
  // otherwise every stage shares a minute and the header disagrees with the
  // first timeline row.
  const placedAt = new Date(daysAgo(placed)).getTime();
  const stage = (minutes: number) => new Date(placedAt + minutes * 60_000).toISOString();

  return {
    _id: id("t", index),
    orderNumber: `#OD${String(94210 - index)}`,
    userId: {
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    },
    restaurantId: {
      _id: restaurant._id,
      name: restaurant.name,
      address: restaurant.address,
      image: undefined,
      commissionPercent: restaurant.commissionPercent,
      phone: restaurant.phone,
    },
    riderId: rider
      ? {
          _id: rider._id,
          name: rider.name,
          phone: rider.phone,
          vehicleType: rider.vehicleType,
          vehicleNumber: rider.vehicleNumber,
          currentRating: rider.currentRating,
          totalDeliveries: rider.totalDeliveries,
        }
      : undefined,
    items,
    subtotal,
    deliveryFee,
    packagingFee,
    platformFee,
    tax,
    discount,
    couponCode: discount ? pick(["FIRST120", "WEEKEND50", "SAVE20"]) : undefined,
    total,
    status,
    paymentMethod: pick(PAYMENT_METHODS),
    paymentStatus: status === "Cancelled" ? "Refunded" : chance(0.94) ? "Paid" : "Pending",
    razorpayPaymentId: `pay_${Math.floor(random() * 1e12).toString(36).toUpperCase()}`,
    deliveryAddress: customer.addresses[0],
    adminNotes: "",
    timeline: [
      { status: "Pending", timestamp: stage(0), message: "Order placed" },
      ...(status !== "Waiting for Confirmation"
        ? [{ status: "Order Confirmed", timestamp: stage(2), message: "Restaurant accepted" }]
        : []),
      ...(["Ready", "OnWay", "Delivered"].includes(status)
        ? [{ status: "Ready", timestamp: stage(16), message: "Ready for pickup" }]
        : []),
      ...(["OnWay", "Delivered"].includes(status)
        ? [{ status: "OnWay", timestamp: stage(21), message: "Picked up" }]
        : []),
      ...(status === "Delivered"
        ? [{ status: "Delivered", timestamp: stage(38), message: "Delivered" }]
        : []),
      ...(status === "Cancelled"
        ? [{ status: "Cancelled", timestamp: stage(6), message: "Cancelled by customer" }]
        : []),
    ],
    createdAt: new Date(placedAt).toISOString(),
    updatedAt: stage(status === "Delivered" ? 38 : 6),
  };
});

/**
 * In-flight orders are, by definition, recent — so these get fresh timestamps
 * rather than inheriting the wide spread used for the full order history.
 */
const liveOrders = orders
  .filter((order) => (ACTIVE_STATUSES as readonly string[]).includes(order.status))
  .slice(0, 22)
  .map((order, index) => {
    const placedAt = new Date(NOW - (4 + index * 3) * 60_000).toISOString();
    return { ...order, createdAt: placedAt, updatedAt: placedAt };
  });

const coupons = [
  ["FIRST120", "First order offer", "flat", 120, 299, 50000, 31240],
  ["WEEKEND50", "Weekend special", "percentage", 20, 249, 30000, 18620],
  ["SAVE20", "Flat ₹20 off", "flat", 20, 149, 40000, 22410],
  ["NEWUSER99", "New user welcome", "flat", 99, 199, 20000, 19980],
  ["BIRYANI15", "Biryani week", "percentage", 15, 349, 15000, 4210],
  ["LATENIGHT", "Late night cravings", "percentage", 25, 399, 10000, 1180],
  ["FESTIVE30", "Festive treat", "percentage", 30, 499, 25000, 25000],
  ["CORP200", "Corporate lunch", "flat", 200, 899, 5000, 640],
].map(([code, title, discountType, discountValue, minOrderValue, usageLimit, usedCount], index) => {
  const startOffset = index * 9 - 30;
  // Redemptions only accrue once an offer has actually started.
  const elapsedFraction = Math.max(0, Math.min(1, -startOffset / 45));
  const redeemed = Math.round((usedCount as number) * elapsedFraction);
  return {
    _id: id("p", index),
    code: code as string,
    title: title as string,
    description: "Auto-applied at checkout when the cart qualifies.",
    discountType: discountType as string,
    discountValue: discountValue as number,
    maxDiscount: discountType === "percentage" ? 150 : undefined,
    minOrderValue: minOrderValue as number,
    usageLimit: usageLimit as number,
    usedCount: redeemed,
    validFrom: new Date(NOW + startOffset * DAY).toISOString(),
    validTill: new Date(NOW + (startOffset + 45) * DAY).toISOString(),
    isActive: true,
    applicableFor: pick(["All users", "New users", "Returning users"]),
    createdAt: daysAgo(60 - index * 5),
  };
});

const campaigns = [
  ["Monsoon comfort food", "awareness", "New users", "active"],
  ["Win back lapsed diners", "retention", "Returning users", "active"],
  ["Weekend biryani push", "discount", "All users", "completed"],
  ["Corporate lunch pilot", "acquisition", "Corporate", "scheduled"],
  ["Late-night dessert run", "discount", "All users", "paused"],
  ["Festive fortnight", "awareness", "All users", "completed"],
].map(([name, type, objective, status], index) => {
  const budget = intBetween(20000, 180000);
  const impressions = intBetween(40000, 460000);
  const clicks = Math.round(impressions * (0.02 + random() * 0.06));
  return {
    _id: id("g", index),
    name: name as string,
    type: type as string,
    objective: objective as string,
    status: status as string,
    budget,
    spent: status === "completed" ? budget : Math.round(budget * random()),
    startDate: daysAgo(60 - index * 8),
    endDate: new Date(NOW + (20 - index * 6) * DAY).toISOString(),
    impressions,
    clicks,
    conversions: Math.round(clicks * (0.08 + random() * 0.2)),
    createdAt: daysAgo(70 - index * 8),
  };
});

const banners = [
  ["Monsoon menu is live", "home_top"],
  ["Flat ₹120 off your first order", "home_top"],
  ["Biryani week", "home_middle"],
  ["Free delivery over ₹499", "checkout"],
  ["Desserts under ₹99", "category"],
  ["Corporate lunch plans", "home_middle"],
].map(([title, position], index) => ({
  _id: id("b", index),
  title: title as string,
  link: "/offers",
  position: position as string,
  isActive: index < 4,
  startDate: daysAgo(30 - index * 4),
  endDate: new Date(NOW + (30 - index * 3) * DAY).toISOString(),
  createdAt: daysAgo(40 - index * 4),
}));

const reviews = Array.from({ length: 90 }, (_, index) => {
  const rating = pick([5, 5, 5, 4, 4, 4, 3, 2, 1]);
  const customer = pick(customers);
  const restaurant = pick(restaurants);
  return {
    _id: id("v", index),
    rating,
    comment:
      rating >= 4
        ? pick([
            "Food arrived hot and on time. Portions were generous.",
            "Consistently good. The biryani is the reason I keep ordering.",
            "Packaging was neat, nothing spilled. Will order again.",
          ])
        : rating === 3
          ? "Food was fine but the delivery took longer than the estimate."
          : pick([
              "Order arrived cold and the drink was missing.",
              "Wrong item delivered. Had to call support twice.",
            ]),
    reply: chance(0.35) ? "Thanks for the feedback — we're on it." : undefined,
    isVisible: chance(0.94),
    userId: { _id: customer._id, name: customer.name, email: customer.email },
    restaurantId: { _id: restaurant._id, name: restaurant.name },
    createdAt: daysAgo(intBetween(0, 120)),
  };
});

const tickets = Array.from({ length: 46 }, (_, index) => {
  const customer = pick(customers);
  return {
    _id: id("s", index),
    ticketId: `TK-${4100 + index}`,
    subject: pick([
      "Refund not received for cancelled order",
      "Delivery partner marked delivered but nothing arrived",
      "Wrong items in my order",
      "Coupon code not applying at checkout",
      "Restaurant is closed but accepting orders",
      "Wallet balance deducted twice",
    ]),
    description: "Customer raised this from the app; awaiting first response.",
    category: pick(["refund", "delivery", "payment", "account", "restaurant"]),
    priority: pick(["low", "medium", "medium", "high", "urgent"]),
    status: pick(["open", "open", "in_progress", "resolved", "closed"]),
    raisedBy: "customer",
    userId: { _id: customer._id, name: customer.name, email: customer.email },
    createdAt: daysAgo(intBetween(0, 30)),
    updatedAt: daysAgo(intBetween(0, 6)),
  };
});

const disputes = Array.from({ length: 18 }, (_, index) => {
  const order = pick(orders);
  return {
    _id: id("q", index),
    disputeId: `DS-${2200 + index}`,
    reason: pick(["item_missing", "quality_issue", "never_delivered", "overcharged"]),
    status: pick(["open", "under_review", "escalated", "resolved", "closed"]),
    amount: order.total,
    resolution: chance(0.5) ? "Refunded to source; vendor debited." : undefined,
    orderId: { _id: order._id, orderNumber: order.orderNumber },
    raisedBy: pick(["customer", "vendor", "rider"]),
    createdAt: daysAgo(intBetween(0, 40)),
  };
});

const tasks = Array.from({ length: 24 }, (_, index) => ({
  _id: id("k", index),
  title: pick([
    "Verify KYC backlog for Bengaluru vendors",
    "Chase settlement mismatch for July cycle",
    "Review riders below 4.0 rating",
    "Audit coupon FESTIVE30 redemptions",
    "Onboard 5 new restaurants in Kochi",
    "Reconcile failed payouts from Friday",
  ]),
  description: "Raised from the weekly operations review.",
  status: pick(["todo", "todo", "in_progress", "blocked", "done"]),
  priority: pick(["low", "medium", "high", "urgent"]),
  dueDate: new Date(NOW + intBetween(-8, 20) * DAY).toISOString(),
  module: pick(["restaurants", "finance", "riders", "marketing"]),
  assignedTo: { _id: id("a", index), name: fullName(), email: `ops${index}@example.com` },
  createdAt: daysAgo(intBetween(1, 30)),
}));

const payouts = Array.from({ length: 70 }, (_, index) => {
  const toVendor = chance(0.6);
  const restaurant = pick(restaurants);
  const rider = pick(riders);
  const amount = intBetween(4000, 180000);
  const status = pick(["paid", "paid", "paid", "pending", "processing", "failed"]);
  const periodEnd = intBetween(1, 40);
  return {
    _id: id("y", index),
    payoutId: `PO-${7300 + index}`,
    amount,
    netAmount: Math.round(amount * 0.95),
    status,
    method: pick(["Bank transfer (NEFT)", "IMPS", "UPI"]),
    reference: `UTR${intBetween(10000000, 99999999)}`,
    periodStart: daysAgo(periodEnd + 7),
    periodEnd: daysAgo(periodEnd),
    restaurantId: toVendor
      ? { _id: restaurant._id, name: restaurant.name, address: restaurant.address }
      : undefined,
    riderId: toVendor ? undefined : { _id: rider._id, name: rider.name, riderId: rider.riderId },
    createdAt: daysAgo(periodEnd),
  };
});

const settlements = Array.from({ length: 48 }, (_, index) => {
  const restaurant = pick(restaurants);
  const amount = intBetween(20000, 420000);
  const periodEnd = intBetween(1, 60);
  return {
    _id: id("z", index),
    amount,
    netAmount: Math.round(amount * (0.78 + random() * 0.08)),
    status: pick(["settled", "settled", "pending", "processing", "failed"]),
    reference: `ST-${5100 + index}`,
    periodStart: daysAgo(periodEnd + 14),
    periodEnd: daysAgo(periodEnd),
    restaurantId: { _id: restaurant._id, name: restaurant.name, address: restaurant.address },
    createdAt: daysAgo(periodEnd),
  };
});

const transactions = Array.from({ length: 140 }, (_, index) => {
  const order = pick(orders);
  const type = pick(["payment", "payment", "payment", "refund", "payout", "wallet"]);
  return {
    _id: id("x", index),
    transactionId: `TXN${920000 + index}`,
    type,
    amount: type === "payout" ? intBetween(5000, 90000) : order.total,
    status: pick(["Paid", "Paid", "Paid", "Pending", "Failed", "Refunded"]),
    method: pick(["UPI", "Card", "Netbanking", "Wallet", "Bank transfer"]),
    description: `${type === "refund" ? "Refund for" : "Payment for"} ${order.orderNumber}`,
    orderId: { _id: order._id, orderNumber: order.orderNumber },
    userId: order.userId,
    createdAt: daysAgo(intBetween(0, 45)),
  };
});

const invoices = Array.from({ length: 56 }, (_, index) => {
  const restaurant = pick(restaurants);
  const order = pick(orders);
  const issued = intBetween(1, 70);
  const status = pick(["paid", "paid", "unpaid", "unpaid", "draft"]);
  return {
    _id: id("n", index),
    invoiceNumber: `INV-2026-${String(1200 + index)}`,
    amount: intBetween(2000, 60000),
    totalAmount: intBetween(2000, 60000),
    status,
    issuedDate: daysAgo(issued),
    dueDate: new Date(NOW - (issued - 15) * DAY).toISOString(),
    restaurantId: { _id: restaurant._id, name: restaurant.name },
    orderId: { _id: order._id, orderNumber: order.orderNumber },
    createdAt: daysAgo(issued),
  };
});

const refunds = Array.from({ length: 42 }, (_, index) => {
  const order = pick(orders);
  return {
    _id: id("f", index),
    refundId: `RF-${3300 + index}`,
    amount: order.total,
    status: pick(["refunded", "refunded", "pending", "approved", "processing", "rejected"]),
    reason: pick(["order_cancelled", "item_missing", "quality_issue", "late_delivery"]),
    method: pick(["UPI", "Card", "Wallet"]),
    orderId: { _id: order._id, orderNumber: order.orderNumber },
    userId: order.userId,
    createdAt: daysAgo(intBetween(0, 35)),
  };
});

const wallets = Array.from({ length: 80 }, (_, index) => {
  const kind = pick(["customer", "customer", "vendor", "rider"]);
  const customer = pick(customers);
  const restaurant = pick(restaurants);
  const rider = pick(riders);
  const credited = intBetween(1000, 90000);
  const debited = Math.round(credited * random());
  return {
    _id: id("w", index),
    balance: credited - debited,
    totalCredited: credited,
    totalDebited: debited,
    ownerType: kind,
    isActive: chance(0.95),
    userId: kind === "customer" ? { _id: customer._id, name: customer.name, email: customer.email } : undefined,
    restaurantId: kind === "vendor" ? { _id: restaurant._id, name: restaurant.name } : undefined,
    riderId: kind === "rider" ? { _id: rider._id, name: rider.name } : undefined,
    updatedAt: daysAgo(intBetween(0, 20)),
    createdAt: daysAgo(intBetween(30, 400)),
  };
});

const roles = [
  ["Super Admin", "Unrestricted access to every module and setting.", 24, 2, true],
  ["Operations Manager", "Day-to-day orders, dispatch and support.", 14, 6, true],
  ["Finance", "Settlements, payouts, invoices and reports.", 9, 3, true],
  ["Vendor Success", "Restaurant onboarding, KYC and performance.", 8, 4, false],
  ["Support Agent", "Tickets, disputes and customer lookups.", 6, 11, false],
  ["Marketing", "Campaigns, offers, banners and notifications.", 7, 3, false],
  ["Read Only", "View everything, change nothing.", 12, 5, false],
].map(([name, description, permissions, userCount, isSystem], index) => ({
  _id: id("e", index),
  name: name as string,
  description: description as string,
  permissions: Array.from({ length: permissions as number }, (_, i) => `perm.${i}`),
  userCount: userCount as number,
  isSystem: isSystem as boolean,
  createdAt: daysAgo(400 - index * 30),
}));

const activityLogs = Array.from({ length: 90 }, (_, index) => {
  const actor = pick(["Asha Menon", "Ravi Kulkarni", "Priya Nair", "System"]);
  const action = pick(["update", "create", "delete", "login", "export"]);
  const area = pick(["orders", "restaurants", "riders", "finance", "marketing", "system"]);
  return {
    _id: id("l", index),
    action,
    module: area,
    description: `${action === "login" ? "Signed in" : `${action}d a record`} in ${area}`,
    ipAddress: `10.${intBetween(0, 60)}.${intBetween(0, 255)}.${intBetween(2, 250)}`,
    userId:
      actor === "System"
        ? undefined
        : { _id: id("u", index), name: actor, email: `${actor.split(" ")[0].toLowerCase()}@example.com` },
    createdAt: daysAgo(intBetween(0, 14), 24),
  };
});

const notifications = Array.from({ length: 40 }, (_, index) => {
  const type = pick(["order", "payment", "vendor", "system"]);
  const sent = intBetween(200, 42000);
  return {
    _id: id("h", index),
    title: pick([
      "Payout batch completed",
      "Vendor awaiting KYC approval",
      "Failed payment retried successfully",
      "Rider marked unavailable during peak",
      "Coupon budget 90% consumed",
      "Order cancelled after pickup",
    ]),
    message:
      "Review the affected records and take action if the automatic retry did not resolve it.",
    type,
    audience: pick(["all", "customers", "vendors", "riders"]),
    status: pick(["sent", "sent", "scheduled", "draft"]),
    sentAt: daysAgo(intBetween(0, 20)),
    sentCount: sent,
    readCount: Math.round(sent * (0.2 + random() * 0.5)),
    createdAt: daysAgo(intBetween(0, 20)),
  };
});

const referrals = Array.from({ length: 52 }, (_, index) => {
  const referrer = pick(customers);
  const completed = chance(0.55);
  return {
    _id: id("j", index),
    code: `REF${String(1000 + index)}`,
    status: completed ? "completed" : chance(0.7) ? "pending" : "expired",
    rewardAmount: pick([50, 100, 150]),
    referrer: { _id: referrer._id, name: referrer.name, email: referrer.email },
    referee: completed ? { _id: pick(customers)._id, name: fullName() } : undefined,
    completedAt: completed ? daysAgo(intBetween(0, 60)) : undefined,
    createdAt: daysAgo(intBetween(5, 120)),
  };
});

const customerGroups = [
  ["High value", "Lifetime spend above ₹15,000", 4820, "Spend > ₹15k"],
  ["Loyal", "Five or more orders in 60 days", 12480, "Orders ≥ 5 / 60d"],
  ["First-time buyers", "Placed exactly one order", 18310, "Orders = 1"],
  ["Offer responders", "Redeemed 3+ coupons", 6640, "Coupons ≥ 3"],
  ["Lapsed", "No order in the last 60 days", 9210, "Last order > 60d"],
  ["Corporate", "Ordering to registered office addresses", 2140, "Manual"],
  ["Students", "Verified student accounts", 1180, "Manual"],
].map(([name, description, customerCount, criteria], index) => ({
  _id: id("cg", index),
  name: name as string,
  description: description as string,
  customerCount: customerCount as number,
  criteria: criteria as string,
  isActive: index < 6,
  isDefault: index === 0,
  createdAt: daysAgo(300 - index * 25),
}));

const taxonomy = (names: readonly string[], prefix: string) =>
  names.map((name, index) => ({
    _id: id(prefix, index),
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: `Everything filed under ${name.toLowerCase()}.`,
    isActive: index < names.length - 1,
    sortOrder: index + 1,
    count: intBetween(4, 240),
    createdAt: daysAgo(500 - index * 20),
  }));

const categories = taxonomy(
  ["Fast food", "Healthy", "Desserts", "Beverages", "Biryani", "Pizza", "Breakfast", "Combos", "Bakery"],
  "ct"
);
const cuisines = taxonomy(CUISINES, "cu");

/* ── Aggregates ─────────────────────────────────────────────────────────── */

const deliveredOrders = orders.filter((order) => order.status === "Delivered");
const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.total, 0);

const dashboardAnalytics = {
  totalOrders: 48_312,
  activeVendors: restaurants.length,
  totalRevenue: totalRevenue * 46,
  newRegistrations: 23_907,
  cancelledOrders: 3_186,
  averageOrderValue: Math.round(totalRevenue / Math.max(deliveredOrders.length, 1)),
};

function revenueTrend(period: string) {
  const points = period === "7days" ? 7 : period === "year" ? 12 : 30;
  const monthly = period === "year";
  const categoriesOut: string[] = [];
  const revenue: number[] = [];
  const ordersOut: number[] = [];

  // A separate stream keeps the trend stable regardless of call order.
  const trendRandom = makeRandom(period.length * 977 + points);

  for (let index = points - 1; index >= 0; index--) {
    const date = new Date(NOW - index * (monthly ? 30 : 1) * DAY);
    categoriesOut.push(
      monthly
        ? date.toLocaleDateString("en-IN", { month: "short" })
        : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    );
    // Weekends run hotter; a mild upward drift over the window.
    const weekendLift = [0, 6].includes(date.getDay()) ? 1.28 : 1;
    const drift = 1 + (points - index) / (points * 3);
    const base = (monthly ? 9800 : 340) * weekendLift * drift;
    const count = Math.round(base * (0.85 + trendRandom() * 0.3));
    ordersOut.push(count);
    revenue.push(Math.round(count * (410 + trendRandom() * 120)));
  }

  return { categories: categoriesOut, revenue, orders: ordersOut };
}

/* ── Router ─────────────────────────────────────────────────────────────── */

interface Collection {
  key: string;
  rows: unknown[];
}

/** Longest-prefix match wins, so `/admin/orders/live` beats `/admin/orders`. */
const COLLECTIONS: Array<[string, Collection]> = [
  ["/admin/orders/live", { key: "orders", rows: liveOrders }],
  ["/admin/orders", { key: "orders", rows: orders }],
  ["/admin/users/groups", { key: "groups", rows: customerGroups }],
  ["/admin/users", { key: "users", rows: customers }],
  ["/admin/restaurants/categories", { key: "categories", rows: categories }],
  ["/admin/restaurants", { key: "restaurants", rows: restaurants }],
  ["/cuisines", { key: "cuisines", rows: cuisines }],
  ["/admin/riders", { key: "riders", rows: riders }],
  ["/admin/menu-items", { key: "menuItems", rows: menuItems }],
  ["/admin/coupons", { key: "coupons", rows: coupons }],
  ["/admin/campaigns", { key: "campaigns", rows: campaigns }],
  ["/admin/marketing/banners", { key: "banners", rows: banners }],
  ["/admin/reviews", { key: "reviews", rows: reviews }],
  ["/admin/user-support", { key: "tickets", rows: tickets }],
  ["/admin/disputes", { key: "disputes", rows: disputes }],
  ["/admin/tasks", { key: "tasks", rows: tasks }],
  ["/admin/payouts", { key: "payouts", rows: payouts }],
  ["/admin/vendor-settlements", { key: "settlements", rows: settlements }],
  ["/admin/vendor-withdrawals", { key: "withdrawals", rows: payouts }],
  ["/admin/rider-withdrawals", { key: "withdrawals", rows: payouts.filter((p) => p.riderId) }],
  ["/admin/payments/wallets", { key: "wallets", rows: wallets }],
  ["/admin/payments", { key: "payments", rows: transactions }],
  ["/admin/invoices", { key: "invoices", rows: invoices }],
  ["/admin/refunds", { key: "refunds", rows: refunds }],
  ["/admin/rbac/roles", { key: "roles", rows: roles }],
  ["/activity-logs", { key: "logs", rows: activityLogs }],
  ["/admin/notifications", { key: "notifications", rows: notifications }],
  ["/referrals", { key: "referrals", rows: referrals }],
];

function findCollection(path: string) {
  let best: Collection | null = null;
  let bestLength = -1;
  for (const [prefix, collection] of COLLECTIONS) {
    if (path === prefix || path.startsWith(`${prefix}?`)) {
      if (prefix.length > bestLength) {
        best = collection;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

/**
 * Named sub-routes that sit where an :id would. Without this, `/admin/orders/live`
 * is captured as an order id and the live board silently renders one order.
 */
const RESERVED_SEGMENTS = new Set([
  "live", "groups", "categories", "cuisines", "tracking", "analytics",
  "wallets", "roles", "documents", "performance", "earnings", "withdrawals",
  "new", "kyc", "combos", "export", "search", "me",
]);

const DETAIL_SOURCES: Array<[RegExp, unknown[]]> = [
  [/^\/admin\/orders\/([^/]+)$/, orders],
  [/^\/admin\/users\/([^/]+)$/, customers],
  [/^\/admin\/restaurants\/([^/]+)$/, restaurants],
  [/^\/admin\/riders\/([^/]+)$/, riders],
];

const DETAIL_KEYS: Record<string, string> = {
  "/admin/orders/": "order",
  "/admin/users/": "user",
  "/admin/restaurants/": "restaurant",
  "/admin/riders/": "rider",
};

function matchText(row: unknown, needle: string) {
  return JSON.stringify(row).toLowerCase().includes(needle.toLowerCase());
}

/** Applies the same filters the real endpoints support. */
function applyFilters(rows: unknown[], query: Record<string, QueryValue>) {
  let out = rows;
  const search = query.search ? String(query.search) : "";
  if (search) out = out.filter((row) => matchText(row, search));

  for (const [key, value] of Object.entries(query)) {
    if (!value || ["page", "limit", "search", "type", "scope"].includes(key)) continue;
    out = out.filter((row) => {
      const field = (row as Record<string, unknown>)[key];
      if (field === undefined || field === null) return true;
      // A populated reference arrives as `{ _id, name }`. Stringifying that
      // gives "[object Object]", so every ?restaurantId= filter matched
      // nothing — compare against the id the caller actually passed.
      const actual =
        typeof field === "object" && "_id" in (field as object)
          ? String((field as { _id?: unknown })._id ?? "")
          : String(field);
      return actual.toLowerCase() === String(value).toLowerCase();
    });
  }
  return out;
}

/**
 * Answers a request from the fixtures. Returns the full envelope so the caller
 * can treat it exactly like a real response.
 */
export function mockResponse(
  path: string,
  query: Record<string, QueryValue> = {}
): unknown {
  const clean = path.split("?")[0];

  if (clean === "/admin/auth/me") {
    return {
      status: "success",
      data: {
        user: {
          id: "mock-admin",
          name: "Asha Menon",
          email: "asha.menon@example.com",
          phone: "9845012345",
          role: "admin",
        },
      },
    };
  }

  if (clean === "/admin/dashboard/analytics") {
    return { status: "success", data: dashboardAnalytics };
  }

  if (clean === "/admin/dashboard/revenue-trend") {
    return { status: "success", data: revenueTrend(String(query.period ?? "7days")) };
  }

  if (clean === "/admin/settings") {
    return {
      status: "success",
      data: {
        platformName: "Marketplace",
        supportEmail: "support@example.com",
        supportPhone: "1800 000 0000",
        ordersEnabled: true,
        vendorSelfSignup: true,
        riderSelfSignup: false,
        maintenanceMode: false,
        platformCommissionPercent: 18,
        platformFee: 9,
        gstOnItems: 5,
        gstOnFees: 18,
        minimumOrderValue: 99,
        freeDeliveryThreshold: 499,
        cancellationWindowMinutes: 3,
        currency: "INR",
        onlinePaymentsEnabled: true,
        codEnabled: true,
        walletEnabled: true,
        autoCapture: true,
        payoutCycle: "weekly",
        minimumPayoutAmount: 500,
        tdsPercent: 5,
        baseDeliveryFee: 25,
        perKmCharge: 10,
        maxDeliveryRadiusKm: 8,
        dispatchWindowSeconds: 45,
        dispatchRadiusKm: 4,
        autoAssignRiders: true,
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: false,
        inAppEnabled: true,
        quietHoursEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        adminTwoFactor: true,
        passwordRotation: false,
        auditLogging: true,
        sessionLifetimeDays: 7,
        rateLimitMax: 200,
        allowedOrigins: "https://admin.example.com",
      },
    };
  }

  // Nested order lists on a customer / rider.
  const nested = clean.match(/^\/admin\/(users|riders)\/([^/]+)\/orders$/);
  if (nested) {
    const owner = nested[2];
    const field = nested[1] === "users" ? "userId" : "riderId";
    const rows = orders.filter((order) => {
      const ref = (order as unknown as Record<string, unknown>)[field] as
        | { _id?: string }
        | undefined;
      return ref?._id === owner;
    });
    const sample = rows.length > 0 ? rows : orders.slice(0, 8);
    return {
      status: "success",
      total: sample.length,
      page: 1,
      totalPages: 1,
      data: { orders: sample },
    };
  }

  for (const [pattern, source] of DETAIL_SOURCES) {
    const match = clean.match(pattern);
    if (!match) continue;
    const wanted = match[1];
    if (RESERVED_SEGMENTS.has(wanted)) break; // fall through to the collections
    const found =
      (source as Array<{ _id: string }>).find((row) => row._id === wanted) ??
      (source[0] as { _id: string });
    const keyPrefix = Object.keys(DETAIL_KEYS).find((prefix) => clean.startsWith(prefix))!;
    return { status: "success", data: { [DETAIL_KEYS[keyPrefix]]: found } };
  }

  const collection = findCollection(clean);
  if (collection) {
    const filtered = applyFilters(collection.rows, query);
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 25);
    const start = (page - 1) * limit;
    return {
      status: "success",
      results: Math.min(limit, Math.max(0, filtered.length - start)),
      total: filtered.length,
      page,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      data: { [collection.key]: filtered.slice(start, start + limit) },
    };
  }

  // Unknown path — an empty, well-formed list beats a crash.
  return { status: "success", total: 0, page: 1, totalPages: 1, data: { items: [] } };
}

export function mockLogin() {
  return {
    status: "success",
    token: "mock-token",
    data: {
      user: {
        id: "mock-admin",
        name: "Asha Menon",
        email: "asha.menon@example.com",
        phone: "9845012345",
        role: "admin",
      },
    },
  };
}
