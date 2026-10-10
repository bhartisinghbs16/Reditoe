import mongoose from 'mongoose';
import User from '../models/User.js';
import Order from '../models/Order.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

// Sample data for testing
const sampleOrders = [
  {
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId('679b555e240aeacb543d9534'), // Sample user ID
    restaurantId: new mongoose.Types.ObjectId(),
    items: [
      {
        foodItemId: new mongoose.Types.ObjectId(),
        name: 'Burger',
        price: 12.99,
        quantity: 2,
        selectedAddons: []
      }
    ],
    subtotal: 25.98,
    tax: 2.60,
    gstAndPackaging: 3.00,
    platformFee: 1.50,
    deliveryFee: 5.00,
    walletUsed: 0,
    total: 38.08,
    deliveryAddress: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      coordinates: {
        latitude: 40.7128,
        longitude: -74.0060
      }
    },
    status: 'Delivered',
    riderId: new mongoose.Types.ObjectId('699b555e240aeacb543d9534'), // Rider ID from logs
    assignedAt: new Date('2026-02-20T10:00:00Z'),
    deliveredAt: new Date('2026-02-20T10:30:00Z'),
    createdAt: new Date('2026-02-20T09:45:00Z'),
    updatedAt: new Date('2026-02-20T10:30:00Z'),
    paymentStatus: 'paid',
    paymentMethod: 'cash'
  },
  {
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId('679b555e240aeacb543d9534'),
    restaurantId: new mongoose.Types.ObjectId(),
    items: [
      {
        foodItemId: new mongoose.Types.ObjectId(),
        name: 'Pizza',
        price: 18.99,
        quantity: 1,
        selectedAddons: []
      }
    ],
    subtotal: 18.99,
    tax: 1.90,
    gstAndPackaging: 2.50,
    platformFee: 1.00,
    deliveryFee: 5.00,
    walletUsed: 0,
    total: 29.39,
    deliveryAddress: {
      street: '456 Oak Ave',
      city: 'New York',
      state: 'NY',
      zipCode: '10002',
      coordinates: {
        latitude: 40.730610,
        longitude: -73.935242
      }
    },
    status: 'Delivered',
    riderId: new mongoose.Types.ObjectId('699b555e240aeacb543d9534'),
    assignedAt: new Date('2026-02-21T12:00:00Z'),
    deliveredAt: new Date('2026-02-21T12:45:00Z'),
    createdAt: new Date('2026-02-21T11:30:00Z'),
    updatedAt: new Date('2026-02-21T12:45:00Z'),
    paymentStatus: 'paid',
    paymentMethod: 'card'
  },
  {
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId('679b555e240aeacb543d9534'),
    restaurantId: new mongoose.Types.ObjectId(),
    items: [
      {
        foodItemId: new mongoose.Types.ObjectId(),
        name: 'Sushi Roll',
        price: 15.99,
        quantity: 3,
        selectedAddons: []
      }
    ],
    subtotal: 47.97,
    tax: 4.80,
    gstAndPackaging: 5.00,
    platformFee: 2.50,
    deliveryFee: 5.00,
    walletUsed: 0,
    total: 65.27,
    deliveryAddress: {
      street: '789 Pine St',
      city: 'New York',
      state: 'NY',
      zipCode: '10003',
      coordinates: {
        latitude: 40.748485,
        longitude: -73.989639
      }
    },
    status: 'Delivered',
    riderId: new mongoose.Types.ObjectId('699b555e240aeacb543d9534'),
    assignedAt: new Date('2026-02-22T18:00:00Z'),
    deliveredAt: new Date('2026-02-22T18:35:00Z'),
    createdAt: new Date('2026-02-22T17:45:00Z'),
    updatedAt: new Date('2026-02-22T18:35:00Z'),
    paymentStatus: 'paid',
    paymentMethod: 'online'
  }
];

const riderVehicleInfo = {
  vehicleInfo: {
    model: 'Honda 125',
    plateNumber: 'ABC-123',
    type: 'motorcycle',
    color: 'Red',
    year: 2022
  },
  currentRating: 4.8,
  riderId: 'RID-9928'
};

async function seedRiderData() {
  try {
    console.log('🌱 [SEED] Starting rider data seeding...');
    
    // Connect to MongoDB using the same method as server
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta');
    console.log('✅ [SEED] Connected to MongoDB');

    // Update rider with vehicle info and rating
    const riderUpdate = await User.updateOne(
      { _id: new mongoose.Types.ObjectId('699b555e240aeacb543d9534') },
      { $set: riderVehicleInfo }
    );
    console.log(`✅ [SEED] Updated rider vehicle info: ${riderUpdate.modifiedCount} document(s) modified`);

    // Clear existing orders for this rider to avoid duplicates
    await Order.deleteMany({ 
      riderId: new mongoose.Types.ObjectId('699b555e240aeacb543d9534') 
    });
    console.log('🗑️ [SEED] Cleared existing orders for rider');

    // Insert sample orders
    const insertedOrders = await Order.insertMany(sampleOrders);
    console.log(`✅ [SEED] Inserted ${insertedOrders.length} sample orders`);

    console.log('🎉 [SEED] Rider data seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ [SEED] Error seeding rider data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 [SEED] Disconnected from MongoDB');
  }
}

seedRiderData();
