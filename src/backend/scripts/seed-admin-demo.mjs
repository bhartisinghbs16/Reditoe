/**
 * Demo data for the admin console.
 *
 * The vendor seed covers the vendor app: one restaurant, its menu and a spread
 * of orders. The admin console reads several things that seed never touches —
 * an admin account to sign in with, restaurant categories, the financial
 * ledger, wallets and referrals — so those live here.
 *
 * Runs after seedVendorDemo and builds on its output: transactions are derived
 * from the orders that seed created, so the ledger reconciles against them
 * rather than being an unrelated set of numbers.
 *
 * Idempotent — re-running updates rather than duplicating.
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Restaurant from "../models/Restaurant.js";
import Order from "../models/Order.js";
import Category from "../models/Category.js";
import FinancialTransaction from "../models/FinancialTransaction.js";
import Wallet from "../models/Wallet.js";
import ReferralTransaction from "../models/ReferralTransaction.js";
import RiderWallet from "../models/RiderWallet.js";
import Campaign from "../models/Campaign.js";
import Notification from "../models/Notification.js";

const ADMIN = {
  name: "Reditoe Admin",
  email: "admin@reditoe.com",
  password: "Admin@12345",
  phone: "9800000001",
};

/** Matches the categories the vendor seed's menu items already use. */
const CATEGORIES = [
  { name: "Biryani", sortOrder: 1 },
  { name: "Main Course", sortOrder: 2 },
  { name: "Starters", sortOrder: 3 },
  { name: "Breads", sortOrder: 4 },
  { name: "Chinese", sortOrder: 5 },
  { name: "South Indian", sortOrder: 6 },
  { name: "Desserts", sortOrder: 7, isActive: false },
];

/**
 * Delivery partners. A rider is a User with role 'rider', which is what the
 * admin rider endpoints query — there is no separate Rider model.
 *
 * The spread is deliberate: the console's Partners screens show KYC state,
 * online state and blocked state as columns, and every one of them reads as a
 * single value until the data contains more than one.
 */
const RIDERS = [
  {
    name: "Arun Kumar",
    email: "arun.rider@reditoe.com",
    phone: "9800000101",
    vehicleType: "bike",
    vehicleNumber: "TN01AB1234",
    kycStatus: "approved",
    isOnline: true,
    rating: 4.8,
  },
  {
    name: "Priya Nair",
    email: "priya.rider@reditoe.com",
    phone: "9800000102",
    vehicleType: "scooter",
    vehicleNumber: "TN02CD5678",
    kycStatus: "approved",
    isOnline: true,
    rating: 4.6,
  },
  {
    name: "Mohammed Salim",
    email: "salim.rider@reditoe.com",
    phone: "9800000103",
    vehicleType: "bike",
    vehicleNumber: "TN03EF9012",
    kycStatus: "pending",
    isOnline: false,
    rating: 4.2,
  },
  {
    name: "Deepak Verma",
    email: "deepak.rider@reditoe.com",
    phone: "9800000104",
    vehicleType: "cycle",
    vehicleNumber: "",
    kycStatus: "rejected",
    isOnline: false,
    rating: 3.9,
  },
  {
    name: "Lakshmi Raman",
    email: "lakshmi.rider@reditoe.com",
    phone: "9800000105",
    vehicleType: "scooter",
    vehicleNumber: "TN05GH3456",
    kycStatus: "approved",
    isOnline: false,
    isBlocked: true,
    rating: 4.4,
  },
];

/** The platform's cut, used to split each order into commission and payout. */
const COMMISSION_PERCENT = 18;
const GST_ON_COMMISSION = 18;
const PLATFORM_FEE = 9;

/** Maps an order's payment method onto the ledger's own enum. */
function ledgerMethod(paymentMethod) {
  const value = String(paymentMethod ?? "").toLowerCase();
  if (value === "cod" || value === "cash") return "cash";
  if (value === "wallet") return "wallet";
  if (value === "card") return "card";
  return "online";
}

async function seedAdminUser() {
  const existing = await User.findOne({ email: ADMIN.email });
  if (existing) {
    // Reset the password so a restart always leaves a known-good login.
    existing.password = ADMIN.password;
    existing.role = "admin";
    existing.isBlocked = false;
    await existing.save();
    return existing;
  }

  return User.create({
    ...ADMIN,
    role: "admin",
    isVerified: true,
    isEmailVerified: true,
    isPhoneVerified: true,
  });
}

/**
 * Riders plus a wallet each, so the payouts screen has balances to show rather
 * than a column of zeroes.
 */
async function seedRiders() {
  const riders = [];
  for (const [index, entry] of RIDERS.entries()) {
    let rider = await User.findOne({ email: entry.email });
    if (!rider) {
      rider = await User.create({
        name: entry.name,
        email: entry.email,
        phone: entry.phone,
        password: "Rider@12345",
        role: "rider",
        riderId: `RDR${String(index + 1).padStart(4, "0")}`,
        vehicleType: entry.vehicleType,
        vehicleNumber: entry.vehicleNumber,
        kycStatus: entry.kycStatus,
        isOnline: entry.isOnline ?? false,
        isBlocked: entry.isBlocked ?? false,
        isVerified: entry.kycStatus === "approved",
        isPhoneVerified: true,
        drivingLicenceVerified: entry.kycStatus === "approved",
        vehicleRcVerified: entry.kycStatus === "approved",
      });
    }
    riders.push(rider);

    const existingWallet = await RiderWallet.findOne({ riderId: rider._id });
    if (!existingWallet) {
      const earned = 2400 + index * 850;
      const withdrawn = Math.round(earned * 0.6);
      await RiderWallet.create({
        riderId: rider._id,
        balance: earned - withdrawn,
        totalEarnings: earned,
        totalWithdrawn: withdrawn,
      });
    }
  }
  return riders.length;
}

async function seedCategories(restaurant) {
  let created = 0;
  for (const entry of CATEGORIES) {
    const existing = await Category.findOne({
      name: entry.name,
      restaurantId: restaurant._id,
    });
    if (existing) continue;

    await Category.create({
      name: entry.name,
      restaurantId: restaurant._id,
      isActive: entry.isActive ?? true,
      sortOrder: entry.sortOrder,
    });
    created += 1;
  }

  // A restaurant's `categories` are the cuisines it is tagged with, which is a
  // separate field from the menu sections above. The admin Categories screen
  // counts restaurants per cuisine, so without these every row reads "0
  // restaurants" and the screen looks broken rather than empty.
  if (!restaurant.categories || restaurant.categories.length === 0) {
    restaurant.categories = ["Biryani", "Main Course", "Chinese"];
    await restaurant.save();
  }

  return created;
}

/**
 * One ledger row per order that took money, plus a refund row for the
 * cancelled one — so the transactions screen shows both directions rather than
 * a column of identical inflows.
 */
async function seedTransactions(restaurant) {
  const orders = await Order.find({ restaurantId: restaurant._id }).lean();
  if (orders.length === 0) return 0;

  let written = 0;
  for (const order of orders) {
    const paid = order.status !== "Waiting for Confirmation";
    if (!paid) continue;

    const amount = order.total ?? 0;
    const commission = Math.round((amount * COMMISSION_PERCENT) / 100);
    const gst = Math.round((commission * GST_ON_COMMISSION) / 100);
    const isRefund = order.status === "Cancelled";

    const transactionId = `TXN-${String(order._id).slice(-8).toUpperCase()}`;

    const existing = await FinancialTransaction.findOne({ transactionId });
    if (existing) continue;

    await FinancialTransaction.create({
      type: isRefund ? "refund" : "order_payment",
      orderId: order._id,
      restaurantId: restaurant._id,
      amount,
      commissionAmount: isRefund ? 0 : commission,
      vendorAmount: isRefund ? 0 : amount - commission - PLATFORM_FEE,
      gstAmount: isRefund ? 0 : gst,
      platformFee: isRefund ? 0 : PLATFORM_FEE,
      paymentMethod: ledgerMethod(order.paymentMethod),
      status: isRefund ? "reversed" : "completed",
      transactionId,
      // isRefund and its reason are nested under refundInfo on the schema.
      refundInfo: isRefund
        ? { isRefund: true, refundReason: "Order cancelled by the customer" }
        : undefined,
      processedAt: order.createdAt,
      createdAt: order.createdAt,
      notes: isRefund
        ? "Refund issued against a cancelled order"
        : `Payment for order ${order.orderNumber ?? ""}`.trim(),
    });
    written += 1;
  }
  return written;
}

/**
 * A wallet per demo customer, with a couple frozen so the console's status
 * column has something other than one value in it.
 */
async function seedWallets(customers) {
  let written = 0;
  for (const [index, customer] of customers.entries()) {
    const existing = await Wallet.findOne({ userId: customer._id });
    if (existing) continue;

    const added = 500 + index * 350;
    const spent = Math.round(added * (0.2 + index * 0.1));

    await Wallet.create({
      userId: customer._id,
      balance: added - spent,
      totalAdded: added,
      totalSpent: spent,
      currency: "INR",
      isFrozen: index === 4,
      freezeReason: index === 4 ? "Flagged for review" : undefined,
      lastUpdated: new Date(),
    });
    written += 1;
  }
  return written;
}

/**
 * Referrals between the demo customers. Needs a real order to point at, since
 * ReferralTransaction requires one.
 */
async function seedReferrals(customers, restaurant) {
  const orders = await Order.find({ restaurantId: restaurant._id })
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();
  if (orders.length === 0 || customers.length < 4) return 0;

  const pairs = [
    { referrer: 0, referred: 1, status: "processed", amount: 100 },
    { referrer: 0, referred: 2, status: "processed", amount: 100 },
    { referrer: 1, referred: 3, status: "pending", amount: 100 },
    { referrer: 2, referred: 4, status: "failed", amount: 100 },
  ];

  let written = 0;
  for (const [index, pair] of pairs.entries()) {
    const order = orders[index % orders.length];
    const referrer = customers[pair.referrer];
    const referred = customers[pair.referred];
    if (!referrer || !referred) continue;

    const code = `REF${String(referrer._id).slice(-4).toUpperCase()}`;
    const existing = await ReferralTransaction.findOne({
      referrerId: referrer._id,
      referredUserId: referred._id,
    });
    if (existing) continue;

    await ReferralTransaction.create({
      referrerId: referrer._id,
      referredUserId: referred._id,
      referralCode: code,
      orderId: order._id,
      amount: pair.amount,
      status: pair.status,
      processedAt: pair.status === "processed" ? order.createdAt : undefined,
      failureReason:
        pair.status === "failed" ? "Referred user did not complete an order" : undefined,
    });
    written += 1;
  }
  return written;
}

/**
 * Marketing campaigns and notifications, spread across channels and states so
 * the console's status filters have more than one value to sort by.
 */
async function seedMarketing(admin) {
  const campaigns = [
    {
      name: "Weekend biryani push",
      campaignType: "PUSH_NOTIFICATION",
      description: "Objective: Returning users",
      content: {
        title: "Weekend biryani, 20% off",
        message: "Order before 10pm tonight and save 20% on every biryani.",
        actionText: "Order now",
      },
      status: "ACTIVE",
      budget: { total: 15000, spent: 4200 },
    },
    {
      name: "Lapsed customer win-back",
      campaignType: "EMAIL",
      description: "Objective: Lapsed customers",
      content: {
        title: "We miss you — here's ₹100 off",
        message: "It has been a while. Your next order is on us, up to ₹100.",
        actionText: "Claim offer",
      },
      status: "SCHEDULED",
      budget: { total: 8000, spent: 0 },
    },
    {
      name: "New restaurant spotlight",
      campaignType: "BANNER",
      description: "Objective: All users",
      content: {
        title: "Corner Kitchen is now on Reditoe",
        message: "Fresh menu, free delivery for the first week.",
      },
      status: "DRAFT",
      budget: { total: 5000, spent: 0 },
    },
    {
      name: "Monsoon free delivery",
      campaignType: "MULTI_CHANNEL",
      description: "Objective: All users",
      content: {
        title: "Free delivery all monsoon",
        message: "No delivery fee on orders over ₹199 until the rains stop.",
      },
      status: "COMPLETED",
      budget: { total: 25000, spent: 24150 },
    },
  ];

  let campaignsWritten = 0;
  for (const entry of campaigns) {
    const existing = await Campaign.findOne({ name: entry.name });
    if (existing) continue;
    await Campaign.create({
      ...entry,
      targeting: { userRoles: ["CUSTOMER"], cities: ["Chennai", "Coimbatore"] },
      schedule: { type: "IMMEDIATE", timezone: "Asia/Kolkata" },
      createdBy: admin?._id,
    });
    campaignsWritten += 1;
  }

  const notifications = [
    {
      title: "Scheduled maintenance tonight",
      message: "The platform will be read-only between 2am and 3am IST.",
      type: "SYSTEM",
      recipient: "ALL",
      isSent: true,
    },
    {
      title: "New payout schedule",
      message: "Vendor settlements now run every Tuesday instead of Friday.",
      type: "SYSTEM",
      recipient: "VENDORS",
      isSent: true,
    },
    {
      title: "Festive season bonus",
      message: "Complete 30 deliveries this week to earn a ₹500 bonus.",
      type: "PROMOTIONAL",
      recipient: "RIDERS",
      isSent: false,
    },
    {
      title: "Weekend offers are live",
      message: "Up to 40% off across 200 restaurants this weekend.",
      type: "PROMOTIONAL",
      recipient: "CUSTOMERS",
      isSent: false,
    },
  ];

  let notificationsWritten = 0;
  for (const entry of notifications) {
    const existing = await Notification.findOne({ title: entry.title });
    if (existing) continue;
    await Notification.create({
      ...entry,
      sentAt: entry.isSent ? new Date() : null,
      createdBy: admin?._id,
    });
    notificationsWritten += 1;
  }

  return { campaigns: campaignsWritten, notifications: notificationsWritten };
}

export async function seedAdminDemo() {
  const admin = await seedAdminUser();

  const restaurant = await Restaurant.findOne().sort({ createdAt: 1 });
  if (!restaurant) {
    return {
      credentials: { email: ADMIN.email, password: ADMIN.password },
      counts: { admin: 1, note: "no restaurant yet — run the vendor seed first" },
    };
  }

  const customers = await User.find({ role: "user" })
    .sort({ createdAt: 1 })
    .limit(6);

  const riders = await seedRiders();
  const categories = await seedCategories(restaurant);
  const transactions = await seedTransactions(restaurant);
  const wallets = await seedWallets(customers);
  const referrals = await seedReferrals(customers, restaurant);
  const marketing = await seedMarketing(admin);

  return {
    credentials: { email: ADMIN.email, password: ADMIN.password },
    counts: {
      admin: admin ? 1 : 0,
      riders,
      categories,
      transactions,
      wallets,
      referrals,
      campaigns: marketing.campaigns,
      notifications: marketing.notifications,
    },
  };
}

// Allow running standalone against an already-configured MONGODB_URI.
if (process.argv[1] && process.argv[1].endsWith("seed-admin-demo.mjs")) {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vinsta";
  await mongoose.connect(uri);
  const summary = await seedAdminDemo();
  console.log(summary);
  await mongoose.connection.close();
}
