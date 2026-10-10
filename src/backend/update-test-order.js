import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';

dotenv.config();

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI.replace(/"/g, ''));
    console.log('Connected.');

    const orderId = '6a6674774a92cb6b6cc3531e';
    const order = await Order.findById(orderId);
    
    if (!order) {
      console.log('Order not found!');
      process.exit(1);
    }
    
    console.log('Found Order:', order.orderNumber);
    
    // Recalculate based on current backend formula to properly round it
    const subtotal = order.subtotal; // 42.97
    const deliveryFee = order.deliveryFee; // 50
    const platformFee = Math.max(subtotal * 0.02, 8); // 8 (since 42.97*0.02 is < 8)
    const tax = subtotal * 0.05; // 2.1485
    const deliveryGSTAmount = deliveryFee * 0.18; // 9
    const platformGSTAmount = platformFee * 0.18; // 1.44
    const gstAndPackaging = tax + deliveryGSTAmount + platformGSTAmount; // 12.5885
    
    // Total should be: 42.97 + 50 + 8 + 12.5885 = 113.5585
    // Wait, in my original seed-test-order.js I hardcoded:
    // const tax = subtotal * 0.05;
    // const total = subtotal + deliveryFee + tax;
    // This bypassed platformFee and GST on delivery! That's why it was 95.1185.
    
    // I'll recalculate properly
    order.platformFee = 8;
    order.gstAndPackaging = Number((tax + deliveryGSTAmount + platformGSTAmount).toFixed(2));
    order.tax = Number(tax.toFixed(2));
    const total = subtotal + order.gstAndPackaging + order.platformFee + deliveryFee;
    
    order.total = Number(total.toFixed(2));
    
    await order.save();
    
    console.log('\n--- ORDER UPDATED ---');
    console.log('Subtotal:', order.subtotal);
    console.log('Delivery Fee:', order.deliveryFee);
    console.log('Platform Fee:', order.platformFee);
    console.log('GST & Packaging:', order.gstAndPackaging);
    console.log('NEW CORRECT TOTAL:', order.total);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

run();
