import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';
import User from './models/User.js';
import Restaurant from './models/Restaurant.js';
import FoodItem from './models/FoodItem.js';

dotenv.config();

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI.replace(/"/g, ''));
    console.log('Connected.');

    // 1. Find Rider Asad Rammay
    const rider = await User.findOne({ name: /Asad Rammay/i, role: 'rider' });
    if (!rider) {
      console.log('Rider "Asad Rammay" not found!');
      process.exit(1);
    }
    console.log(`Found Rider: ${rider.name} (${rider._id})`);

    // 2. Find a restaurant that has food items
    const restaurant = await Restaurant.findOne({ status: 'approved' });
    if (!restaurant) {
      console.log('No approved restaurant found!');
      process.exit(1);
    }
    console.log(`Found Restaurant: ${restaurant.name} (${restaurant._id})`);

    // 3. Find 2-3 food items
    const foodItems = await FoodItem.find({ restaurantId: restaurant._id }).limit(2);
    if (foodItems.length === 0) {
      console.log('No food items found for this restaurant!');
      process.exit(1);
    }
    console.log(`Found ${foodItems.length} Food Items.`);

    // 4. Find a customer
    const customer = await User.findOne({ _id: { $ne: rider._id } });
    if (!customer) {
      console.log('No other user found to act as customer!');
      process.exit(1);
    }
    console.log(`Found Customer: ${customer.name} (${customer._id})`);

    // 5. Look at a real order for structure
    const sampleOrder = await Order.findOne().sort({ createdAt: -1 });
    console.log(`Found Sample Order for reference: ${sampleOrder ? sampleOrder._id : 'None'}`);

    // 6. Create the order
    const orderItems = foodItems.map((fi, idx) => ({
      foodItemId: fi._id,
      quantity: idx + 1,
      price: fi.price || 100,
      name: fi.name,
      selectedAddons: [],
      selectedModifiers: [],
      modifiersTotal: 0
    }));

    const subtotal = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const deliveryFee = 50;
    const tax = subtotal * 0.05;
    const total = subtotal + deliveryFee + tax;

    const newOrder = new Order({
      userId: customer._id,
      restaurantId: restaurant._id,
      riderId: rider._id,
      items: orderItems,
      subtotal,
      tax,
      deliveryFee,
      total,
      status: 'OnWay',
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      deliveryAddress: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'Test State',
        zipCode: '123456',
        coordinates: {
          latitude: 31.5204, // Lahore test coordinates
          longitude: 74.3587
        }
      },
      dispatchState: 'assigned',
      assignedAt: new Date(),
      assignmentHistory: [{
        riderId: rider._id,
        assignedAt: new Date(),
        assignmentType: 'manual',
        notes: 'Test order assignment'
      }],
      notes: 'TEST ORDER FOR RIDER VIEW'
    });

    await newOrder.save();
    console.log('\n--- NEW ORDER CREATED SUCCESSFULLY ---');
    console.log(JSON.stringify(newOrder.toObject(), null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

run();
