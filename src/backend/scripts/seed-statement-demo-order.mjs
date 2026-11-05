/**
 * Adds one delivered order to a vendor's restaurant so the earnings statement
 * has something to show.
 *
 *   node scripts/seed-statement-demo-order.mjs --vendor 9219583594            # dry run: changes nothing
 *   node scripts/seed-statement-demo-order.mjs --vendor 9219583594 --apply    # writes it
 *   node scripts/seed-statement-demo-order.mjs --vendor 9219583594 --remove --apply   # takes it back out
 *
 * It reads MONGODB_URI from the environment, or from backend/.env. THAT FILE
 * POINTS AT THE LIVE DATABASE, so the default is a dry run. Only --apply writes.
 *
 * The order is a real Delivered order, so until it is removed it counts in
 * that restaurant's payouts, reports and the admin console. It is tagged in its
 * notes ("statement-demo") so --remove finds exactly the orders this script
 * made and nothing else. Running it twice adds a second order.
 *
 * Flags
 *   --vendor <mobile>    REQUIRED. The vendor account; its restaurant is used.
 *   --customer <mobile>  The account the order is placed by. Defaults to the
 *                        vendor account itself, which is fine for a demo.
 *   --apply              Write the change.
 *   --remove             Delete the orders this script created, instead of adding one.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import Order from '../models/Order.js';

export const DEMO_TAG = 'statement-demo';

/** Accounts store the number as typed at sign-up: bare, with 91, or with +91. */
const phoneVariants = (digits) => [digits, `+91${digits}`, `91${digits}`];
const byPhone = (digits) => User.findOne({ phone: { $in: phoneVariants(digits) } });

/**
 * Plans and, with `apply`, performs the seed against an open connection (so the
 * tests can use an in-memory database). Returns { problems, actions, order }.
 */
export async function seedStatementDemoOrder({ vendor, customer, remove = false }, { apply = false } = {}) {
  const problems = [];
  const actions = [];

  const owner = vendor ? await byPhone(vendor) : null;
  if (!owner) problems.push(`no account with mobile ${vendor || '(none given)'}`);
  const restaurant = owner ? await Restaurant.findOne({ owner: owner._id }) : null;
  if (owner && !restaurant) problems.push(`${vendor} does not own a restaurant`);
  if (problems.length) return { problems, actions };

  if (remove) {
    const found = await Order.find({ restaurantId: restaurant._id, notes: DEMO_TAG }).select('_id orderNumber');
    actions.push(`delete ${found.length} demo order(s) from ${restaurant.name}`);
    if (apply && found.length) await Order.deleteMany({ _id: { $in: found.map((o) => o._id) } });
    return { problems, actions };
  }

  const buyer = customer ? await byPhone(customer) : owner;
  if (!buyer) return { problems: [`no account with mobile ${customer}`], actions };

  const dishes = await FoodItem.find({ restaurantId: restaurant._id }).limit(2);
  if (!dishes.length) return { problems: [`${restaurant.name} has no menu items to put on the order`], actions };

  const items = dishes.map((d, i) => ({
    foodItemId: d._id, name: d.name, quantity: i === 0 ? 2 : 1, price: Number(d.price) || 100,
  }));
  const subtotal = items.reduce((acc, it) => acc + it.price * it.quantity, 0);
  const packagingFee = 10;
  const platformFee = 8;
  const deliveryFee = 30;
  const a = restaurant.address || {};
  const order = {
    userId: buyer._id,
    restaurantId: restaurant._id,
    items,
    subtotal,
    tax: 0,
    platformFee,
    deliveryFee,
    packagingFee,
    discount: 0,
    total: subtotal + packagingFee + platformFee + deliveryFee,
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    status: 'Delivered',
    deliveryAddress: { street: a.street || 'Demo Street', city: a.city || '', state: a.state || '', zipCode: a.zipCode || '' },
    notes: DEMO_TAG,
    timeline: [
      { status: 'Waiting for Confirmation', message: 'Order placed' },
      { status: 'Delivered', message: 'Order delivered' },
    ],
  };
  actions.push(`add 1 Delivered COD order (${items.map((i) => `${i.quantity} x ${i.name}`).join(', ')}; total ${order.total}) to ${restaurant.name}`);
  if (!apply) return { problems, actions, order };
  const created = await Order.create(order);
  return { problems, actions, order: created };
}

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
    const result = await seedStatementDemoOrder(
      { vendor: tenDigits(flag('vendor')), customer: tenDigits(flag('customer')), remove: args.includes('--remove') },
      { apply }
    );
    for (const problem of result.problems) console.error(`PROBLEM  ${problem}`);
    for (const action of result.actions) console.log(`${apply ? 'DONE   ' : 'would  '} ${action}`);
    if (result.problems.length) process.exitCode = 1;
    else if (!apply) console.log('\n(dry run - add --apply to make this change)');
    else if (!args.includes('--remove')) {
      console.log('\nOpen the vendor app > Earnings > "Download earnings statement" to see it. Remove it afterwards with --remove --apply.');
    }
  } finally {
    await mongoose.disconnect();
  }
}
