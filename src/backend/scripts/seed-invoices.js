#!/usr/bin/env node

/**
 * Invoice Seeding Script
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Invoice from '../models/Invoice.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });
import Order from '../models/Order.js';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FinancialTransaction from '../models/FinancialTransaction.js';

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';

// Sample data
const sampleCustomers = [
  {
    name: 'Rajesh Kumar',
    email: 'rajesh.kumar@email.com',
    phone: '+91 98765 43210',
    address: {
      street: '123 Main Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400001',
      country: 'India'
    }
  },
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@email.com',
    phone: '+91 98765 43211',
    address: {
      street: '456 Park Avenue',
      city: 'Delhi',
      state: 'Delhi',
      zipCode: '110001',
      country: 'India'
    }
  },
  {
    name: 'Amit Patel',
    email: 'amit.patel@email.com',
    phone: '+91 98765 43212',
    address: {
      street: '789 Gandhi Road',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India'
    }
  }
];

const sampleRestaurants = [
  {
    name: 'Spice Garden',
    phone: '+91 22 2345 6789',
    email: 'contact@spicegarden.com',
    address: {
      street: '123 Food Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400001',
      country: 'India'
    },
    gstInfo: {
      gstNumber: '27AAAPL1234C1ZV'
    }
  },
  {
    name: 'Delicious Bites',
    phone: '+91 11 2345 6789',
    email: 'info@deliciousbites.com',
    address: {
      street: '456 Culinary Lane',
      city: 'Delhi',
      state: 'Delhi',
      zipCode: '110001',
      country: 'India'
    },
    gstInfo: {
      gstNumber: '07AAAPL1234C1ZV'
    }
  },
  {
    name: 'South Indian Express',
    phone: '+91 80 2345 6789',
    email: 'hello@southindianexpress.com',
    address: {
      street: '789 Spice Road',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India'
    },
    gstInfo: {
      gstNumber: '29AAAPL1234C1ZV'
    }
  }
];

const sampleMenuItems = [
  { name: 'Butter Chicken', description: 'Tender chicken in creamy tomato gravy', price: 280 },
  { name: 'Paneer Tikka', description: 'Grilled cottage cheese with spices', price: 220 },
  { name: 'Biryani', description: 'Aromatic rice with mixed vegetables', price: 180 },
  { name: 'Masala Dosa', description: 'Crispy rice pancake with potato filling', price: 120 },
  { name: 'Samosa', description: 'Crispy pastry with spiced filling', price: 60 },
  { name: 'Dal Makhani', description: 'Creamy black lentils with butter', price: 160 },
  { name: 'Naan', description: 'Traditional Indian flatbread', price: 40 },
  { name: 'Vegetable Pulao', description: 'Fragrant rice with mixed vegetables', price: 150 }
];

const paymentMethods = ['cash', 'card', 'online', 'wallet'];
const invoiceStatuses = ['generated', 'paid', 'pending', 'refunded'];

function generateInvoiceNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
}

function calculateTax(amount, state) {
  const cgstRate = 2.5; // 2.5% CGST
  const sgstRate = 2.5; // 2.5% SGST
  const igstRate = state === 'Delhi' ? 5 : 0; // 5% IGST for interstate
  
  const cgstAmount = (amount * cgstRate) / 100;
  const sgstAmount = (amount * sgstRate) / 100;
  const igstAmount = (amount * igstRate) / 100;
  
  return {
    cgstAmount,
    sgstAmount,
    igstAmount,
    cgstRate,
    sgstRate,
    igstRate
  };
}

function generateLineItems() {
  const itemCount = Math.floor(Math.random() * 4) + 2; // 2-5 items
  const items = [];
  let subtotal = 0;
  
  for (let i = 0; i < itemCount; i++) {
    const menuItem = sampleMenuItems[Math.floor(Math.random() * sampleMenuItems.length)];
    const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity
    const unitPrice = menuItem.price;
    const totalPrice = unitPrice * quantity;
    
    items.push({
      name: menuItem.name,
      description: menuItem.description,
      quantity,
      unitPrice,
      totalPrice,
      taxAmount: 0, // Will be calculated later
      discountAmount: 0
    });
    
    subtotal += totalPrice;
  }
  
  return { items, subtotal };
}

function generateInvoices(count = 20) {
  const invoices = [];
  
  for (let i = 0; i < count; i++) {
    const customer = sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)];
    const restaurant = sampleRestaurants[Math.floor(Math.random() * sampleRestaurants.length)];
    const { items: lineItems, subtotal } = generateLineItems();
    
    const deliveryFee = Math.floor(Math.random() * 50) + 20; // 20-70
    const platformFee = Math.floor(subtotal * 0.05); // 5% platform fee
    const taxDetails = calculateTax(subtotal, restaurant.address.state);
    
    const taxAmount = taxDetails.cgstAmount + taxDetails.sgstAmount + taxDetails.igstAmount;
    const grandTotal = subtotal + taxAmount + deliveryFee + platformFee;
    
    // Update tax amounts for line items
    lineItems.forEach(item => {
      item.taxAmount = (item.totalPrice * (taxDetails.cgstRate + taxDetails.sgstRate + taxDetails.igstRate)) / 100;
    });
    
    const status = invoiceStatuses[Math.floor(Math.random() * invoiceStatuses.length)];
    const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    
    // Generate dates
    const issueDate = new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000); // Last 30 days
    const dueDate = new Date(issueDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days after issue
    let paidDate = null;
    
    if (status === 'paid') {
      paidDate = new Date(issueDate.getTime() + Math.floor(Math.random() * 5) * 24 * 60 * 60 * 1000); // Within 5 days
    }
    
    invoices.push({
      invoiceNumber: generateInvoiceNumber(),
      customerId: null, // Will be populated after creating users
      vendorId: null, // Will be populated after creating restaurants
      orderId: null, // Will be populated after creating orders
      paymentTransactionId: null, // Will be populated after creating transactions
      
      billingAddress: customer.address,
      shippingAddress: customer.address,
      
      lineItems,
      
      subtotal,
      taxAmount,
      deliveryFee,
      discountAmount: 0,
      platformFee,
      grandTotal,
      
      taxDetails,
      
      paymentMethod,
      paymentStatus: status === 'paid' ? 'paid' : status === 'refunded' ? 'refunded' : 'pending',
      
      gstInfo: {
        customerGstNumber: '',
        vendorGstNumber: restaurant.gstInfo?.gstNumber || '',
        isReverseCharge: false,
        placeOfSupply: restaurant.address.state,
        taxType: taxDetails.igstRate > 0 ? 'IGST' : 'GST'
      },
      
      status,
      issueDate,
      dueDate,
      paidDate,
      
      notes: status === 'refunded' ? 'Customer requested refund due to quality issues' : '',
      
      refundInfo: status === 'refunded' ? {
        isRefunded: true,
        refundAmount: grandTotal * 0.8, // 80% refund
        refundReason: 'Food quality issues',
        refundDate: paidDate || new Date(),
        refundTransactionId: null
      } : undefined
    });
  }
  
  return invoices;
}

async function seedInvoices() {
  try {
    console.log('🚀 Starting invoice seeding...\n');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Clear existing invoices
    await Invoice.deleteMany({});
    console.log('🗑️  Cleared existing invoices');
    
    // Get or create sample users
    let customers = await User.find({ role: 'user' }).limit(3);
    if (customers.length < 3) {
      console.log('👥 Creating sample customers...');
      for (const customerData of sampleCustomers) {
        const customer = new User({
          ...customerData,
          role: 'user',
          isActive: true,
          isVerified: true,
          password: 'password123'
        });
        await customer.save();
        customers.push(customer);
      }
    }
    
    // Get or create sample restaurants
    let restaurants = await Restaurant.find().limit(3);
    if (restaurants.length < 3) {
      console.log('🏪 Creating sample restaurants...');
      for (const restaurantData of sampleRestaurants) {
        const restaurant = new Restaurant({
          ...restaurantData,
          status: 'approved',
          isActive: true,
          isEnabled: true,
          commissionPercent: 10,
          rating: 4.2 + Math.random() * 0.8
        });
        await restaurant.save();
        restaurants.push(restaurant);
      }
    }
    
    // Generate sample orders (required for invoices)
    console.log('📦 Creating sample orders...');
    const orders = [];
    for (let i = 0; i < 20; i++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const restaurant = restaurants[Math.floor(Math.random() * restaurants.length)];
      const { items: orderItems, subtotal } = generateLineItems();
      
      const deliveryFee = Math.floor(Math.random() * 50) + 20;
      const tax = Math.floor(subtotal * 0.05);
      const total = subtotal + tax + deliveryFee;
      
      const order = new Order({
        userId: customer._id,
        restaurantId: restaurant._id,
        items: orderItems.map(item => ({
          foodItemId: new mongoose.Types.ObjectId(),
          name: item.name,
          quantity: item.quantity,
          price: item.unitPrice
        })),
        subtotal,
        tax,
        deliveryFee,
        total,
        status: 'Delivered',
        paymentStatus: 'paid',
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        deliveryAddress: customer.address,
        timeline: [
          { status: 'Placed', timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), message: 'Order placed' },
          { status: 'Confirmed', timestamp: new Date(Date.now() - Math.random() * 6 * 24 * 60 * 60 * 1000), message: 'Order confirmed' },
          { status: 'Delivered', timestamp: new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000), message: 'Order delivered' }
        ]
      });
      
      await order.save();
      orders.push(order);
    }
    
    // Generate financial transactions
    console.log('💳 Creating sample transactions...');
    const transactions = [];
    for (const order of orders) {
      const transaction = new FinancialTransaction({
        orderId: order._id,
        restaurantId: order.restaurantId,
        amount: order.total,
        type: 'order_payment',
        status: 'completed',
        paymentMethod: order.paymentMethod,
        processedAt: new Date()
      });
      
      await transaction.save();
      transactions.push(transaction);
    }
    
    // Generate invoices
    console.log('🧾 Creating sample invoices...');
    const invoices = generateInvoices(20);
    
    // Assign IDs to invoices
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      const order = orders[i];
      const transaction = transactions[i];
      
      invoice.customerId = order.userId;
      invoice.vendorId = order.restaurantId;
      invoice.orderId = order._id;
      invoice.paymentTransactionId = transaction._id;
      
      if (invoice.refundInfo) {
        const refundTransaction = new FinancialTransaction({
          orderId: order._id,
          restaurantId: order.restaurantId,
          amount: -invoice.refundInfo.refundAmount,
          type: 'refund',
          status: 'completed',
          paymentMethod: order.paymentMethod,
          refundInfo: {
            isRefund: true,
            originalTransactionId: transaction._id,
            refundReason: invoice.refundInfo.refundReason
          },
          processedAt: invoice.refundInfo.refundDate
        });
        
        await refundTransaction.save();
        invoice.refundInfo.refundTransactionId = refundTransaction._id;
      }
    }
    
    // Save invoices
    await Invoice.insertMany(invoices);
    
    console.log(`✅ Successfully created ${invoices.length} sample invoices`);
    console.log('\n📊 Invoice Summary:');
    console.log(`   - Total Invoices: ${invoices.length}`);
    console.log(`   - Paid: ${invoices.filter(inv => inv.status === 'paid').length}`);
    console.log(`   - Pending: ${invoices.filter(inv => inv.status === 'pending').length}`);
    console.log(`   - Generated: ${invoices.filter(inv => inv.status === 'generated').length}`);
    console.log(`   - Refunded: ${invoices.filter(inv => inv.status === 'refunded').length}`);
    
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    console.log(`   - Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')}`);
    
  } catch (error) {
    console.error('❌ Error seeding invoices:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the seeding script
if (import.meta.url === `file://${process.argv[1]}`) {
  seedInvoices();
}

export { seedInvoices };
