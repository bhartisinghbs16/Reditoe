#!/usr/bin/env node

/**
 * Direct MongoDB Invoice Seeding
 * Bypasses Mongoose models and inserts directly into MongoDB
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';

function generateInvoiceNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
}

function generateInvoices() {
  const invoices = [];
  
  for (let i = 1; i <= 20; i++) {
    const baseDate = new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000);
    const subtotal = Math.floor(Math.random() * 2000) + 500; // 500-2500
    const taxAmount = Math.floor(subtotal * 0.05); // 5% tax
    const deliveryFee = Math.floor(Math.random() * 50) + 20; // 20-70
    const platformFee = Math.floor(subtotal * 0.05); // 5% platform fee
    const grandTotal = subtotal + taxAmount + deliveryFee + platformFee;
    
    const statuses = ['generated', 'paid', 'pending', 'refunded'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    const paymentMethods = ['cash', 'card', 'online', 'wallet'];
    const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    
    let paidDate = null;
    let notes = '';
    let refundInfo = undefined;
    
    if (status === 'paid') {
      paidDate = new Date(baseDate.getTime() + Math.floor(Math.random() * 5) * 24 * 60 * 60 * 1000);
      notes = 'Payment completed successfully';
    } else if (status === 'pending') {
      notes = 'Payment pending from customer';
    } else if (status === 'generated') {
      notes = 'Invoice generated, awaiting payment';
    } else if (status === 'refunded') {
      paidDate = new Date(baseDate.getTime() + Math.floor(Math.random() * 3) * 24 * 60 * 60 * 1000);
      notes = 'Customer requested refund due to quality issues';
      refundInfo = {
        isRefunded: true,
        refundAmount: Math.floor(grandTotal * 0.8), // 80% refund
        refundReason: 'Food quality issues',
        refundDate: new Date(paidDate.getTime() + Math.floor(Math.random() * 7) * 24 * 60 * 60 * 1000)
      };
    }
    
    invoices.push({
      _id: new MongoClient.ObjectId().toString(),
      invoiceNumber: generateInvoiceNumber(),
      orderId: new MongoClient.ObjectId().toString(),
      customerId: '6983978d6149e5b4b07eec77', // Using admin ID for simplicity
      vendorId: new MongoClient.ObjectId().toString(),
      paymentTransactionId: new MongoClient.ObjectId().toString(),
      
      billingAddress: {
        street: `${123 + i} Main Street`,
        city: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata'][Math.floor(Math.random() * 5)],
        state: ['Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'West Bengal'][Math.floor(Math.random() * 5)],
        zipCode: String(400001 + i),
        country: 'India'
      },
      shippingAddress: {
        street: `${123 + i} Main Street`,
        city: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata'][Math.floor(Math.random() * 5)],
        state: ['Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'West Bengal'][Math.floor(Math.random() * 5)],
        zipCode: String(400001 + i),
        country: 'India'
      },
      
      lineItems: [
        {
          name: ['Butter Chicken', 'Paneer Tikka', 'Biryani', 'Masala Dosa', 'Dal Makhani'][Math.floor(Math.random() * 5)],
          description: 'Delicious food item',
          quantity: Math.floor(Math.random() * 3) + 1,
          unitPrice: Math.floor(Math.random() * 300) + 100,
          totalPrice: 0, // Will be calculated
          taxAmount: 0,
          discountAmount: 0
        },
        {
          name: ['Naan', 'Roti', 'Rice', 'Samosa', 'Salad'][Math.floor(Math.random() * 5)],
          description: 'Side dish',
          quantity: Math.floor(Math.random() * 4) + 1,
          unitPrice: Math.floor(Math.random() * 100) + 30,
          totalPrice: 0, // Will be calculated
          taxAmount: 0,
          discountAmount: 0
        }
      ],
      
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
        vendorGstNumber: ['27AAAPL1234C1ZV', '07AAAPL1234C1ZV', '29AAAPL1234C1ZV'][Math.floor(Math.random() * 3)],
        isReverseCharge: false,
        placeOfSupply: ['Maharashtra', 'Delhi', 'Karnataka'][Math.floor(Math.random() * 3)],
        taxType: 'GST'
      },
      
      status,
      issueDate: baseDate,
      dueDate: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days after issue
      paidDate,
      
      notes,
      refundInfo,
      
      createdAt: baseDate,
      updatedAt: baseDate,
      __v: 0
    });
  }
  
  // Calculate line item totals
  invoices.forEach(invoice => {
    invoice.lineItems.forEach(item => {
      item.totalPrice = item.quantity * item.unitPrice;
      item.taxAmount = Math.floor(item.totalPrice * 0.05);
    });
  });
  
  return invoices;
}

async function seedInvoicesDirectly() {
  let client;
  try {
    console.log('🚀 Starting direct MongoDB invoice seeding...\n');
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const invoicesCollection = db.collection('invoices');
    
    // Clear existing invoices
    const deleteResult = await invoicesCollection.deleteMany({});
    console.log(`🗑️  Cleared ${deleteResult.deletedCount} existing invoices`);
    
    // Generate and insert invoices
    console.log('🧾 Creating sample invoices...');
    const invoices = generateInvoices();
    
    const insertResult = await invoicesCollection.insertMany(invoices);
    console.log(`✅ Successfully created ${insertResult.insertedCount} sample invoices`);
    
    console.log('\n📊 Invoice Summary:');
    console.log(`   - Total Invoices: ${invoices.length}`);
    console.log(`   - Paid: ${invoices.filter(inv => inv.status === 'paid').length}`);
    console.log(`   - Pending: ${invoices.filter(inv => inv.status === 'pending').length}`);
    console.log(`   - Generated: ${invoices.filter(inv => inv.status === 'generated').length}`);
    console.log(`   - Refunded: ${invoices.filter(inv => inv.status === 'refunded').length}`);
    
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    console.log(`   - Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')}`);
    
    console.log('\n🎉 Invoice seeding completed successfully!');
    console.log('🔄 Refresh the invoice management page to see the data.');
    
  } catch (error) {
    console.error('❌ Error seeding invoices:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (client) {
      await client.close();
      console.log('\n👋 Disconnected from MongoDB');
    }
  }
}

// Run the seeding script
seedInvoicesDirectly();
