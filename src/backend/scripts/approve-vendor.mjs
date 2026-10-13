/**
 * Approves a vendor's restaurant so customers can see it - the same change the
 * admin console's "Approve" button makes - without needing the console.
 *
 *   node scripts/approve-vendor.mjs 9219583594            # look only; changes nothing
 *   node scripts/approve-vendor.mjs 9219583594 --apply    # approve it
 *
 * It reads MONGODB_URI from the environment, or from backend/.env. THAT FILE
 * POINTS AT THE LIVE DATABASE, so the default is a dry run: it prints what it
 * found, what is stopping the restaurant from being listed, and exactly what
 * --apply would change. Only --apply writes, and only to this one vendor's
 * restaurant (pass --restaurant <id> if the owner has more than one).
 *
 * A vendor account that has NO restaurant (sign-up made the account and then
 * failed to make the restaurant) can be given one with --create. It builds the
 * record the vendor sign-up would have, owned by that account, and approves it:
 *
 *   node scripts/approve-vendor.mjs 9219583594 --create \
 *     --name "Hotel Name" --street "Main Road" --city Lucknow --zip 226001 \
 *     --cuisine "North Indian" --lat 26.9124 --lng 80.9462          # dry run
 *   ... the same line plus --apply                                   # creates it
 *
 * --name, --city, --lat and --lng are required: without a position the
 * restaurant cannot be checked against a customer's address and never appears.
 * It refuses if the account already has a restaurant.
 *
 * What approving does matches PATCH /admin/restaurants/:id/approve: status
 * becomes "approved", the restaurant is enabled, the decision is added to its
 * approval history, and a KYC that was "under_review" becomes "approved".
 * Nothing else is touched.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const restaurantFlag = args.indexOf('--restaurant');
const wantedRestaurant = restaurantFlag >= 0 ? args[restaurantFlag + 1] : null;
/** The value after a --flag, or undefined. */
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1].trim() : undefined;
};
const wantsCreate = args.includes('--create');
const digits = String(args.find((arg) => /^\+?[\d\s-]{10,}$/.test(arg)) ?? '')
  .replace(/\D/g, '')
  .slice(-10);

if (!/^[6-9]\d{9}$/.test(digits) || !process.env.MONGODB_URI) {
  console.error(
    'Usage: node scripts/approve-vendor.mjs <10-digit mobile> [--apply] [--restaurant <id>]\n' +
      'MONGODB_URI must be set (backend/.env is read automatically).'
  );
  process.exit(1);
}

// Never print the connection string back: it carries the password.
const host = process.env.MONGODB_URI.replace(/^[^@]*@/, '').split(/[/?]/)[0];
console.log(`${apply ? 'APPLYING' : 'Dry run'} against ${host}\n`);

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

try {
  const owners = await User.find({
    phone: { $in: [digits, `+91${digits}`, `91${digits}`] },
  }).select('name email phone role isBlocked accountVerified');

  if (owners.length === 0) {
    console.error(`No account has the number ${digits}.`);
    process.exitCode = 1;
  }

  let restaurantsSeen = 0;

  for (const owner of owners) {
    console.log(
      `Account   ${owner.name} <${owner.email}>  role=${owner.role}  blocked=${!!owner.isBlocked}  verified=${owner.accountVerified !== false}`
    );
    if (owner.role !== 'vendor') {
      console.log('          not a vendor account - skipping\n');
      continue;
    }

    let restaurants = await Restaurant.find({ owner: owner._id });
    if (wantedRestaurant) restaurants = restaurants.filter((r) => String(r._id) === wantedRestaurant);
    if (restaurants.length === 0) console.log('          no restaurant found for this account\n');

    if (restaurants.length === 0 && wantsCreate) {
      const name = flag('name');
      const city = flag('city');
      const latitude = Number(flag('lat'));
      const longitude = Number(flag('lng'));
      const problems = [];
      if (!name) problems.push('--name "Hotel Name"');
      if (!city) problems.push('--city <city>');
      if (!(latitude >= 6 && latitude <= 38)) problems.push('--lat <latitude, e.g. 26.9124>');
      if (!(longitude >= 68 && longitude <= 98)) problems.push('--lng <longitude, e.g. 80.9462>');
      if (problems.length) {
        console.error(`          cannot create the restaurant yet - still needed: ${problems.join('  ')}`);
        process.exitCode = 1;
        continue;
      }

      const record = {
        name,
        owner: owner._id,
        status: 'approved',
        isEnabled: true,
        phone: `+91${digits}`,
        categories: [flag('cuisine') || 'Fast Food'],
        address: {
          street: flag('street') || '',
          city,
          zipCode: flag('zip') || '',
          coordinates: { latitude, longitude },
        },
        description: name,
        openingHours: '9:00 AM - 10:00 PM',
        deliveryTime: '30-45 min',
        deliveryFee: 40,
      };
      console.log(
        `          would create "${name}" in ${city} at ${latitude}, ${longitude}, owned by this account, approved and enabled`
      );

      if (!apply) {
        console.log('          (dry run - add --apply to create it)\n');
        restaurantsSeen += 1;
        continue;
      }

      const created = await Restaurant.create({
        ...record,
        approvalHistory: [{ status: 'approved', by: 'scripts/approve-vendor.mjs', at: new Date() }],
        statusChangedAt: new Date(),
      });
      restaurantsSeen += 1;
      console.log(`          CREATED ${created._id} (${created.outletId}) - approved and enabled.\n`);
      continue;
    }

    if (restaurants.length > 0 && wantsCreate) {
      console.error('          this account already has a restaurant; --create does nothing here.');
      process.exitCode = 1;
    }

    if (restaurants.length > 1 && apply) {
      console.error(
        `          this vendor has ${restaurants.length} restaurants; pass --restaurant <id> to say which:\n` +
          restaurants.map((r) => `            ${r._id}  ${r.name}`).join('\n')
      );
      process.exitCode = 1;
      continue;
    }

    restaurantsSeen += restaurants.length;

    for (const restaurant of restaurants) {
      const menuItems = await FoodItem.countDocuments({ restaurantId: restaurant._id });
      const c = restaurant.address?.coordinates;
      const hasLocation =
        Number.isFinite(Number(c?.latitude)) &&
        Number.isFinite(Number(c?.longitude)) &&
        !(Number(c.latitude) === 0 && Number(c.longitude) === 0);

      console.log(`Restaurant ${restaurant._id}  "${restaurant.name}"`);
      console.log(
        `          status=${restaurant.status}  enabled=${restaurant.isEnabled}  open=${restaurant.isOpen}  kyc=${restaurant.kycStatus}  menu items=${menuItems}`
      );

      const blockers = [];
      if (restaurant.status !== 'approved') blockers.push(`status is "${restaurant.status}", not approved`);
      if (restaurant.isEnabled !== true) blockers.push('it is not enabled');
      if (restaurant.isApproved === false) blockers.push('isApproved is false');
      if (restaurant.isActive === false) blockers.push('isActive is false');
      if (!hasLocation) blockers.push('no delivery location (coordinates) - customers cannot be checked against it');
      if (menuItems === 0) blockers.push('the menu is empty, so there is nothing to order');
      if (restaurant.isOpen === false) blockers.push('it is switched to closed (listed, but not orderable)');
      if (owner.isBlocked) blockers.push('the owner account is suspended');
      console.log(blockers.length ? `          blockers: ${blockers.join('; ')}` : '          nothing is in the way');

      const needsApproval =
        restaurant.status !== 'approved' || restaurant.isEnabled !== true;
      if (!needsApproval) {
        console.log('          already approved and enabled - nothing to change\n');
        continue;
      }

      console.log(
        `          would set: status ${restaurant.status} -> approved, enabled ${restaurant.isEnabled} -> true` +
          (restaurant.kycStatus === 'under_review' ? ', kyc under_review -> approved' : '')
      );

      if (!apply) {
        console.log('          (dry run - add --apply to make the change)\n');
        continue;
      }

      restaurant.status = 'approved';
      restaurant.statusReason = undefined;
      restaurant.statusChangedAt = new Date();
      restaurant.isEnabled = true;
      if (restaurant.kycStatus === 'under_review') restaurant.kycStatus = 'approved';
      restaurant.approvalHistory = restaurant.approvalHistory || [];
      restaurant.approvalHistory.push({
        status: 'approved',
        by: 'scripts/approve-vendor.mjs',
        at: new Date(),
      });
      await restaurant.save();
      console.log('          APPROVED and enabled.\n');
    }
  }

  /*
   * An account with a number but no restaurant is what is left when sign-up
   * created the account and then failed to create the restaurant. Before
   * assuming that, look for the restaurant elsewhere - listed under another
   * owner, or under this number only in its contact field. Read-only: nothing
   * found here is ever approved, since approving a restaurant its owner cannot
   * see would not get it listed.
   */
  if (restaurantsSeen === 0) {
    const pick = 'name status isEnabled owner phone createdAt';
    const byPhone = await Restaurant.find({ phone: new RegExp(`${digits}$`) }).select(pick).lean();
    const recent = await Restaurant.find({}).sort({ createdAt: -1 }).limit(5).select(pick).lean();

    const ownerIds = [...byPhone, ...recent].map((r) => r.owner).filter(Boolean);
    const people = new Map(
      (await User.find({ _id: { $in: ownerIds } }).select('name email phone role').lean()).map((u) => [
        String(u._id),
        u,
      ])
    );
    const describe = (r) => {
      const who = people.get(String(r.owner));
      return (
        `  ${r._id}  "${r.name}"  status=${r.status}  enabled=${r.isEnabled}  contact=${r.phone || '-'}  ` +
        `created=${r.createdAt?.toISOString?.().slice(0, 16) ?? '?'}  owner=${
          who ? `${who.name} <${who.email}> ${who.phone || ''}` : r.owner ? String(r.owner) : 'none'
        }`
      );
    };

    console.log('\nNo restaurant is owned by that account. Looking wider (read-only):');
    console.log(
      byPhone.length
        ? `Restaurants whose contact number ends ${digits}:\n${byPhone.map(describe).join('\n')}`
        : `Restaurants whose contact number ends ${digits}: none`
    );
    console.log(`\nThe five most recently created restaurants:\n${recent.map(describe).join('\n') || '  (none)'}`);
    console.log(
      '\nIf the hotel is not listed above, its registration never produced a restaurant ' +
        'record, so there is nothing to approve yet.'
    );
  }
} finally {
  await mongoose.disconnect();
}
