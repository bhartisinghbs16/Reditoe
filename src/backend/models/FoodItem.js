import mongoose from 'mongoose';

const addonSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  /**
   * An extra can run out without the vendor wanting to forget its name and
   * price. Deleting it was previously the only way to stop offering it.
   */
  isAvailable: {
    type: Boolean,
    default: true,
  },
}, {
  _id: true,
});

const modifierOptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  /**
   * The option a customer starts on, and the one the menu quotes a price
   * from. Without it the first option in the list was the default by
   * accident, so reordering the group silently changed the advertised price.
   */
  isDefault: {
    type: Boolean,
    default: false,
  },
}, { _id: true });

const modifierGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  required: {
    type: Boolean,
    default: false,
  },
  minSelect: {
    type: Number,
    default: 0,
    min: 0,
  },
  maxSelect: {
    type: Number,
    default: null,
    min: 0,
  },
  /**
   * How an option's price is read.
   *
   * `surcharge` — the option costs this much on top of the dish (extra
   * toppings). `absolute` — the option IS the price of the dish at that size,
   * so choosing it replaces the base price rather than adding to it.
   *
   * Sizes are priced the second way on every menu: "Half ₹120, Full ₹220"
   * means Full costs ₹220, not ₹220 more than the dish. Defaulting to
   * `surcharge` leaves every group stored before this field behaving as it
   * did.
   */
  priceMode: {
    type: String,
    enum: ['surcharge', 'absolute'],
    default: 'surcharge',
  },
  options: {
    type: [modifierOptionSchema],
    default: [],
  },
}, { _id: true });

const foodItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a food item name'],
    trim: true,
  },
  price: {
    type: Number,
    required: [true, 'Please provide a price'],
    min: 0,
  },
  description: {
    type: String,
    trim: true,
  },
  image: {
    type: String,
    default: '',
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Food item must belong to a restaurant'],
  },
  category: {
    type: String,
    trim: true,
  },
  foodType: {
    type: String,
    enum: ['veg', 'non-veg', 'egg'],
    default: 'veg',
  },
  addons: {
    type: [addonSchema],
    default: [],
  },
  modifierGroups: {
    type: [modifierGroupSchema],
    default: [],
  },

  /**
   * Discount off the list price. Two fields rather than one so a vendor can
   * say "₹20 off" or "10% off" and mean it — storing only a final price
   * loses which was intended, and re-deriving it after a price change gets it
   * wrong.
   *
   * `price` stays the list price throughout. The customer-facing figure is
   * computed, never stored, so a stale discounted price cannot outlive the
   * discount that produced it.
   */

  /**
   * The dish's cuisine — South Indian, Chinese. Distinct from `category`,
   * which is the menu section it sits under, and from the restaurant's own
   * cuisine tags, which describe the whole kitchen rather than one dish.
   *
   * The admin menu list has always rendered this beneath the category; with
   * no field behind it the line was simply always blank.
   */
  cuisine: {
    type: String,
    trim: true,
    default: '',
  },

  /**
   * When this dish can be ordered, as "HH:MM" in the restaurant's local time.
   *
   * Stored as strings rather than Dates: this is a time of day that repeats
   * every day, not an instant, and a Date would carry a meaningless date part
   * and a timezone that nobody set.
   *
   * Both empty means always available, which is what every existing dish is.
   * A window that ends before it starts is treated as crossing midnight - a
   * kitchen serving 22:00 to 02:00 is ordinary, and rejecting it would be
   * wrong.
   */
  availableFrom: {
    type: String,
    default: '',
    trim: true,
  },
  availableTo: {
    type: String,
    default: '',
    trim: true,
  },

  /**
   * The days of the week this dish is sold on, empty meaning every day.
   *
   * Stored alongside the daily window rather than inside it: a weekend-only
   * dish is still sold in the kitchen's normal hours, so the two answer
   * different questions and one cannot be derived from the other.
   */
  availableDays: {
    type: [String],
    enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    default: [],
  },
  discountType: {
    type: String,
    enum: ['none', 'percent', 'flat'],
    default: 'none',
  },
  discountValue: {
    type: Number,
    default: 0,
    min: 0,
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
  preparationTime: {
    type: Number, // in minutes
  },
}, {
  timestamps: true,
});

// Database indexes for performance optimization
foodItemSchema.index({ name: 'text', description: 'text', category: 'text' });
foodItemSchema.index({ restaurantId: 1, isAvailable: 1 });
foodItemSchema.index({ category: 1 });
foodItemSchema.index({ price: 1 });
foodItemSchema.index({ rating: -1 });
foodItemSchema.index({ createdAt: -1 });


/**
 * What the customer actually pays. Clamped at zero so a mis-keyed discount
 * larger than the price cannot produce a negative charge.
 */
foodItemSchema.virtual('effectivePrice').get(function () {
  const price = Number(this.price) || 0;
  const value = Number(this.discountValue) || 0;
  if (!value || this.discountType === 'none') return price;
  const off = this.discountType === 'percent' ? (price * value) / 100 : value;
  return Math.max(0, Math.round((price - off) * 100) / 100);
});

foodItemSchema.set('toJSON', { virtuals: true });
foodItemSchema.set('toObject', { virtuals: true });

/**
 * Whether the dish is orderable right now, combining the manual switch with
 * the schedule. `isAvailable` alone was the whole answer before; a dish with
 * a window is unavailable outside it however the switch is set.
 */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

foodItemSchema.methods.isOrderableAt = function (when = new Date()) {
  if (!this.isAvailable) return false;

  // An empty list means every day; it is not a dish nobody can ever order.
  const days = Array.isArray(this.availableDays) ? this.availableDays : [];
  if (days.length && !days.includes(WEEKDAY_NAMES[when.getDay()])) return false;

  const from = (this.availableFrom || '').trim();
  const to = (this.availableTo || '').trim();
  if (!from || !to) return true;

  const minutes = when.getHours() * 60 + when.getMinutes();
  const parse = (value) => {
    const [h, m] = value.split(':').map(Number);
    return (Number(h) || 0) * 60 + (Number(m) || 0);
  };
  const open = parse(from);
  const close = parse(to);

  // A window that ends before it starts crosses midnight.
  return open <= close
    ? minutes >= open && minutes <= close
    : minutes >= open || minutes <= close;
};
const FoodItem = mongoose.model('FoodItem', foodItemSchema);

export default FoodItem;
