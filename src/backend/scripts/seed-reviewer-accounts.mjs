/**
 * Creates the three test accounts Google Play reviewers sign in with - one
 * customer, one vendor, one delivery partner - so the apps can be reviewed
 * without a real phone number.
 *
 *   node scripts/seed-reviewer-accounts.mjs --user 9000000001 --vendor 9000000002 --rider 9000000003
 *   ... plus --apply to write
 *
 * Dry run by default. backend/.env POINTS AT THE LIVE DATABASE, so nothing is
 * written without --apply. It never deletes, and it leaves an existing account
 * with that number alone (it only reports it).
 *
 * Use numbers nobody owns (a reviewer number must not belong to a real
 * customer), and a different number for each app - one number cannot be two
 * kinds of account.
 *
 * After running it:
 *   1. On the server set
 *        REVIEWER_LOGINS=user:<customer>,vendor:<vendor>,rider:<rider>
 *        REVIEWER_OTP=<any six digits you choose>
 *      Those three numbers then accept that code in the matching app; every
 *      other number is unaffected. Remove REVIEWER_OTP to switch them off.
 *   2. Give the vendor something to review by running seed-test-restaurant.mjs
 *      with --vendor <the vendor number> (see that script's header).
 *   3. Put the three numbers and the code in Play Console > App access.
 */
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1].trim() : undefined;
};

const wanted = [
  { role: 'user', phone: flag('user'), name: 'Play Reviewer (Customer)' },
  { role: 'vendor', phone: flag('vendor'), name: 'Play Reviewer (Vendor)' },
  { role: 'rider', phone: flag('rider'), name: 'Play Reviewer (Delivery)' },
].filter((entry) => entry.phone);

const bad = wanted.filter((entry) => !/^[6-9]\d{9}$/.test(entry.phone));
if (wanted.length === 0 || bad.length || !process.env.MONGODB_URI) {
  console.error(
    'Usage: node scripts/seed-reviewer-accounts.mjs --user <mobile> --vendor <mobile> --rider <mobile> [--apply]\n' +
      '10-digit Indian mobiles; MONGODB_URI must be set (backend/.env is read automatically).'
  );
  process.exit(1);
}
if (new Set(wanted.map((entry) => entry.phone)).size !== wanted.length) {
  console.error('Each app needs its own number.');
  process.exit(1);
}

const host = process.env.MONGODB_URI.replace(/^[^@]*@/, '').split(/[/?]/)[0];
console.log(`${apply ? 'APPLYING' : 'Dry run'} against ${host}\n`);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

try {
  for (const { role, phone, name } of wanted) {
    const found = await User.find({ phone: { $in: [phone, `+91${phone}`, `91${phone}`] } }).select('name role');
    if (found.length) {
      console.log(`${role.padEnd(7)} ${phone}  already used by "${found[0].name}" (role ${found[0].role}) - left alone`);
      if (found[0].role !== role) process.exitCode = 1;
      continue;
    }

    const record = {
      name,
      email: `reviewer.${role}.${phone}@reviewer.reditoe.com`,
      phone,
      role,
      // A password nobody knows: sign-in is by code only.
      password: crypto.randomBytes(24).toString('hex'),
      accountVerified: true,
      isProfileComplete: true,
    };

    if (role === 'user') {
      record.savedAddresses = [
        {
          label: 'Home',
          street: 'Madiyaon, Sitapur Road',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          zipCode: '226021',
          coordinates: { latitude: 26.91, longitude: 80.942 },
        },
      ];
    }

    if (role === 'rider') {
      record.riderId = `RID-REVIEW${phone.slice(-4)}`;
      record.kycStatus = 'approved';
      record.vehicleType = 'bike';
      record.vehicleNumber = 'UP32 RV 0001';
    }

    console.log(`${role.padEnd(7)} ${phone}  would create "${name}"`);
    if (apply) {
      const created = await User.create(record);
      console.log(`        CREATED ${created._id}`);
    }
  }

  if (!apply) console.log('\n(dry run - add --apply to create them)');
} finally {
  await mongoose.disconnect();
}
