/**
 * Fills an empty database with the demo accounts and catalogue.
 *
 *   MONGODB_URI="mongodb+srv://…" npm run seed:demo
 *
 * `npm run dev:local` does this on every boot against its in-memory database.
 * A deployed server does not: it connects to whatever MONGODB_URI points at
 * and leaves it alone, which is right for a database with real orders in it
 * and wrong for one that was created five minutes ago. A fresh Atlas cluster
 * starts out with no accounts at all, so there is nothing to sign in with and
 * no restaurants to order from until this has been run once.
 *
 * Running it twice is safe. The seeds update the records they own rather than
 * inserting second copies.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { seedVendorDemo } from "./seed-vendor-demo.mjs";
import { seedAdminDemo } from "./seed-admin-demo.mjs";

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error(
    "MONGODB_URI is not set. Point it at the database to seed:\n" +
      '  MONGODB_URI="mongodb+srv://…" npm run seed:demo'
  );
  process.exit(1);
}

// Guards against seeding demo accounts into something that is not a demo.
const target = uri.replace(/\/\/[^@]*@/, "//***@");
console.log(`seeding ${target}`);

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

try {
  const vendor = await seedVendorDemo();
  console.log("vendor demo:", vendor);

  const admin = await seedAdminDemo();
  console.log("admin demo:", admin);

  console.log(
    "\nSign in with:\n" +
      "  admin     admin@reditoe.com     Admin@12345\n" +
      "  vendor    vendor@reditoe.com    vendor123\n" +
      "  rider     rider@reditoe.com     Rider@12345\n" +
      "  customer  customer@reditoe.com  Customer@123\n"
  );
} finally {
  await mongoose.connection.close();
}
