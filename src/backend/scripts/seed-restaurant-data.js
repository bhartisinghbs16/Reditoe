import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

// Sample vendor users
const sampleVendors = [
  {
    name: 'Pizza Palace Vendor',
    email: 'pizza@vendor.com',
    password: 'vendor123',
    phone: '+919876543210',
    role: 'vendor',
    isVendorAutoCreated: false,
    status: 'active'
  },
  {
    name: 'Burger House Vendor',
    email: 'burger@vendor.com',
    password: 'vendor123',
    phone: '+919876543211',
    role: 'vendor',
    isVendorAutoCreated: false,
    status: 'active'
  },
  {
    name: 'Sushi World Vendor',
    email: 'sushi@vendor.com',
    password: 'vendor123',
    phone: '+919876543212',
    role: 'vendor',
    isVendorAutoCreated: false,
    status: 'active'
  }
];

// Sample restaurants
const sampleRestaurants = [
  {
    name: 'Pizza Palace',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
    rating: 4.5,
    deliveryTime: '30-40 min',
    deliveryFee: 2.99,
    categories: ['Pizza', 'Italian', 'Fast Food'],
    isFeatured: true,
    status: 'approved',
    isEnabled: true,
    isApproved: true,
    isActive: true,
    isOpen: true,
    description: 'Authentic Italian pizza with fresh ingredients',
    address: {
      street: '123 Pizza Street',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      coordinates: {
        latitude: 30.5225887,
        longitude: 72.6882866
      }
    },
    phone: '+12125551234',
    openingHours: '10:00 AM - 10:00 PM',
    foodType: 'both',
    deliveryRadius: 5
  },
  {
    name: 'Burger House',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800',
    rating: 4.3,
    deliveryTime: '25-35 min',
    deliveryFee: 1.99,
    categories: ['Burgers', 'American', 'Fast Food'],
    isFeatured: true,
    status: 'approved',
    isEnabled: true,
    isApproved: true,
    isActive: true,
    isOpen: true,
    description: 'Juicy burgers made with premium beef',
    address: {
      street: '456 Burger Avenue',
      city: 'New York',
      state: 'NY',
      zipCode: '10002',
      coordinates: {
        latitude: 30.5257,
        longitude: 72.6732
      }
    },
    phone: '+12125555678',
    openingHours: '11:00 AM - 11:00 PM',
    foodType: 'both',
    deliveryRadius: 5
  },
  {
    name: 'Sushi World',
    image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800',
    rating: 4.7,
    deliveryTime: '35-45 min',
    deliveryFee: 3.99,
    categories: ['Sushi', 'Japanese', 'Asian'],
    isFeatured: true,
    status: 'approved',
    isEnabled: true,
    isApproved: true,
    isActive: true,
    isOpen: true,
    description: 'Fresh sushi and Japanese cuisine',
    address: {
      street: '789 Sushi Lane',
      city: 'New York',
      state: 'NY',
      zipCode: '10003',
      coordinates: {
        latitude: 30.5292,
        longitude: 72.6816
      }
    },
    phone: '+12125559012',
    openingHours: '12:00 PM - 9:30 PM',
    foodType: 'both',
    deliveryRadius: 5
  }
];

// Sample food items
const sampleFoodItems = [
  // Pizza Palace items
  {
    name: 'Margherita Pizza',
    price: 12.99,
    description: 'Classic pizza with tomato sauce, mozzarella, and fresh basil',
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400',
    category: 'Pizza',
    isAvailable: true,
    preparationTime: 20
  },
  {
    name: 'Pepperoni Pizza',
    price: 14.99,
    description: 'Pizza topped with pepperoni and extra cheese',
    image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400',
    category: 'Pizza',
    isAvailable: true,
    preparationTime: 20
  },
  {
    name: 'BBQ Chicken Pizza',
    price: 15.99,
    description: 'Pizza with BBQ sauce, chicken, and red onions',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400',
    category: 'Pizza',
    isAvailable: true,
    preparationTime: 22
  },
  {
    name: 'Garlic Bread',
    price: 4.99,
    description: 'Crispy bread with garlic butter and herbs',
    image: 'https://images.unsplash.com/photo-1619535860434-ba1d8fa12536?w=400',
    category: 'Sides',
    isAvailable: true,
    preparationTime: 10
  },
  {
    name: 'Caesar Salad',
    price: 7.99,
    description: 'Fresh romaine lettuce with caesar dressing and croutons',
    image: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400',
    category: 'Salads',
    isAvailable: true,
    preparationTime: 8
  },
  // Burger House items
  {
    name: 'Classic Cheeseburger',
    price: 9.99,
    description: 'Beef patty with cheddar cheese, lettuce, tomato, and pickles',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400',
    category: 'Burgers',
    isAvailable: true,
    preparationTime: 15
  },
  {
    name: 'Bacon Burger',
    price: 11.99,
    description: 'Beef patty with crispy bacon, cheese, and special sauce',
    image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400',
    category: 'Burgers',
    isAvailable: true,
    preparationTime: 16
  },
  {
    name: 'Veggie Burger',
    price: 10.99,
    description: 'Plant-based patty with avocado, sprouts, and vegan mayo',
    image: 'https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400',
    category: 'Burgers',
    isAvailable: true,
    preparationTime: 14
  },
  {
    name: 'French Fries',
    price: 3.99,
    description: 'Crispy golden fries with sea salt',
    image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400',
    category: 'Sides',
    isAvailable: true,
    preparationTime: 12
  },
  {
    name: 'Onion Rings',
    price: 4.49,
    description: 'Crispy battered onion rings',
    image: 'https://images.unsplash.com/photo-1639024471283-03518883512d?w=400',
    category: 'Sides',
    isAvailable: true,
    preparationTime: 10
  },
  // Sushi World items
  {
    name: 'California Roll',
    price: 8.99,
    description: 'Crab, avocado, and cucumber roll',
    image: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400',
    category: 'Sushi',
    isAvailable: true,
    preparationTime: 15
  },
  {
    name: 'Spicy Tuna Roll',
    price: 10.99,
    description: 'Spicy tuna with cucumber and sriracha',
    image: 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=400',
    category: 'Sushi',
    isAvailable: true,
    preparationTime: 15
  },
  {
    name: 'Salmon Nigiri',
    price: 12.99,
    description: 'Fresh salmon over seasoned rice',
    image: 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=400',
    category: 'Sushi',
    isAvailable: true,
    preparationTime: 12
  },
  {
    name: 'Miso Soup',
    price: 3.99,
    description: 'Traditional Japanese miso soup with tofu and seaweed',
    image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400',
    category: 'Soups',
    isAvailable: true,
    preparationTime: 5
  },
  {
    name: 'Edamame',
    price: 4.49,
    description: 'Steamed soybeans with sea salt',
    image: 'https://images.unsplash.com/photo-1560717789-0ac7c58ac90a?w=400',
    category: 'Appetizers',
    isAvailable: true,
    preparationTime: 6
  }
];

async function seedRestaurantData() {
  try {
    console.log('🌱 [SEED] Starting restaurant data seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta');
    console.log('✅ [SEED] Connected to MongoDB');

    // Clear existing test data
    await FoodItem.deleteMany({});
    console.log('🗑️ [SEED] Cleared existing food items');
    
    await Restaurant.deleteMany({});
    console.log('🗑️ [SEED] Cleared existing restaurants');
    
    await User.deleteMany({ role: 'vendor', email: { $in: sampleVendors.map(v => v.email) } });
    console.log('🗑️ [SEED] Cleared existing test vendor users');

    // Create vendor users
    const createdVendors = [];
    for (const vendor of sampleVendors) {
      const hashedPassword = await bcrypt.hash(vendor.password, 12);
      const newVendor = await User.create({
        ...vendor,
        password: hashedPassword
      });
      createdVendors.push(newVendor);
      console.log(`✅ [SEED] Created vendor user: ${vendor.email}`);
    }

    // Create restaurants linked to vendors
    const createdRestaurants = [];
    for (let i = 0; i < sampleRestaurants.length; i++) {
      const restaurant = await Restaurant.create({
        ...sampleRestaurants[i],
        owner: createdVendors[i]._id
      });
      createdRestaurants.push(restaurant);
      console.log(`✅ [SEED] Created restaurant: ${restaurant.name}`);
    }

    // Create food items linked to restaurants
    const foodItemsPerRestaurant = Math.floor(sampleFoodItems.length / createdRestaurants.length);
    let foodItemIndex = 0;
    
    for (let i = 0; i < createdRestaurants.length; i++) {
      const restaurantFoodItems = [];
      const itemsForThisRestaurant = sampleFoodItems.slice(
        foodItemIndex,
        foodItemIndex + foodItemsPerRestaurant
      );
      
      // Add remaining items to last restaurant if any
      if (i === createdRestaurants.length - 1 && foodItemIndex + foodItemsPerRestaurant < sampleFoodItems.length) {
        itemsForThisRestaurant.push(...sampleFoodItems.slice(foodItemIndex + foodItemsPerRestaurant));
      }
      
      for (const item of itemsForThisRestaurant) {
        const foodItem = await FoodItem.create({
          ...item,
          restaurantId: createdRestaurants[i]._id
        });
        restaurantFoodItems.push(foodItem);
      }
      
      console.log(`✅ [SEED] Created ${restaurantFoodItems.length} food items for ${createdRestaurants[i].name}`);
      foodItemIndex += foodItemsPerRestaurant;
    }

    // Summary
    const totalVendors = createdVendors.length;
    const totalRestaurants = createdRestaurants.length;
    const totalFoodItems = await FoodItem.countDocuments();

    console.log('\n🎉 [SEED] Restaurant data seeding completed successfully!');
    console.log(`📊 [SEED] Summary:`);
    console.log(`   - Vendor users created: ${totalVendors}`);
    console.log(`   - Restaurants created: ${totalRestaurants}`);
    console.log(`   - Food items created: ${totalFoodItems}`);
    console.log(`   - All restaurants status: approved, enabled: true`);
    console.log(`   - All food items status: available`);
    
  } catch (error) {
    console.error('❌ [SEED] Error seeding restaurant data:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 [SEED] Disconnected from MongoDB');
  }
}

seedRestaurantData();
