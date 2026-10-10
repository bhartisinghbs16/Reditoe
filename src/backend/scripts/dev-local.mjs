/**
 * One-command local API.
 *
 * MongoDB is not installed on every machine that needs to run this project, so
 * this boots an in-memory MongoDB (already a devDependency), points the server
 * at it, waits for the connection, and seeds a vendor account with a
 * restaurant, menu and orders.
 *
 *     npm run dev:local
 *
 * The database lives in memory: it starts clean and reseeds on every boot.
 * For data that survives a restart, set MONGODB_URI in .env to a real server
 * or an Atlas cluster and run `npm run dev` instead.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { seedVendorDemo } from "./seed-vendor-demo.mjs";
import { seedAdminDemo } from "./seed-admin-demo.mjs";

const log = (message) => console.log(`[dev:local] ${message}`);

if (process.env.MONGODB_URI) {
  log(`MONGODB_URI is already set — using it instead of the in-memory server.`);
} else {
  log("starting local MongoDB (first run downloads the mongod binary)…");

  /**
   * The data outlives the process.
   *
   * It used to be held in memory alone, so every restart produced a fresh
   * database with fresh ObjectIds. Anyone signed in was then holding a token
   * naming a user that no longer existed, and the next thing they pressed
   * answered "the user belonging to this token does not exist" — which is
   * exactly what it says, and tells them nothing they can act on.
   *
   * Writing to a directory keeps the accounts, and with them their ids, so a
   * restart no longer signs the whole platform out. The seed upserts users, so
   * re-running it against existing data updates them rather than duplicating.
   *
   * Set MONGODB_URI to use a real server instead; this branch is skipped then.
   */
  const dbPath = path.resolve(process.cwd(), ".mongo-data");
  fs.mkdirSync(dbPath, { recursive: true });

  const mongo = await MongoMemoryServer.create({
    instance: { dbName: "vinsta", dbPath, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = mongo.getUri("vinsta");
  log(`MongoDB ready at ${process.env.MONGODB_URI} (data in ${dbPath})`);

  // Stop the database with the process, or the mongod child outlives it.
  const shutdown = async () => {
    await mongoose.connection.close().catch(() => {});
    // Leave the files behind — that is the point of the directory.
    await mongo.stop({ doCleanup: false }).catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// server.js connects on import, so the URI has to be in place before this.
await import("../server.js");

// Seed once the connection is actually open, not merely requested.
if (mongoose.connection.readyState !== 1) {
  await new Promise((resolve, reject) => {
    mongoose.connection.once("open", resolve);
    mongoose.connection.once("error", reject);
  });
}

try {
  const summary = await seedVendorDemo();
  log("seeded demo data:");
  for (const [label, value] of Object.entries(summary.counts)) {
    log(`  ${label}: ${value}`);
  }
  // The admin seed builds on the vendor seed's output, so it runs after.
  const adminSummary = await seedAdminDemo();
  for (const [label, value] of Object.entries(adminSummary.counts)) {
    log(`  ${label}: ${value}`);
  }

  log("");
  log("  vendor login →  " + summary.credentials.email);
  log("  password     →  " + summary.credentials.password);
  log("");
  log("  admin login  →  " + adminSummary.credentials.email);
  log("  password     →  " + adminSummary.credentials.password);
  log("");
} catch (error) {
  console.error("[dev:local] seeding failed:", error.message);
  console.error(error.stack);
}
