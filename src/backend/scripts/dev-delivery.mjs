/**
 * One-command local API for the delivery-partner app.
 *
 * This machine has no MongoDB service and no Docker, but `mongodb-memory-server`
 * is already a dependency and ships a real mongod binary. This boots that binary
 * against a data directory that survives restarts, starts the API, and makes
 * sure a delivery partner exists to log in with.
 *
 *     npm run dev:delivery
 *
 * Differs from `dev:local` (which seeds the vendor demo into a throwaway
 * in-memory database) in two ways: the data persists in `~/.reditoe-dev-mongo`,
 * and the account it seeds is a rider rather than a vendor.
 *
 * Set MONGODB_URI in .env to use a real server or Atlas instead — this defers
 * to it. Delete `~/.reditoe-dev-mongo` for a clean slate.
 */

import "dotenv/config";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const log = (message) => console.log(`[dev:delivery] ${message}`);

/** The account the app logs in with. Dev-only credentials, by design. */
export const RIDER = {
  name: "Mohan Kumar",
  email: "mohankumar@reditoe.in",
  phone: "9876543210",
  password: "partner123",
};

let mongo;

if (process.env.MONGODB_URI) {
  log("MONGODB_URI is set — using it instead of the local database.");
} else {
  // Not inside the repo: this checkout lives under "D:\freelancer work\…", and
  // mongod fails to start when its --dbpath contains spaces. Keep the data on a
  // space-free path instead, overridable for anyone whose layout differs.
  const dbPath = process.env.DEV_MONGO_PATH || resolve(homedir(), ".reditoe-dev-mongo");
  mkdirSync(dbPath, { recursive: true });

  log("starting local MongoDB…");
  mongo = await MongoMemoryServer.create({
    instance: { dbName: "vinsta", dbPath, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = mongo.getUri("vinsta");
  log(`MongoDB ready (data in ${dbPath})`);
}

// server.js connects on import, so the URI has to be in place before this.
await import("../server.js");

const shutdown = async () => {
  await mongoose.connection.close().catch(() => {});
  await mongo?.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/** Wait for the connection to be open, not merely requested. */
async function connected(timeoutMs = 30_000) {
  const started = Date.now();
  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - started > timeoutMs) throw new Error("MongoDB did not connect");
    await new Promise((r) => setTimeout(r, 200));
  }
}

await connected();

const { default: User } = await import("../models/User.js");

// A rider is a User with role 'rider' — that is what `riderAuth` checks for.
let rider = await User.findOne({ email: RIDER.email });

if (!rider) {
  rider = await User.create({
    name: RIDER.name,
    email: RIDER.email,
    phone: RIDER.phone,
    password: RIDER.password, // hashed by the model's pre-save hook
    role: "rider",
    isVerified: true,
    isOnline: false,
  });
  log(`seeded delivery partner ${RIDER.email}`);
} else {
  log(`delivery partner ${RIDER.email} already present`);
}

/*
 * Give the partner something to deliver.
 *
 * The vendor demo already builds a restaurant with a book of orders, so rather
 * than inventing a second fixture set this reuses it and hands a few of those
 * orders to the rider. Best-effort: a failure here must not stop the API, since
 * an empty account is a legitimate state for the app to render.
 */
try {
  const { default: Order } = await import("../models/Order.js");

  const alreadyAssigned = await Order.countDocuments({ riderId: rider._id });

  if (alreadyAssigned === 0) {
    const { seedVendorDemo } = await import("./seed-vendor-demo.mjs");
    await seedVendorDemo();

    // Values must come from Order.status's enum — anything else fails validation.
    const stages = ["OnWay", "Ready", "Delivered", "Delivered", "Delivered"];
    const pool = await Order.find({ riderId: { $in: [null, undefined] } })
      .sort({ createdAt: -1 })
      .limit(stages.length);

    let saved = 0;
    for (const [index, order] of pool.entries()) {
      order.riderId = rider._id;
      order.status = stages[index];
      if (stages[index] === "Delivered") order.deliveredAt = new Date();
      try {
        await order.save();
        saved += 1;
      } catch (cause) {
        // Report it: a silently swallowed failure here reads as success and
        // leaves the app looking broken for no visible reason.
        log(`could not assign order ${order._id}: ${cause?.message ?? cause}`);
      }
    }

    log(`assigned ${saved} of ${pool.length} orders to ${RIDER.email}`);
  } else {
    log(`${alreadyAssigned} orders already assigned to ${RIDER.email}`);
  }
} catch (cause) {
  log(`could not seed orders (${cause?.message ?? cause}) — the app will show an empty account`);
}

/*
 * Money, documents and bank details.
 *
 * Earnings are what the Earnings screen and the wallet read; withdrawals are
 * the Payout screens; the KYC block is the Documents screen. Each is derived
 * from the orders above so the figures agree with the trips they came from.
 */
try {
  const { default: Order } = await import("../models/Order.js");
  const { default: RiderEarning } = await import("../models/RiderEarning.js");
  const { default: RiderWithdrawal } = await import("../models/RiderWithdrawal.js");

  const delivered = await Order.find({ riderId: rider._id, status: "Delivered" });

  if ((await RiderEarning.countDocuments({ riderId: rider._id })) === 0) {
    let made = 0;
    for (const order of delivered) {
      const fee = Number(order.deliveryFee) || 40;
      const incentive = 20;
      try {
        await RiderEarning.create({
          riderId: rider._id,
          orderId: order._id,
          restaurantId: order.restaurantId,
          deliveryFee: fee,
          incentive,
          totalEarning: fee + incentive,
          distance: 3.2,
          deliveryTime: 22,
          status: "earned",
        });
        made += 1;
      } catch (cause) {
        log(`could not record earning for ${order._id}: ${cause?.message ?? cause}`);
      }
    }
    log(`recorded ${made} earnings`);
  }

  const bankDetails = {
    accountHolderName: RIDER.name,
    accountNumber: "50100234565678",
    ifsc: "SBIN0001234",
    bankName: "State Bank of India",
    branch: "Tirupati Main",
  };

  if ((await RiderWithdrawal.countDocuments({ riderId: rider._id })) === 0) {
    const payouts = [
      { amount: 3250, status: "processing", daysAgo: 0 },
      { amount: 5780, status: "processed", daysAgo: 7 },
      { amount: 4960, status: "processed", daysAgo: 14 },
      { amount: 4250, status: "rejected", daysAgo: 28 },
    ];
    let made = 0;
    for (const [index, payout] of payouts.entries()) {
      const at = new Date(Date.now() - payout.daysAgo * 86_400_000);
      try {
        await RiderWithdrawal.create({
          withdrawalId: `PN12345${67890 + index}`,
          riderId: rider._id,
          amount: payout.amount,
          status: payout.status,
          bankDetails,
          createdAt: at,
          processedAt: payout.status === "processed" ? at : undefined,
        });
        made += 1;
      } catch (cause) {
        log(`could not record payout: ${cause?.message ?? cause}`);
      }
    }
    log(`recorded ${made} payouts`);
  }

  // Profile detail the Personal Information, Documents and Bank screens read.
  rider.dateOfBirth = rider.dateOfBirth ?? new Date("1998-05-16");
  rider.gender = rider.gender || "male";
  rider.vehicleType = rider.vehicleType || "bike";
  rider.vehicleName = rider.vehicleName || "Honda Activa 6G";
  rider.vehicleNumber = rider.vehicleNumber || "AP 03 BX 4417";
  rider.bankDetails = { ...(rider.bankDetails?.toObject?.() ?? {}), ...bankDetails, isVerified: true, verificationStatus: "verified" };
  rider.kycStatus = "approved";
  rider.kycDocuments = {
    ...(rider.kycDocuments?.toObject?.() ?? {}),
    aadhaar: "XXXX XXXX 5678",
    pan: "ABCDE1234F",
    drivingLicense: "TN02 20200012345",
    vehicleRC: "AP 03 BX 4417",
  };
  await rider.save();
  log("profile, bank details and KYC documents set");
} catch (cause) {
  log(`could not seed money/documents (${cause?.message ?? cause})`);
}

log("");
log("  Log in to the delivery app with:");
log(`    email    ${RIDER.email}`);
log(`    password ${RIDER.password}`);
log("");
