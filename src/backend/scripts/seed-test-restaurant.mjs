/**
 * Adds orderable test restaurants - each with a menu, plus a couple of coupons -
 * so the customer app has something to place an order against: the main
 * "Reditoe Test Kitchen" and three more kitchens a kilometre or two around it
 * (Awadhi Dastarkhwan, Crust & Co. Pizzeria, Chaat Gali).
 *
 *   node scripts/seed-test-restaurant.mjs --lat 26.9100 --lng 80.9420 \
 *        --vendor 9219583594 --customer 9876543210            # dry run: changes nothing
 *   ... the same line plus --apply                            # writes it
 *
 * It reads MONGODB_URI from the environment, or from backend/.env. THAT FILE
 * POINTS AT THE LIVE DATABASE, so the default is a dry run: it prints exactly
 * what --apply would add. Only --apply writes.
 *
 * Unlike seed-demo / seed-vendor-demo this never deletes anything: no orders,
 * no menu items, no coupons are removed, and no dish or coupon that already
 * exists is changed. Running it again adds only what is missing. (A re-run does
 * move the test restaurants themselves to the pin you give, and lets the two test
 * coupons apply at the extra kitchens.)
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
 *   --vendors <a,b,c>  Optional vendor mobiles for the three extra kitchens, in the
 *                    order Awadhi Dastarkhwan, Crust & Co. Pizzeria, Chaat Gali. Without
 *                    them the extras have no owner: customers can see and order from
 *                    them, but nobody can confirm those orders in a vendor app. Each
 *                    vendor must be a different account that owns no other restaurant.
 *   --no-extras      Seed only the main Test Kitchen.
 *   --name, --city, --state, --zip, --street   Defaults: "Reditoe Test Kitchen",
 *                    Lucknow, Uttar Pradesh 226021 (Madiyaon). Change --city/--state
 *                    (and --lat/--lng) to wherever you are testing. The run ends by
 *                    printing a Google Maps link for the pin, so you can check it is
 *                    where you expect.
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

/** Where a test restaurant goes when no --city/--state/--zip is given. */
const DEFAULT_PLACE = { city: 'Lucknow', state: 'Uttar Pradesh', zip: '226021' };

/** A pizza's sizes (each a full price) and the toppings that cost extra. */
const pizzaChoices = (regular, medium, large) => [
  {
    name: 'Size',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    priceMode: 'absolute',
    options: [
      { name: 'Regular (7")', price: regular, isDefault: true },
      { name: 'Medium (10")', price: medium },
      { name: 'Large (12")', price: large },
    ],
  },
  {
    name: 'Extras',
    required: false,
    minSelect: 0,
    maxSelect: 2,
    priceMode: 'surcharge',
    options: [
      { name: 'Extra cheese', price: 40 },
      { name: 'Jalapenos', price: 25 },
    ],
  },
];

/**
 * Three more kitchens around the main one, each a different kind of food so the
 * category filters, search and the "which restaurant" screens have something to
 * tell apart. `offset` is in degrees from the pin you give (0.01 is about 1.1 km),
 * so they all land within a couple of kilometres of it and move with it.
 */
export const EXTRA_OUTLETS = [
  {
    outletId: 'RES-TESTAWADHI',
    name: 'Awadhi Dastarkhwan',
    description: 'Lucknowi kebabs, dum biryani and kormas - test kitchen.',
    categories: ['Awadhi', 'Mughlai', 'Biryani', 'Kebabs'],
    foodType: 'both',
    offset: { latitude: 0.012, longitude: 0.008 },
    street: 'Sitapur Road, near Madiyaon Chauraha',
    deliveryFee: 35,
    dailyPackagingFee: 20,
    estimatedDeliveryMinutes: 30,
    deliveryTime: '30-40 min',
    rating: 4.6,
    menu: [
      { name: 'Mutton Galouti Kebab (4 pcs)', price: 289, category: 'Kebabs', foodType: 'non-veg', description: 'Melt-in-the-mouth minced mutton kebabs, served with ulte tawe ka paratha.', preparationTime: 20 },
      { name: 'Chicken Seekh Kebab', price: 219, category: 'Kebabs', foodType: 'non-veg', description: 'Minced chicken seekhs grilled over charcoal, with mint chutney.', preparationTime: 18 },
      { name: 'Paneer Tikka', price: 199, category: 'Kebabs', foodType: 'veg', description: 'Marinated cottage cheese cubes roasted in the tandoor.', preparationTime: 15 },
      {
        name: 'Lucknowi Chicken Biryani',
        price: 269,
        category: 'Biryani',
        foodType: 'non-veg',
        description: 'Awadhi dum biryani - fragrant rice and chicken sealed and slow-cooked.',
        preparationTime: 25,
        modifierGroups: [
          {
            name: 'Portion',
            required: true,
            minSelect: 1,
            maxSelect: 1,
            priceMode: 'absolute',
            options: [
              { name: 'Half', price: 269, isDefault: true },
              { name: 'Full', price: 429 },
            ],
          },
        ],
      },
      { name: 'Mutton Korma', price: 349, category: 'Main Course', foodType: 'non-veg', description: 'Mutton in a mild, creamy yogurt-and-nut gravy.', preparationTime: 30 },
      { name: 'Dal Makhani', price: 189, category: 'Main Course', foodType: 'veg', description: 'Black lentils simmered overnight with butter and cream.', preparationTime: 15 },
      { name: 'Sheermal', price: 55, category: 'Breads', foodType: 'veg', description: 'Saffron-scented sweet flatbread baked in the tandoor.', preparationTime: 10 },
      { name: 'Rumali Roti', price: 25, category: 'Breads', foodType: 'veg', description: 'Paper-thin handkerchief roti.', preparationTime: 6 },
      { name: 'Shahi Tukda', price: 99, category: 'Desserts', foodType: 'veg', description: 'Fried bread soaked in saffron rabri.', preparationTime: 8 },
      { name: 'Rooh Afza Sharbat', price: 59, category: 'Beverages', foodType: 'veg', description: 'Chilled rose sharbat with basil seeds.', preparationTime: 3 },
    ],
  },
  {
    outletId: 'RES-TESTCRUST',
    name: 'Crust & Co. Pizzeria',
    description: 'Hand-tossed pizzas, pasta and desserts - test kitchen.',
    categories: ['Pizza', 'Italian', 'Fast Food'],
    foodType: 'both',
    offset: { latitude: -0.010, longitude: -0.012 },
    street: 'Kisan Path, near Madiyaon',
    deliveryFee: 30,
    dailyPackagingFee: 15,
    estimatedDeliveryMinutes: 28,
    deliveryTime: '25-35 min',
    rating: 4.3,
    menu: [
      { name: 'Margherita Pizza', price: 179, category: 'Pizza', foodType: 'veg', description: 'Tomato, mozzarella and basil on a hand-tossed base.', preparationTime: 18, modifierGroups: pizzaChoices(179, 299, 429) },
      { name: 'Farmhouse Pizza', price: 249, category: 'Pizza', foodType: 'veg', description: 'Capsicum, onion, mushroom, sweet corn and olives.', preparationTime: 20, modifierGroups: pizzaChoices(249, 399, 549) },
      { name: 'Peppy Paneer Pizza', price: 269, category: 'Pizza', foodType: 'veg', description: 'Spiced paneer, capsicum and red paprika.', preparationTime: 20, modifierGroups: pizzaChoices(269, 429, 579) },
      { name: 'Chicken Tikka Pizza', price: 299, category: 'Pizza', foodType: 'non-veg', description: 'Tandoori chicken tikka, onion and green chilli.', preparationTime: 22, modifierGroups: pizzaChoices(299, 459, 619) },
      { name: 'Garlic Bread with Cheese', price: 129, category: 'Sides', foodType: 'veg', description: 'Toasted garlic bread topped with melted cheese.', preparationTime: 10 },
      { name: 'White Sauce Pasta', price: 189, category: 'Pasta', foodType: 'veg', description: 'Penne in a creamy white sauce with veggies.', preparationTime: 15 },
      { name: 'Chicken Red Sauce Pasta', price: 219, category: 'Pasta', foodType: 'non-veg', description: 'Penne in spicy arrabbiata with grilled chicken.', preparationTime: 15 },
      { name: 'Choco Lava Cake', price: 89, category: 'Desserts', foodType: 'veg', description: 'Warm chocolate cake with a molten centre.', preparationTime: 8 },
      { name: 'Cold Coffee', price: 119, category: 'Beverages', foodType: 'veg', description: 'Thick, creamy iced coffee.', preparationTime: 5 },
      { name: 'Cold Drink (300 ml)', price: 40, category: 'Beverages', foodType: 'veg', description: 'Chilled soft drink.', preparationTime: 2 },
    ],
  },
  {
    outletId: 'RES-TESTCHAAT',
    name: 'Chaat Gali',
    description: 'Lucknow street food, sweets and chai - test kitchen.',
    categories: ['Chaat', 'Street Food', 'Sweets', 'Snacks'],
    foodType: 'veg',
    offset: { latitude: 0.004, longitude: -0.014 },
    street: 'Madiyaon Market, Sitapur Road',
    deliveryFee: 25,
    dailyPackagingFee: 10,
    estimatedDeliveryMinutes: 20,
    deliveryTime: '20-30 min',
    rating: 4.4,
    menu: [
      { name: 'Basket Chaat', price: 99, category: 'Chaat', foodType: 'veg', description: 'Crisp potato basket filled with tikki, curd, chutneys and sev.', preparationTime: 10 },
      { name: 'Aloo Tikki Chaat', price: 79, category: 'Chaat', foodType: 'veg', description: 'Golden potato tikkis with chole, curd and tamarind chutney.', preparationTime: 8 },
      { name: 'Pani Puri (6 pcs)', price: 49, category: 'Chaat', foodType: 'veg', description: 'Crisp puris with spiced mint water.', preparationTime: 5 },
      { name: 'Dahi Bhalla', price: 89, category: 'Chaat', foodType: 'veg', description: 'Soft lentil dumplings in sweet curd.', preparationTime: 8 },
      { name: 'Samosa (2 pcs)', price: 40, category: 'Snacks', foodType: 'veg', description: 'Crisp pastry stuffed with spiced potato and peas.', preparationTime: 6 },
      { name: 'Kachori Sabzi', price: 69, category: 'Snacks', foodType: 'veg', description: 'Two khasta kachoris with aloo sabzi.', preparationTime: 10 },
      { name: 'Bread Pakora', price: 49, category: 'Snacks', foodType: 'veg', description: 'Gram-flour fried stuffed bread with chutney.', preparationTime: 8 },
      { name: 'Jalebi (250 g)', price: 89, category: 'Sweets', foodType: 'veg', description: 'Hot, crisp jalebis soaked in saffron syrup.', preparationTime: 5 },
      { name: 'Rabri Falooda', price: 109, category: 'Desserts', foodType: 'veg', description: 'Chilled rabri with falooda, vermicelli and basil seeds.', preparationTime: 5 },
      { name: 'Masala Chai', price: 25, category: 'Beverages', foodType: 'veg', description: 'Strong ginger-cardamom tea in a kulhad.', preparationTime: 4 },
      { name: 'Sweet Lassi', price: 59, category: 'Beverages', foodType: 'veg', description: 'Thick chilled lassi topped with malai.', preparationTime: 3 },
    ],
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
    city = DEFAULT_PLACE.city,
    state = DEFAULT_PLACE.state,
    zip = DEFAULT_PLACE.zip,
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

/**
 * Looks up the vendor (if any) for each extra kitchen, before anything is
 * written, so a bad number stops the whole run rather than half of it.
 */
async function resolveExtraOwners(vendors, mainVendor, problems) {
  if (vendors.length > EXTRA_OUTLETS.length) {
    problems.push(`--vendors takes at most ${EXTRA_OUTLETS.length} numbers, one per extra kitchen.`);
  }

  const owners = [];
  const taken = new Map(mainVendor ? [[mainVendor, 'the main Test Kitchen']] : []);

  for (const [index, outlet] of EXTRA_OUTLETS.entries()) {
    const phone = vendors[index];
    if (!phone) {
      owners.push(null);
      continue;
    }
    if (taken.has(phone)) {
      problems.push(`${phone} is given for both ${taken.get(phone)} and ${outlet.name}; each kitchen needs its own vendor.`);
      owners.push(null);
      continue;
    }
    taken.set(phone, outlet.name);

    const user = await User.findOne({ phone: { $in: phoneVariants(phone) } });
    if (!user) {
      problems.push(`No account has the vendor number ${phone} (for ${outlet.name}).`);
    } else if (user.role !== 'vendor') {
      problems.push(`${phone} is a "${user.role}" account, not a vendor (for ${outlet.name}).`);
    } else {
      const owned = await Restaurant.find({ owner: user._id }).select('name outletId');
      const other = owned.filter((r) => r.outletId !== outlet.outletId);
      if (other.length) {
        problems.push(`${phone} already owns "${other[0].name}" (${other[0].outletId}), so cannot also run ${outlet.name}.`);
      }
    }
    owners.push(user);
  }
  return owners;
}

/**
 * The main Test Kitchen and the three extra kitchens around it.
 *
 * Takes everything seedTestRestaurant takes, plus `vendors` (up to three mobile
 * numbers, one per extra kitchen) and `extras: false` to leave the extras out.
 * Every check that can fail runs before the first write.
 */
export async function seedTestRestaurants(options, { apply = false } = {}) {
  const {
    extras = true,
    vendors = [],
    vendor: mainVendor,
    latitude,
    longitude,
    city = DEFAULT_PLACE.city,
    state = DEFAULT_PLACE.state,
    zip = DEFAULT_PLACE.zip,
  } = options;

  if (!extras) {
    const only = await seedTestRestaurant(options, { apply });
    return { ...only, restaurants: only.restaurant ? [only.restaurant] : [] };
  }

  const problems = [];
  const owners = await resolveExtraOwners(vendors, mainVendor, problems);
  if (problems.length) return { actions: [], warnings: [], problems, restaurants: [] };

  const main = await seedTestRestaurant(options, { apply });
  if (main.problems.length) return { ...main, restaurants: [] };

  const { actions, warnings } = main;
  const say = (line) => actions.push(line);
  const extraDocs = [];

  for (const [index, outlet] of EXTRA_OUTLETS.entries()) {
    const owner = owners[index];
    const point = {
      latitude: Number((latitude + outlet.offset.latitude).toFixed(6)),
      longitude: Number((longitude + outlet.offset.longitude).toFixed(6)),
    };
    const fields = {
      name: outlet.name,
      ...(owner ? { owner: owner._id, phone: owner.phone } : {}),
      description: outlet.description,
      categories: outlet.categories,
      foodType: outlet.foodType,
      address: { street: outlet.street, city, state, zipCode: zip, coordinates: point },
      status: 'approved',
      isEnabled: true,
      isApproved: true,
      isActive: true,
      isOpen: true,
      kycStatus: 'approved',
      deliveryRadius: 8,
      deliveryFee: outlet.deliveryFee,
      dailyPackagingFee: outlet.dailyPackagingFee,
      estimatedDeliveryMinutes: outlet.estimatedDeliveryMinutes,
      deliveryTime: outlet.deliveryTime,
      openingHours: 'Open 24 hours',
      rating: outlet.rating,
    };

    let doc = await Restaurant.findOne({ outletId: outlet.outletId });
    if (!doc) {
      say(`create extra kitchen "${outlet.name}" (${outlet.outletId}) at ${point.latitude}, ${point.longitude}` +
        `${owner ? `, owned by ${owner.name}` : ', no owner'}`);
      if (apply) {
        doc = await Restaurant.create({
          ...fields,
          outletId: outlet.outletId,
          statusChangedAt: new Date(),
          approvalHistory: [{ status: 'approved', by: 'scripts/seed-test-restaurant.mjs', at: new Date() }],
        });
      }
    } else {
      say(`update extra kitchen "${outlet.name}" (${doc._id}): location ${point.latitude}, ${point.longitude}, approved/enabled/open`);
      if (apply) {
        Object.assign(doc, fields);
        await doc.save();
      }
    }

    const have = new Set(
      doc ? (await FoodItem.find({ restaurantId: doc._id }).select('name').lean()).map((i) => i.name) : []
    );
    const missing = outlet.menu.filter((dish) => !have.has(dish.name));
    say(
      missing.length
        ? `  add ${missing.length} dish(es) to ${outlet.name}`
        : `  ${outlet.name}: menu already complete - nothing to add`
    );
    if (apply && doc && missing.length) {
      await FoodItem.create(missing.map((dish) => ({ isAvailable: true, ...dish, restaurantId: doc._id })));
    }
    extraDocs.push(doc);
  }

  const unowned = EXTRA_OUTLETS.filter((_, index) => !owners[index] && !extraDocs[index]?.owner);
  if (unowned.length) {
    warnings.push(
      `${unowned.map((o) => o.name).join(', ')} ${unowned.length === 1 ? 'has' : 'have'} no owner: customers can see and order ` +
        'from them, but nobody can confirm those orders in a vendor app. Pass --vendors <a>,<b>,<c> to give them one.'
    );
  }

  /* The two test coupons also work at the extra kitchens. Only these codes are
     touched, and only to add the kitchens to where they apply. */
  const extraIds = extraDocs.filter(Boolean).map((d) => d._id);
  const stillToCreate = extraDocs.filter((d) => !d).length;
  const coupons = await Coupon.find({ code: { $in: TEST_COUPON_CODES }, isGlobal: { $ne: true } })
    .select('code applicableRestaurants');
  const unlinked = coupons
    .map((coupon) => ({
      coupon,
      missing: extraIds.filter((id) => !coupon.applicableRestaurants.some((x) => String(x) === String(id))),
    }))
    .filter((entry) => entry.missing.length);

  if (unlinked.length || stillToCreate) {
    say(`let coupons ${TEST_COUPON_CODES.join(' and ')} apply at the extra kitchens too`);
  }
  if (apply) {
    for (const { coupon, missing } of unlinked) {
      await Coupon.updateOne({ _id: coupon._id }, { $addToSet: { applicableRestaurants: { $each: missing } } });
    }
  }

  return {
    actions,
    warnings,
    problems,
    restaurant: main.restaurant,
    restaurants: [main.restaurant, ...extraDocs].filter(Boolean),
  };
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
    const result = await seedTestRestaurants(
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
        vendors: (flag('vendors') ?? '').split(',').map(tenDigits).filter(Boolean),
        extras: !args.includes('--no-extras'),
      },
      { apply }
    );

    for (const problem of result.problems) console.error(`PROBLEM  ${problem}`);
    for (const warning of result.warnings) console.log(`WARNING  ${warning}`);
    for (const action of result.actions) console.log(`${apply ? 'DONE   ' : 'would  '} ${action}`);

    // The pin is the one thing that silently decides who can see the restaurant.
    if (!result.problems.length) {
      const where = `${flag('city') ?? DEFAULT_PLACE.city}, ${flag('state') ?? DEFAULT_PLACE.state}`;
      console.log(`\nPin: ${flag('lat')}, ${flag('lng')} (${where}) - check it: https://www.google.com/maps?q=${flag('lat')},${flag('lng')}`);
    }

    if (result.problems.length) {
      process.exitCode = 1;
    } else if (!apply) {
      console.log('\n(dry run - add --apply to make these changes)');
    } else {
      console.log(
        `\n${result.restaurants.length} restaurant(s) live: ${result.restaurants.map((r) => r.name).join(', ')}. ` +
          `In the app: set the delivery address near ${flag('lat')}, ${flag('lng')} and use coupon TEST20 or TESTFLAT50.`
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}
