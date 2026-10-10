import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

async function checkVendorMapping() {
  try {
    console.log('🔍 [CHECK] Checking vendor-restaurant mappings...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta');
    console.log('✅ [CHECK] Connected to MongoDB\n');

    // Find Sushi World restaurant
    const sushiWorld = await Restaurant.findOne({ name: 'Sushi World' });
    console.log('=== SUSHI WORLD RESTAURANT ===');
    if (sushiWorld) {
      console.log('Restaurant ID:', sushiWorld._id);
      console.log('Restaurant Name:', sushiWorld.name);
      console.log('Owner ID:', sushiWorld.owner);
      console.log('Status:', sushiWorld.status);
      console.log('Is Enabled:', sushiWorld.isEnabled);
      console.log('Vendor OTP Enabled:', sushiWorld.vendorOtpEnabled);
      
      // Find the vendor user who owns this restaurant
      if (sushiWorld.owner) {
        const vendorUser = await User.findById(sushiWorld.owner);
        if (vendorUser) {
          console.log('\n--- LINKED VENDOR USER ---');
          console.log('Vendor ID:', vendorUser._id);
          console.log('Vendor Name:', vendorUser.name);
          console.log('Vendor Email:', vendorUser.email);
          console.log('Vendor Phone:', vendorUser.phone);
          console.log('Vendor Role:', vendorUser.role);
          console.log('Vendor Status:', vendorUser.status);
          console.log('Is Vendor Auto-Created:', vendorUser.isVendorAutoCreated);
          console.log('Has Password:', vendorUser.password ? 'Yes' : 'No');
        } else {
          console.log('\n❌ No vendor user found with owner ID:', sushiWorld.owner);
        }
      } else {
        console.log('\n❌ No owner linked to Sushi World restaurant');
      }
    } else {
      console.log('❌ Sushi World restaurant not found in database');
    }

    console.log('\n\n=== CHECKING FOR tigergee503@gmail.com ===');
    const tigergeeUser = await User.findOne({ email: 'tigergee503@gmail.com' });
    if (tigergeeUser) {
      console.log('User ID:', tigergeeUser._id);
      console.log('User Name:', tigergeeUser.name);
      console.log('User Email:', tigergeeUser.email);
      console.log('User Phone:', tigergeeUser.phone);
      console.log('User Role:', tigergeeUser.role);
      
      // Find restaurant owned by this user
      const tigergeeRestaurant = await Restaurant.findOne({ owner: tigergeeUser._id });
      if (tigergeeRestaurant) {
        console.log('\n--- LINKED RESTAURANT ---');
        console.log('Restaurant ID:', tigergeeRestaurant._id);
        console.log('Restaurant Name:', tigergeeRestaurant.name);
        console.log('Restaurant Status:', tigergeeRestaurant.status);
      } else {
        console.log('\n❌ No restaurant found linked to tigergee503@gmail.com');
      }
    } else {
      console.log('❌ User with email tigergee503@gmail.com not found');
    }

    console.log('\n\n=== ALL VENDOR USERS ===');
    const allVendors = await User.find({ role: 'vendor' });
    console.log(`Total vendor users: ${allVendors.length}`);
    allVendors.forEach(vendor => {
      console.log(`- ${vendor.name} (${vendor.email}) - Phone: ${vendor.phone || 'N/A'} - ID: ${vendor._id}`);
    });

    console.log('\n\n=== ALL RESTAURANTS WITH OWNERS ===');
    const allRestaurants = await Restaurant.find({ owner: { $ne: null } }).populate('owner', 'name email phone role');
    console.log(`Total restaurants with owners: ${allRestaurants.length}`);
    allRestaurants.forEach(restaurant => {
      console.log(`- ${restaurant.name} -> Owner: ${restaurant.owner?.name} (${restaurant.owner?.email}) - Phone: ${restaurant.owner?.phone || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ [CHECK] Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 [CHECK] Disconnected from MongoDB');
  }
}

checkVendorMapping();
