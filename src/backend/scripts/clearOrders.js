import mongoose from 'mongoose';
import Order from '../models/Order.js';
import 'dotenv/config';

async function clearOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const result = await Order.deleteMany({});
    console.log(`Deleted ${result.deletedCount} orders`);
    
    await mongoose.disconnect();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

clearOrders();
