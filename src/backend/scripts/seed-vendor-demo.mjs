/**
 * Demo data for the vendor app.
 *
 * Creates one vendor with a restaurant, a menu and a spread of orders across
 * every status the vendor screens filter by, so the app has real data to
 * render the moment it connects. Idempotent: re-running replaces the demo rows
 * rather than duplicating them.
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Restaurant from "../models/Restaurant.js";
import FoodItem from "../models/FoodItem.js";
import Order from "../models/Order.js";
import Coupon from "../models/Coupon.js";

const VENDOR = {
  name: "Corner Kitchen",
  email: "vendor@reditoe.com",
  password: "vendor123",
  phone: "9876543210",
};

const CUSTOMERS = [
  { name: "Ravi Kumar", email: "ravi.demo@reditoe.com", phone: "9876500001" },
  { name: "Suresh Babu", email: "suresh.demo@reditoe.com", phone: "9876500002" },
  { name: "Anitha Reddy", email: "anitha.demo@reditoe.com", phone: "9876500003" },
  { name: "Pradeep Yadav", email: "pradeep.demo@reditoe.com", phone: "9876500004" },
  { name: "Venkatesh B", email: "venkatesh.demo@reditoe.com", phone: "9876500005" },
  { name: "Kavya Sri", email: "kavya.demo@reditoe.com", phone: "9876500006" },
];

const MENU = [
  { name: "Chicken Biryani", price: 249, category: "Biryani", isVeg: false, sold: 14 },
  { name: "Paneer Butter Masala", price: 219, category: "Main Course", isVeg: true, sold: 9 },
  { name: "Butter Pav (4 pcs)", price: 49, category: "Breads", isVeg: true, sold: 21 },
  { name: "Mutton Rogan Josh", price: 389, category: "Main Course", isVeg: false, sold: 0, unavailable: true },
  { name: "Punjabi Samosa (2 pcs)", price: 89, category: "Starters", isVeg: true, sold: 17 },
  { name: "Veg Thali", price: 259, category: "Main Course", isVeg: true, sold: 6 },
  { name: "Veg Hakka Noodles", price: 189, category: "Chinese", isVeg: true, sold: 8 },
  { name: "Idli Sambar (3 pcs)", price: 129, category: "South Indian", isVeg: true, sold: 11 },
];

/** Orders spread across the statuses the vendor screens tab between. */
const ORDERS = [
  { customer: 0, status: "Waiting for Confirmation", minutesAgo: 5, payment: "COD", lines: [["Chicken Biryani", 2], ["Butter Pav (4 pcs)", 1]] },
  { customer: 1, status: "Waiting for Confirmation", minutesAgo: 12, payment: "Online", lines: [["Paneer Butter Masala", 1], ["Punjabi Samosa (2 pcs)", 1]] },
  { customer: 2, status: "Processing", minutesAgo: 21, payment: "COD", lines: [["Veg Hakka Noodles", 1], ["Idli Sambar (3 pcs)", 2]] },
  { customer: 3, status: "Ready", minutesAgo: 38, payment: "Online", lines: [["Veg Thali", 1], ["Butter Pav (4 pcs)", 2]] },
  { customer: 4, status: "OnWay", minutesAgo: 62, payment: "Online", lines: [["Mutton Rogan Josh", 1], ["Idli Sambar (3 pcs)", 1]] },
  { customer: 5, status: "Cancelled", minutesAgo: 95, payment: "Online", lines: [["Punjabi Samosa (2 pcs)", 2]] },
  { customer: 0, status: "Delivered", minutesAgo: 140, payment: "Online", lines: [["Chicken Biryani", 1]] },
  { customer: 2, status: "Delivered", minutesAgo: 190, payment: "COD", lines: [["Veg Thali", 2], ["Punjabi Samosa (2 pcs)", 1]] },
];

/** One street per demo customer, so orders don't all share an address. */
const CUSTOMER_STREETS = [
  "12-5-124, Near Bus Stand",
  "18-3-45, Padmavathi Nagar",
  "2-8-10, Renigunta Road",
  "19-6-88, Leela Mahal Road",
  "7-1-33, Old Airport Road",
  "5-2-19, Korlagunta",
];

/**
 * Coupons across the three states the Offers screen tabs between. `daysFrom`
 * is relative to seed time so the demo never silently goes stale.
 */
const COUPONS = [
  { code: "FLAT20", name: "Flat 20% OFF", description: "Flat 20% OFF on orders above ₹199", type: "percentage", discountValue: 20, maxDiscount: 200, minOrderValue: 199, usageLimit: 500, usedCount: 48, startsIn: -6, endsIn: 7 },
  { code: "WELCOME50", name: "₹50 OFF first order", description: "₹50 OFF on your first order", type: "flat", discountValue: 50, minOrderValue: 149, usageLimit: 1000, usedCount: 32, startsIn: -12, endsIn: 12, userType: "new_user" },
  { code: "WEEKEND15", name: "Weekend 15% OFF", description: "15% OFF on all orders", type: "percentage", discountValue: 15, maxDiscount: 150, minOrderValue: 249, usageLimit: 300, usedCount: 26, startsIn: -3, endsIn: 8 },
  { code: "FREESHIP", name: "Free delivery", description: "Free delivery on orders above ₹199", type: "flat", discountValue: 40, minOrderValue: 199, usageLimit: 400, usedCount: 56, startsIn: -9, endsIn: 13 },
  { code: "SUMMER25", name: "Summer 25% OFF", description: "25% OFF on orders above ₹299", type: "percentage", discountValue: 25, maxDiscount: 250, minOrderValue: 299, usageLimit: 200, usedCount: 0, startsIn: 5, endsIn: 25 },
  { code: "MEALDEAL", name: "Combo 10% OFF", description: "10% OFF on combo meals", type: "percentage", discountValue: 10, maxDiscount: 100, minOrderValue: 349, usageLimit: 150, usedCount: 12, startsIn: -30, endsIn: -2 },
];

const DELIVERY_FEE = 40;
const PACKAGING_FEE = 20;
const GST_RATE = 0.05;

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000);

/**
 * `User.create` runs the password hashing hook; `insertMany` would not, so
 * accounts are created one at a time on purpose.
 */
async function upsertUser({ name, email, password, phone, role }) {
  const existing = await User.findOne({ email });
  if (existing) return existing;

  return User.create({
    name,
    email,
    password,
    phone,
    role,
    isVerified: true,
    isEmailVerified: true,
    isPhoneVerified: true,
  });
}

export async function seedVendorDemo() {
  const vendor = await upsertUser({ ...VENDOR, role: "vendor" });

  const customers = [];
  for (const customer of CUSTOMERS) {
    customers.push(
      await upsertUser({ ...customer, password: "customer123", role: "user" })
    );
  }

  let restaurant = await Restaurant.findOne({ owner: vendor._id });
  if (!restaurant) {
    restaurant = await Restaurant.create({
      name: "Corner Kitchen",
      owner: vendor._id,
      description: "North Indian and Chinese, cooked to order.",
      cuisine: ["North Indian", "Chinese"],
      // Restaurant.address is a nested document, not a string.
      address: {
        street: "18 Tiruchanoor Road",
        city: "Tirupati",
        state: "Andhra Pradesh",
        zipCode: "517501",
        coordinates: { latitude: 13.6288, longitude: 79.4192 },
      },
      phone: VENDOR.phone,
      email: VENDOR.email,
      isActive: true,
      isOpen: true,
      status: "approved",
      isApproved: true,
      rating: 4.6,
      location: { type: "Point", coordinates: [79.4192, 13.6288] },
    });
  }

  // Menu — replace wholesale so edits during a session don't accumulate.
  await FoodItem.deleteMany({ restaurantId: restaurant._id });
  const items = await FoodItem.insertMany(
    MENU.map((item) => ({
      name: item.name,
      price: item.price,
      restaurantId: restaurant._id,
      category: item.category,
      description: `${item.name} — freshly prepared.`,
      isVeg: item.isVeg,
      isAvailable: !item.unavailable,
      isActive: !item.unavailable,
      rating: 4.5,
    }))
  );

  const bySlug = new Map(items.map((item) => [item.name, item]));

  await Order.deleteMany({ restaurantId: restaurant._id });
  const orders = [];
  for (const spec of ORDERS) {
    const lines = spec.lines.map(([name, quantity]) => {
      const item = bySlug.get(name);
      return {
        foodItemId: item._id,
        name: item.name,
        quantity,
        price: item.price,
      };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const tax = Math.round(subtotal * GST_RATE * 100) / 100;
    const placedAt = minutesAgo(spec.minutesAgo);
    const customer = customers[spec.customer];

    orders.push({
      userId: customer._id,
      restaurantId: restaurant._id,
      items: lines,
      subtotal,
      tax,
      deliveryFee: DELIVERY_FEE,
      packagingFee: PACKAGING_FEE,
      total: subtotal + tax + DELIVERY_FEE + PACKAGING_FEE,
      status: spec.status,
      // Order.paymentMethod/paymentStatus enums are lowercase.
      paymentMethod: spec.payment === "COD" ? "cod" : "razorpay",
      paymentStatus: spec.payment === "COD" ? "pending" : "paid",
      // Order.deliveryAddress is street/city/state/zipCode — anything else
      // (name, phone, "address") is silently dropped by the schema.
      deliveryAddress: {
        street: CUSTOMER_STREETS[spec.customer % CUSTOMER_STREETS.length],
        city: "Tirupati",
        state: "Andhra Pradesh",
        zipCode: "517501",
        coordinates: { latitude: 13.6288, longitude: 79.4192 },
      },
      createdAt: placedAt,
      updatedAt: placedAt,
    });
  }

  // `create` validates each document and reports the offending field, which
  // insertMany's bulk error does not.
  await Order.create(orders);

  // Coupons — scoped to this restaurant so the vendor endpoint returns them.
  await Coupon.deleteMany({ applicableRestaurants: restaurant._id });
  const daysFromNow = (days) => new Date(Date.now() + days * 86_400_000);

  // `code` is unique across the collection, so a coupon another seed already
  // created would abort the whole batch. Clear ours by code first.
  await Coupon.deleteMany({ code: { $in: COUPONS.map((c) => c.code) } });

  const createdCoupons = await Coupon.create(
    COUPONS.map((coupon) => ({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      type: coupon.type,
      discountValue: coupon.discountValue,
      maxDiscount: coupon.maxDiscount,
      minOrderValue: coupon.minOrderValue,
      usageLimit: coupon.usageLimit,
      usedCount: coupon.usedCount,
      startDate: daysFromNow(coupon.startsIn),
      endDate: daysFromNow(coupon.endsIn),
      userType: coupon.userType ?? "all",
      isActive: true,
      isPublic: true,
      isGlobal: false,
      applicableRestaurants: [restaurant._id],
      createdBy: vendor._id,
    }))
  );

  return {
    credentials: { email: VENDOR.email, password: VENDOR.password },
    counts: {
      vendor: 1,
      customers: customers.length,
      restaurant: restaurant.name,
      menuItems: items.length,
      orders: orders.length,
      // What was actually written, not what was asked for.
      coupons: createdCoupons.length,
    },
  };
}

// Allow running standalone against an already-configured MONGODB_URI.
if (process.argv[1] && process.argv[1].endsWith("seed-vendor-demo.mjs")) {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vinsta";
  await mongoose.connect(uri);
  const summary = await seedVendorDemo();
  console.log(summary);
  await mongoose.connection.close();
}
