#!/usr/bin/env node

/**
 * Simple Invoice Seeding Script
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Invoice from '../models/Invoice.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';

// Sample data
const sampleCustomers = [
  { _id: new mongoose.Types.ObjectId(), name: 'Rajesh Kumar', email: 'rajesh.kumar@email.com', phone: '+91 98765 43210' },
  { _id: new mongoose.Types.ObjectId(), name: 'Priya Sharma', email: 'priya.sharma@email.com', phone: '+91 98765 43211' },
  { _id: new mongoose.Types.ObjectId(), name: 'Amit Patel', email: 'amit.patel@email.com', phone: '+91 98765 43212' },
  { _id: new mongoose.Types.ObjectId(), name: 'Sneha Reddy', email: 'sneha.reddy@email.com', phone: '+91 98765 43213' },
  { _id: new mongoose.Types.ObjectId(), name: 'Vikram Singh', email: 'vikram.singh@email.com', phone: '+91 98765 43214' }
];

const sampleRestaurants = [
  { 
    _id: new mongoose.Types.ObjectId(), 
    name: 'Spice Garden', 
    phone: '+91 22 2345 6789',
    address: { city: 'Mumbai', state: 'Maharashtra' },
    gstInfo: { gstNumber: '27AAAPL1234C1ZV' }
  },
  { 
    _id: new mongoose.Types.ObjectId(), 
    name: 'Delicious Bites', 
    phone: '+91 11 2345 6789',
    address: { city: 'Delhi', state: 'Delhi' },
    gstInfo: { gstNumber: '07AAAPL1234C1ZV' }
  },
  { 
    _id: new mongoose.Types.ObjectId(), 
    name: 'South Indian Express', 
    phone: '+91 80 2345 6789',
    address: { city: 'Bangalore', state: 'Karnataka' },
    gstInfo: { gstNumber: '29AAAPL1234C1ZV' }
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

function generateLineItems() {
  const itemCount = Math.floor(Math.random() * 4) + 2; // 2-5 items
  const items = [];
  let subtotal = 0;
  
  for (let i = 0; i < itemCount; i++) {
    const menuItem = sampleMenuItems[Math.floor(Math.random() * sampleMenuItems.length)];
    const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity
    const unitPrice = menuItem.price;
    const totalPrice = unitPrice * quantity;
    const taxAmount = totalPrice * 0.05; // 5% tax
    
    items.push({
      name: menuItem.name,
      description: menuItem.description,
      quantity,
      unitPrice,
      totalPrice,
      taxAmount,
      discountAmount: 0
    });
    
    subtotal += totalPrice;
  }
  
  return { items, subtotal };
}

function generateInvoices(count = 25) {
  const invoices = [];
  
  for (let i = 0; i < count; i++) {
    const customer = sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)];
    const restaurant = sampleRestaurants[Math.floor(Math.random() * sampleRestaurants.length)];
    const { items: lineItems, subtotal } = generateLineItems();
    
    const deliveryFee = Math.floor(Math.random() * 50) + 20; // 20-70
    const platformFee = Math.floor(subtotal * 0.05); // 5% platform fee
    const taxAmount = Math.floor(subtotal * 0.05); // 5% tax
    const grandTotal = subtotal + taxAmount + deliveryFee + platformFee;
    
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
      customerId: customer._id,
      vendorId: restaurant._id,
      orderId: new mongoose.Types.ObjectId(),
      paymentTransactionId: new mongoose.Types.ObjectId(),
      
      billingAddress: {
        street: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India'
      },
      shippingAddress: {
        street: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India'
      },
      
      lineItems,
      
      subtotal,
      taxAmount,
      deliveryFee,
      discountAmount: 0,
      platformFee,
      grandTotal,
      
      taxDetails: {
        cgstAmount: Math.floor(taxAmount / 2),
        sgstAmount: Math.floor(taxAmount / 2),
        igstAmount: 0,
        cgstRate: 2.5,
        sgstRate: 2.5,
        igstRate: 0
      },
      
      paymentMethod,
      paymentStatus: status === 'paid' ? 'paid' : status === 'refunded' ? 'refunded' : 'pending',
      
      gstInfo: {
        customerGstNumber: '',
        vendorGstNumber: restaurant.gstInfo?.gstNumber || '',
        isReverseCharge: false,
        placeOfSupply: restaurant.address.state,
        taxType: 'GST'
      },
      
      status,
      issueDate,
      dueDate,
      paidDate,
      
      notes: status === 'refunded' ? 'Customer requested refund due to quality issues' : 
             status === 'pending' ? 'Payment pending from customer' : 
             status === 'generated' ? 'Invoice generated, awaiting payment' : '',
      
      refundInfo: status === 'refunded' ? {
        isRefunded: true,
        refundAmount: Math.floor(grandTotal * 0.8), // 80% refund
        refundReason: 'Food quality issues',
        refundDate: paidDate || new Date(),
        refundTransactionId: new mongoose.Types.ObjectId()
      } : undefined
    });
  }
  
  return invoices;
}

async function seedInvoices() {
  try {
    console.log('🚀 Starting simple invoice seeding...\n');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Clear existing invoices
    const result = await Invoice.deleteMany({});
    console.log(`🗑️  Cleared ${result.deletedCount} existing invoices`);
    
    // Generate and save invoices
    console.log('🧾 Creating sample invoices...');
    const invoices = generateInvoices(25);
    
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
    
    console.log('\n🎉 Invoice seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding invoices:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the seeding script
seedInvoices();
