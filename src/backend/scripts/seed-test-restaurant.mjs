/**
 * Adds one orderable test restaurant - with a menu and a couple of coupons - so
 * the customer app has something to place an order against.
 *
 *   node scripts/seed-test-restaurant.mjs --lat 13.6288 --lng 79.4192 \
 *        --vendor 9219583594 --customer 9876543210            # dry run: changes nothing
 *   ... the same line plus --apply                            # writes it
 *
 * It reads MONGODB_URI from the environment, or from backend/.env. THAT FILE
 * POINTS AT THE LIVE DATABASE, so the default is a dry run: it prints exactly
 * what --apply would add. Only --apply writes.
 *
 * Unlike seed-demo / seed-vendor-demo this never deletes anything: no orders,
 * no menu items, no coupons are removed, and nothing that already exists is
 * overwritten. Running it again adds only what is missing.
 *
 * Flags
 *   --lat, --lng     REQUIRED. Where the restaurant is. Put it within a couple of
 *                    kilometres of the address you will order to - delivery is
 *                    refused beyond the restaurant's radius (8 km here, and the
 *                    platform caps every restaurant at 10 km). Right-click the
 *                    spot in Google Maps and click the coordinates to copy them.
 *   --vendor <mobile>  The vendor account that will run it (so you can accept the
 *                    order and mark it ready in the vendor app). Strongly advised:
 *                    without an owner nobody can confirm the order. Refused if that
 *                    account already owns a different restaurant.
 *   --customer <mobile>  Switches cash on delivery on for this customer account,
 *                    which is off for everyone until an admin enables it.
 *   --name, --city, --state, --zip, --street   Defaults: "Reditoe Test Kitchen",
 *                    Tirupati, Andhra Pradesh. Set --city to where you are testing.
 *   --apply          Write the changes.
 *
 * What makes the restaurant orderable (all of it is set here): approved +
 * enabled + active + open, a location, a delivery radius, and available dishes.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import Coupon from '../models/Coupon.js';
import { cityIsOpen } from '../services/serviceabilityService.js';

/** Fixed, so a second run finds the restaurant instead of making another. */
export const TEST_OUTLET_ID = 'RES-TESTKTCH';

const TEST_COUPON_CODES = ['TEST20', 'TESTFLAT50'];

/**
 * Prices are picked so each coupon is reachable: TESTFLAT50 needs 149 of food,
 * TEST20 needs 199 (a Chicken Biryani alone clears it, a Masala Dosa alone does
 * not - handy for seeing the "minimum order" message).
 */
const MENU = [
  {
    name: 'Chicken Biryani',
    price: 249,
    category: 'Biryani',
    foodType: 'non-veg',
    description: 'Dum-cooked basmati with tender chicken, served with raita.',
    preparationTime: 20,
    modifierGroups: [
      {
        name: 'Portion',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        priceMode: 'absolute',
        options: [
          { name: 'Half', price: 249, isDefault: true },
          { name: 'Full', price: 399 },
        ],
      },
      {
        name: 'Extras',
        required: false,
        minSelect: 0,
        maxSelect: 2,
        priceMode: 'surcharge',
        options: [
          { name: 'Extra raita', price: 20 },
          { name: 'Boiled egg', price: 15 },
        ],
      },
    ],
  },
  {
    name: 'Veg Biryani',
    price: 189,
    category: 'Biryani',
    foodType: 'veg',
    description: 'Fragrant rice layered with seasonal vegetables and herbs.',
    preparationTime: 20,
  },
  {
    name: 'Paneer Butter Masala',
    price: 219,
    category: 'Main Course',
    foodType: 'veg',
    description: 'Cottage cheese in a rich tomato-butter gravy.',
    preparationTime: 15,
  },
  {
    name: 'Butter Naan',
    price: 45,
    category: 'Breads',
    foodType: 'veg',
    description: 'Soft tandoor-baked naan brushed with butter.',
    preparationTime: 8,
  },
  {
    name: 'Veg Thali',
    price: 259,
    category: 'Main Course',
    foodType: 'veg',
    description: 'Dal, two sabzis, rice, roti, salad and a sweet.',
    preparationTime: 15,
  },
  {
    name: 'Masala Dosa',
    price: 119,
    category: 'South Indian',
    foodType: 'veg',
    description: 'Crisp dosa with spiced potato filling, sambar and chutneys.',
    preparationTime: 12,
  },
  {
    name: 'Idli Sambar (3 pcs)',
    price: 79,
    category: 'South Indian',
    foodType: 'veg',
    description: 'Steamed idlis with sambar and coconut chutney.',
    preparationTime: 10,
  },
  {
    name: 'Chicken 65',
    price: 179,
    category: 'Starters',
    foodType: 'non-veg',
    description: 'Spicy deep-fried chicken bites with curry leaves.',
    preparationTime: 15,
  },
  {
    name: 'Veg Hakka Noodles',
    price: 159,
    category: 'Chinese',
    foodType: 'veg',
    description: 'Wok-tossed noodles with crunchy vegetables.',
    preparationTime: 12,
  },
  {
    name: 'Fresh Lime Soda',
    price: 49,
    category: 'Beverages',
    foodType: 'veg',
    description: 'Sweet, salted or mixed - cold and fizzy.',
    preparationTime: 3,
  },
  {
    // Switched off: customers never see it, but the vendor app lists it as
    // unavailable, so the on/off toggle can be tried there.
    name: 'Mutton Rogan Josh',
    price: 389,
    category: 'Main Course',
    foodType: 'non-veg',
    description: 'Slow-cooked Kashmiri mutton curry.',
    preparationTime: 30,
    isAvailable: false,
  },
];

const daysFromNow = (days) => new Date(Date.now() + days * 86_400_000);

/** Every way a 10-digit Indian mobile might be stored. */
const phoneVariants = (digits) => [digits, `+91${digits}`, `91${digits}`];

/**
 * Plans and, with `apply`, performs the seed. Takes an already-open mongoose
 * connection, so the tests can run it against an in-memory database. Returns a
 * list of what was (or would be) done, and any problems that stopped it.
 */
export async function seedTestRestaurant(options, { apply = false } = {}) {
  const {
    name = 'Reditoe Test Kitchen',
    city = 'Tirupati',
    state = 'Andhra Pradesh',
    zip = '517501',
    street = '1 Test Street',
    latitude,
    longitude,
    vendor: vendorPhone,
    customer: customerPhone,
  } = options;

  const actions = [];
  const warnings = [];
  const problems = [];
  const say = (line) => actions.push(line);

  if (!(latitude >= 6 && latitude <= 38) || !(longitude >= 68 && longitude <= 98)) {
    problems.push('--lat and --lng are required and must be in India (lat 6-38, lng 68-98).');
    return { actions, warnings, problems };
  }

  /* ── The vendor account that will own it ─────────────────────────────── */
  let owner = null;
  if (vendorPhone) {
    owner = await User.findOne({ phone: { $in: phoneVariants(vendorPhone) } });
    if (!owner) problems.push(`No account has the vendor number ${vendorPhone}.`);
    else if (owner.role !== 'vendor') problems.push(`${vendorPhone} is a "${owner.role}" account, not a vendor.`);
  } else {
    warnings.push(
      'No --vendor given: the restaurant will have no owner, so nobody can confirm the order in the vendor app.'
    );
  }

  let restaurant = await Restaurant.findOne({ outletId: TEST_OUTLET_ID });

  if (owner && !problems.length) {
    const theirs = await Restaurant.find({ owner: owner._id }).select('name outletId');
    const other = theirs.filter((r) => r.outletId !== TEST_OUTLET_ID);
    if (other.length) {
      // The vendor app loads "the" restaurant for an owner; a second one would
      // make it ambiguous which the vendor is looking at.
      problems.push(
        `That vendor already owns "${other[0].name}" (${other[0].outletId}). ` +
          'Use a vendor with no restaurant, or run without --vendor.'
      );
    }
  }

  /* ── The customer who will order ─────────────────────────────────────── */
  let customer = null;
  if (customerPhone) {
    customer = await User.findOne({ phone: { $in: phoneVariants(customerPhone) } });
    if (!customer) problems.push(`No account has the customer number ${customerPhone}.`);
  }

  if (problems.length) return { actions, warnings, problems };

  /* ── Is the city one customers can order in? ─────────────────────────── */
  const probe = { address: { city, state } };
  const cityState = await cityIsOpen(probe);
  if (!cityState.open) {
    warnings.push(
      `A service area for ${city} exists and is switched OFF, so every order there is refused. ` +
        'Turn it on in the admin console (Service Areas) or choose another --city.'
    );
  }

  /* ── The restaurant ──────────────────────────────────────────────────── */
  const fields = {
    name,
    // Only set when given, so a re-run without --vendor never un-owns it.
    ...(owner ? { owner: owner._id, phone: owner.phone } : {}),
    description: 'Test kitchen for trying out ordering, billing and tracking.',
    categories: ['Biryani', 'North Indian', 'South Indian', 'Chinese'],
    foodType: 'both',
    address: { street, city, state, zipCode: zip, coordinates: { latitude, longitude } },
    // Orderable: approved + enabled + approved flag + active + open.
    status: 'approved',
    isEnabled: true,
    isApproved: true,
    isActive: true,
    isOpen: true,
    kycStatus: 'approved',
    // The platform caps customer delivery at 10 km whatever this says.
    deliveryRadius: 8,
    deliveryFee: 40,
    // Shown as its own line on the bill, which is what the billing check wants.
    dailyPackagingFee: 15,
    estimatedDeliveryMinutes: 25,
    deliveryTime: '25-35 min',
    openingHours: 'Open 24 hours',
    rating: 4.5,
  };

  if (!restaurant) {
    say(`create restaurant "${name}" (${TEST_OUTLET_ID}) in ${city} at ${latitude}, ${longitude}` +
      `${owner ? `, owned by ${owner.name}` : ', no owner'}`);
    if (apply) {
      restaurant = await Restaurant.create({
        ...fields,
        outletId: TEST_OUTLET_ID,
        statusChangedAt: new Date(),
        approvalHistory: [{ status: 'approved', by: 'scripts/seed-test-restaurant.mjs', at: new Date() }],
      });
    }
  } else {
    // Re-running moves it to the new position and makes sure it is still
    // orderable; menu items and coupons are left alone below.
    say(`update existing restaurant ${restaurant._id}: location ${latitude}, ${longitude}, ` +
      'approved/enabled/open, delivery radius 8 km');
    if (apply) {
      Object.assign(restaurant, fields);
      await restaurant.save();
    }
  }

  /* ── The menu: only dishes that are not there yet ────────────────────── */
  const existingNames = new Set(
    restaurant
      ? (await FoodItem.find({ restaurantId: restaurant._id }).select('name').lean()).map((i) => i.name)
      : []
  );
  const missing = MENU.filter((dish) => !existingNames.has(dish.name));
  say(
    missing.length
      ? `add ${missing.length} menu item(s): ${missing.map((d) => d.name).join(', ')}`
      : 'menu already complete - nothing to add'
  );
  if (apply && restaurant && missing.length) {
    await FoodItem.create(
      missing.map((dish) => ({
        isAvailable: true,
        ...dish,
        restaurantId: restaurant._id,
      }))
    );
  }

  /* ── Coupons: only codes that do not exist yet ───────────────────────── */
  const couponCreator =
    owner ?? (await User.findOne({ role: 'admin' })) ?? customer ?? null;
  const existingCodes = new Set(
    (await Coupon.find({ code: { $in: TEST_COUPON_CODES } }).select('code').lean()).map((c) => c.code)
  );
  const couponSpecs = [
    {
      code: 'TEST20',
      name: 'Test 20% OFF',
      description: '20% OFF on orders above ₹199 (up to ₹100) - test restaurant only',
      type: 'percentage',
      discountValue: 20,
      maxDiscount: 100,
      minOrderValue: 199,
    },
    {
      code: 'TESTFLAT50',
      name: 'Test ₹50 OFF',
      description: '₹50 OFF on orders above ₹149 - test restaurant only',
      type: 'flat',
      discountValue: 50,
      minOrderValue: 149,
    },
  ].filter((spec) => !existingCodes.has(spec.code));

  if (!couponSpecs.length) {
    say('coupons TEST20 and TESTFLAT50 already exist - nothing to add');
  } else if (!couponCreator) {
    warnings.push('No vendor, admin or customer account to attribute the coupons to - coupons skipped.');
  } else {
    say(`add coupon(s): ${couponSpecs.map((c) => c.code).join(', ')} (this restaurant only, valid 90 days)`);
    if (apply && restaurant) {
      await Coupon.create(
        couponSpecs.map((spec) => ({
          ...spec,
          usageLimit: 1000,
          startDate: new Date(),
          endDate: daysFromNow(90),
          userType: 'all',
          isActive: true,
          isPublic: true,
          isGlobal: false,
          applicableRestaurants: [restaurant._id],
          createdBy: couponCreator._id,
        }))
      );
    }
  }

  /* ── Cash on delivery for the tester ─────────────────────────────────── */
  if (customer) {
    if (customer.codEnabled === true) {
      say(`${customer.name} already has cash on delivery enabled`);
    } else {
      say(`enable cash on delivery for ${customer.name} <${customer.email || customer.phone}>`);
      if (apply) {
        customer.codEnabled = true;
        await customer.save({ validateBeforeSave: false });
      }
    }
  }

  return { actions, warnings, problems, restaurant };
}

/* ── Command line ──────────────────────────────────────────────────────── */

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const flag = (key) => {
    const at = args.indexOf(`--${key}`);
    return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1].trim() : undefined;
  };
  const tenDigits = (value) => (value ? String(value).replace(/\D/g, '').slice(-10) : undefined);

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI must be set (backend/.env is read automatically).');
    process.exit(1);
  }

  // Never print the connection string back: it carries the password.
  const host = process.env.MONGODB_URI.replace(/^[^@]*@/, '').split(/[/?]/)[0];
  console.log(`${apply ? 'APPLYING' : 'Dry run'} against ${host}\n`);

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  try {
    const result = await seedTestRestaurant(
      {
        name: flag('name'),
        city: flag('city'),
        state: flag('state'),
        zip: flag('zip'),
        street: flag('street'),
        latitude: Number(flag('lat')),
        longitude: Number(flag('lng')),
        vendor: tenDigits(flag('vendor')),
        customer: tenDigits(flag('customer')),
      },
      { apply }
    );

    for (const problem of result.problems) console.error(`PROBLEM  ${problem}`);
    for (const warning of result.warnings) console.log(`WARNING  ${warning}`);
    for (const action of result.actions) console.log(`${apply ? 'DONE   ' : 'would  '} ${action}`);

    if (result.problems.length) {
      process.exitCode = 1;
    } else if (!apply) {
      console.log('\n(dry run - add --apply to make these changes)');
    } else {
      console.log(
        `\nRestaurant ${result.restaurant._id} is live. In the app: set the delivery address near ` +
          `${flag('lat')}, ${flag('lng')}, open "${result.restaurant.name}", and use coupon TEST20 or TESTFLAT50.`
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}
