/**
 * Fixtures for what this backend does not serve.
 *
 * Orders, menu, categories, the restaurant profile, dashboard stats, KYC and
 * withdrawals all come off the API now — see `vendor-api.ts`. What is left here
 * is the set of screens the backend has no vendor endpoint for:
 *
 *   - Reviews:   `publicReviews.js` is customer-facing; there is no
 *                `/vendor/reviews` to read or reply through.
 *   - Offers:    vendor coupons live in `routes/vendor/vendorCouponRoutes.js`,
 *                which is not mounted on the vendor router.
 *   - Analytics: `/vendor/stats` returns four totals and a daily series; the
 *                category / payment-method / cohort breakdowns the Reports
 *                screen charts have no endpoint behind them.
 *
 * Every screen that reads from here says so on the page, so nobody mistakes a
 * fixture for a measurement. Deleting a block below is the whole job once its
 * endpoint exists.
 */

/* ── Reviews ────────────────────────────────────────────────────────────── */

export interface Review {
  id: string;
  customer: string;
  rating: number;
  comment: string;
  orderId: string;
  at: string;
  reply?: string;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const reviews: Review[] = [
  {
    id: "rv1",
    customer: "Anitha Reddy",
    rating: 5,
    comment: "Biryani was hot and the portion was generous. Packed neatly too.",
    orderId: "RT123398",
    at: minutesAgo(180),
    reply: "Thank you! See you again soon.",
  },
  {
    id: "rv2",
    customer: "Karthik Pillai",
    rating: 4,
    comment: "Good food, but the samosas were slightly cold on arrival.",
    orderId: "RT123391",
    at: minutesAgo(420),
  },
  {
    id: "rv3",
    customer: "Sneha Sharma",
    rating: 2,
    comment: "Ordered extra gravy and it was missing from the bag.",
    orderId: "RT123384",
    at: minutesAgo(900),
  },
  {
    id: "rv4",
    customer: "Farhan Patel",
    rating: 5,
    comment: "Consistently the best paneer butter masala in the area.",
    orderId: "RT123370",
    at: minutesAgo(1500),
  },
  {
    id: "rv5",
    customer: "Pradeep Yadav",
    rating: 3,
    comment: "Food was fine. Delivery took longer than the quoted time.",
    orderId: "RT123362",
    at: minutesAgo(2100),
  },
];

/** Lifetime spread, at the reference's 72/19/6/2/1 shape. */
export const ratingDistribution = [
  { star: 5, count: 170 },
  { star: 4, count: 45 },
  { star: 3, count: 14 },
  { star: 2, count: 5 },
  { star: 1, count: 2 },
];

export const reviewTotals = {
  average: 4.7,
  count: ratingDistribution.reduce((sum, row) => sum + row.count, 0),
  weekDelta: 0.3,
};

/* ── Offers ─────────────────────────────────────────────────────────────── */

export interface Offer {
  id: string;
  code: string;
  /** The two lines printed inside the coupon tile, e.g. "20%" / "OFF". */
  couponTop: string;
  couponBottom: string;
  description: string;
  status: "Active" | "Scheduled" | "Expired";
  tone: "violet" | "green" | "amber" | "red" | "blue";
  validLabel: string;
  validValue: string;
  timeWindow: string;
  minOrder: number;
  used: number;
  orders: number;
  discountGiven: number;
  revenue: number;
  /** Countdown shown on a scheduled offer. */
  startsIn?: { days: number; hours: number; minutes: number };
}

export const offers: Offer[] = [
  {
    id: "o1", code: "FLAT20", couponTop: "20%", couponBottom: "OFF",
    description: "Flat 20% OFF on orders above ₹199",
    status: "Active", tone: "violet",
    validLabel: "Valid till", validValue: "25 May 2024",
    timeWindow: "All Time", minOrder: 199,
    used: 156, orders: 189, discountGiven: 2450, revenue: 15620,
  },
  {
    id: "o2", code: "WELCOME50", couponTop: "₹50", couponBottom: "OFF",
    description: "₹50 OFF on your first order",
    status: "Active", tone: "green",
    validLabel: "Valid till", validValue: "30 May 2024",
    timeWindow: "All Time", minOrder: 149,
    used: 45, orders: 52, discountGiven: 1250, revenue: 3150,
  },
  {
    id: "o3", code: "WEEKEND15", couponTop: "15%", couponBottom: "OFF",
    description: "15% OFF on all orders",
    status: "Active", tone: "amber",
    validLabel: "Valid till", validValue: "26 May 2024",
    timeWindow: "Sat – Sun", minOrder: 249,
    used: 13, orders: 17, discountGiven: 150, revenue: 1030,
  },
  {
    id: "o4", code: "FREESHIP", couponTop: "FREE", couponBottom: "DELIVERY",
    description: "Free delivery on orders above ₹199",
    status: "Active", tone: "red",
    validLabel: "Valid till", validValue: "31 May 2024",
    timeWindow: "All Time", minOrder: 199,
    used: 98, orders: 124, discountGiven: 0, revenue: 4960,
  },
  {
    id: "o5", code: "SUMMER25", couponTop: "25%", couponBottom: "OFF",
    description: "25% OFF on orders above ₹299",
    status: "Scheduled", tone: "blue",
    validLabel: "Starts on", validValue: "01 Jun 2024, 12:00 AM",
    timeWindow: "All Time", minOrder: 299,
    used: 0, orders: 0, discountGiven: 0, revenue: 0,
    startsIn: { days: 5, hours: 14, minutes: 28 },
  },
  {
    id: "o6", code: "MEALDEAL", couponTop: "₹99", couponBottom: "COMBO",
    description: "Meal combo at a flat ₹99 off",
    status: "Expired", tone: "violet",
    validLabel: "Expired on", validValue: "10 May 2024",
    timeWindow: "All Time", minOrder: 349,
    used: 0, orders: 0, discountGiven: 0, revenue: 0,
  },
];

export const offersHeadline = {
  totalOffers: 6,
  couponsUsed: 312,
  discountGiven: 3850,
  revenueFromOffers: 24760,
  couponsUsedDelta: 18.6,
  discountGivenDelta: 12.4,
  revenueDelta: 15.3,
};

/** The Performance tab's plot: orders placed with an offer, and what they made. */
export const offerPerformance = [
  { label: "20 May", orders: 34, revenue: 1180 },
  { label: "21 May", orders: 52, revenue: 1720 },
  { label: "22 May", orders: 73, revenue: 3050 },
  { label: "23 May", orders: 44, revenue: 1660 },
  { label: "24 May", orders: 53, revenue: 2260 },
  { label: "25 May", orders: 64, revenue: 2840 },
  { label: "26 May", orders: 41, revenue: 1080 },
  { label: "27 May", orders: 68, revenue: 2520 },
  { label: "28 May", orders: 57, revenue: 2180 },
  { label: "29 May", orders: 74, revenue: 2740 },
];

/* ── Analytics breakdowns ───────────────────────────────────────────────── */

export const revenueByCategory = [
  { label: "Main Course", value: 62450, color: "#2563eb" },
  { label: "Beverages", value: 18760, color: "#22a45d" },
  { label: "Snacks", value: 17340, color: "#f59e0b" },
  { label: "Desserts", value: 11620, color: "#6d28d9" },
  { label: "Others", value: 8390, color: "#ec4899" },
];

export const revenueByPayment = [
  { label: "Online (UPI/Card)", value: 92450, color: "#2563eb" },
  { label: "COD", value: 18760, color: "#22a45d" },
  { label: "Wallet", value: 5350, color: "#f59e0b" },
  { label: "Others", value: 2000, color: "#6d28d9" },
];

export const salesBreakdown = [
  { label: "Food Sales", value: 276540, color: "#22a45d" },
  { label: "Delivery Fees", value: 40120, color: "#2563eb" },
  { label: "Packaging Fees", value: 14320, color: "#f59e0b" },
  { label: "Other Fees", value: 14700, color: "#6d28d9" },
];

export const customerInsights = [
  { label: "Total Customers", value: "2,045", delta: 9.6, tone: "violet" as const },
  { label: "Repeat Customers", value: "612 (29.9%)", delta: 6.3, tone: "green" as const },
  { label: "New Customers", value: "68", delta: 10.8, tone: "amber" as const },
  { label: "Average Rating", value: "4.7/5", delta: 0.3, tone: "blue" as const },
];

export const todaysInsights = [
  { label: "Peak Order Time", value: "12:00 PM - 01:00 PM", tone: "green" as const },
  { label: "Busiest Day", value: "Friday", tone: "amber" as const },
  { label: "Repeat Customer Rate", value: "42%", tone: "blue" as const },
  { label: "Cancellation Rate", value: "2.1%", tone: "red" as const },
];

export const announcements = [
  {
    id: "a1",
    title: "New Feature Update!",
    body: "You can now set item level preparation time.",
    at: "2 days ago",
    tone: "green" as const,
  },
  {
    id: "a2",
    title: "Weekend Offer",
    body: "Get 10% off on platform commission this weekend!",
    at: "3 days ago",
    tone: "blue" as const,
  },
  {
    id: "a3",
    title: "Payout Update",
    body: "Your weekly payout has been initiated.",
    at: "1 week ago",
    tone: "violet" as const,
  },
];

/* ── Settings ───────────────────────────────────────────────────────────── */

export interface SettingsRow {
  label: string;
  description: string;
  icon:
    | "store" | "clock" | "bike" | "receipt" | "bell" | "tag" | "megaphone"
    | "gift" | "wallet" | "bank" | "file" | "user" | "shield" | "help" | "info";
  tone: "red" | "green" | "blue" | "amber" | "violet";
  meta?: string;
}

export const settingsGroups: Array<{ title: string; rows: SettingsRow[] }> = [
  {
    title: "Restaurant Settings",
    rows: [
      { label: "Restaurant Information", description: "Manage your restaurant details, address, cuisine, and more", icon: "store", tone: "red" },
      { label: "Working Hours", description: "Set your restaurant opening and closing hours", icon: "clock", tone: "blue" },
      { label: "Delivery Settings", description: "Manage delivery radius, time, and order limits", icon: "bike", tone: "green" },
      { label: "Order Settings", description: "Manage order acceptance, auto-accept, and order preferences", icon: "receipt", tone: "violet" },
      { label: "Notifications", description: "Manage push notifications and in-app alerts", icon: "bell", tone: "amber" },
    ],
  },
  {
    title: "Offers & Marketing",
    rows: [
      { label: "Offers & Coupons", description: "Create and manage offers, coupons, and promotions", icon: "tag", tone: "red", meta: "4 Active" },
      { label: "Marketing Tools", description: "Banners, featured listings and promotional tools", icon: "megaphone", tone: "amber" },
      { label: "Loyalty Program", description: "Manage your loyalty program and rewards", icon: "gift", tone: "violet" },
    ],
  },
  {
    title: "Payments & Documents",
    rows: [
      { label: "Payouts & Transactions", description: "View payouts, settlements and transaction history", icon: "wallet", tone: "green" },
      { label: "Bank Details", description: "Manage bank account and payout details", icon: "bank", tone: "blue" },
      { label: "Documents", description: "Manage your KYC, FSSAI, PAN, GST and other documents", icon: "file", tone: "violet" },
    ],
  },
  {
    title: "Account & Support",
    rows: [
      { label: "Account Settings", description: "Change password, mobile number and email", icon: "user", tone: "blue" },
      { label: "Privacy & Security", description: "Manage privacy settings and account security", icon: "shield", tone: "green" },
      { label: "Help & Support", description: "Get help, FAQs and contact support", icon: "help", tone: "amber" },
      { label: "About Reditoe Vendor", description: "App version, terms & conditions and privacy policy", icon: "info", tone: "violet" },
    ],
  },
];
