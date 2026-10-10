import mongoose from 'mongoose';

const comboAddonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, default: 0 },
  available: { type: Boolean, default: true },
});

const comboItemSchema = new mongoose.Schema({
  foodItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FoodItem',
    required: true
  },
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
});

const comboSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  image: { type: String, default: '' },
  originalPrice: { type: Number, required: true },
  comboPrice: { type: Number, required: true },
  items: [comboItemSchema],
  addons: [comboAddonSchema],
  isAvailable: { type: Boolean, default: true },
  isBestseller: { type: Boolean, default: false },
  isPopular: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Combo', comboSchema);
