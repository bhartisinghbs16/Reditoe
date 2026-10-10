import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import Order from '../models/Order.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

// Sample data
const sampleCustomers = [
  {
    name: 'John Doe',
    email: 'john@email.com',
    password: 'customer123',
    phone: '+919876543001',
    address: '123 Customer Street, Mumbai',
    role: 'user',
    status: 'active'
  },
  {
    name: 'Jane Smith',
    email: 'jane@email.com',
    password: 'customer123',
    phone: '+919876543002',
    address: '456 Customer Avenue, Delhi',
    role: 'user',
    status: 'active'
  }
];

const sampleVendors = [
  {
    name: 'Rajesh Kumar',
    email: 'rajesh@restaurant.com',
    password: 'vendor123',
    phone: '+919876543210',
    address: '123 Main Street, Mumbai',
    role: 'vendor',
    isApproved: true,
    status: 'active'
  },
  {
    name: 'Priya Sharma',
    email: 'priya@restaurant.com',
    password: 'vendor123',
    phone: '+919876543211',
    address: '456 Park Avenue, Delhi',
    role: 'vendor',
    isApproved: true,
    status: 'active'
  }
];

const sampleRestaurants = [
  {
    name: 'Spice Garden',
    description: 'Authentic Indian cuisine with modern twist',
    address: '123 Main Street, Mumbai',
    phone: '+919876543210',
    email: 'spicegarden@email.com',
    cuisine: 'Indian',
    rating: 4.5,
    priceRange: '$$',
    image: 'spice-garden.jpg',
    isEnabled: true,
    status: 'approved'
  },
  {
    name: 'Delhi Bites',
    description: 'Traditional Delhi street food',
    address: '456 Park Avenue, Delhi',
    phone: '+919876543211',
    email: 'delhibites@email.com',
    cuisine: 'North Indian',
    rating: 4.2,
    priceRange: '$',
    image: 'delhi-bites.jpg',
    isEnabled: true,
    status: 'approved'
  }
];

const sampleFoodItems = [
  // Spice Garden items
  {
    name: 'Butter Chicken',
    description: 'Creamy tomato curry with tender chicken',
    price: 280,
    category: 'Main Course',
    image: 'butter-chicken.jpg',
    isAvailable: true,
    ingredients: 'Chicken, Butter, Cream, Tomatoes, Spices',
    preparationTime: 25,
    spiceLevel: 'Medium'
  },
  {
    name: 'Naan',
    description: 'Traditional Indian bread',
    price: 40,
    category: 'Bread',
    image: 'naan.jpg',
    isAvailable: true,
    ingredients: 'Flour, Yeast, Yogurt, Butter',
    preparationTime: 15,
    spiceLevel: 'Mild'
  },
  {
    name: 'Biryani',
    description: 'Fragrant rice with aromatic spices',
    price: 320,
    category: 'Main Course',
    image: 'biryani.jpg',
    isAvailable: true,
    ingredients: 'Rice, Chicken, Spices, Herbs',
    preparationTime: 30,
    spiceLevel: 'Medium'
  },
  // Delhi Bites items
  {
    name: 'Chole Bhature',
    description: 'Spicy chickpeas with fried bread',
    price: 180,
    category: 'Main Course',
    image: 'chole-bhature.jpg',
    isAvailable: true,
    ingredients: 'Chickpeas, Flour, Spices, Herbs',
    preparationTime: 20,
    spiceLevel: 'Medium'
  },
  {
    name: 'Samosa',
    description: 'Crispy pastry with potato filling',
    price: 60,
    category: 'Snacks',
    image: 'samosa.jpg',
    isAvailable: true,
    ingredients: 'Potatoes, Peas, Flour, Spices',
    preparationTime: 15,
    spiceLevel: 'Mild'
  }
];

function generateRandomOrders() {
  const orders = [];
  const statuses = ['Waiting for Confirmation', 'Order Confirmed', 'Processing', 'Ready', 'OnWay', 'Delivered', 'Cancelled'];
  const paymentMethods = ['cash', 'card', 'online', 'wallet'];
  const paymentStatuses = ['pending', 'paid', 'failed'];
  
  // Generate orders for the last 30 days
  for (let i = 0; i < 150; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - daysAgo);
    orderDate.setHours(orderDate.getHours() - hoursAgo);
    
    const restaurantIndex = Math.floor(Math.random() * 2);
    const itemCount = Math.floor(Math.random() * 4) + 1; // 1-4 items per order
    const items = [];
    
    for (let j = 0; j < itemCount; j++) {
      const itemIndex = restaurantIndex === 0 ? 
        Math.floor(Math.random() * 3) : // Spice Garden items (0-2)
        Math.floor(Math.random() * 2) + 3; // Delhi Bites items (3-4)
      
      const foodItem = sampleFoodItems[itemIndex];
      items.push({
        foodItemId: new mongoose.Types.ObjectId(),
        name: foodItem.name,
        price: foodItem.price,
        quantity: Math.floor(Math.random() * 3) + 1, // 1-3 quantity
        image: foodItem.image
      });
    }
    
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = Math.floor(Math.random() * 50) + 20; // 20-70 delivery fee
    const total = subtotal + deliveryFee;
    
    // Weight status selection - 60% chance of being Delivered for better analytics
    let status;
    const rand = Math.random();
    if (rand < 0.6) {
      status = 'Delivered';
    } else if (rand < 0.8) {
      status = 'Order Confirmed';
    } else if (rand < 0.9) {
      status = 'Processing';
    } else if (rand < 0.95) {
      status = 'Ready';
    } else if (rand < 0.98) {
      status = 'OnWay';
    } else {
      status = 'Cancelled';
    }
    
    orders.push({
      userId: new mongoose.Types.ObjectId(), // Will be updated with real customer ID
      customerName: `Customer ${i + 1}`,
      customerEmail: `customer${i + 1}@email.com`,
      customerPhone: `+919876543${String(i + 1).padStart(3, '0')}`,
      restaurantId: new mongoose.Types.ObjectId(), // Will be updated with real restaurant ID
      items: items,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      total: total,
      status: status,
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
      paymentStatus: status === 'Delivered' ? 'paid' : paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)],
      deliveryAddress: {
        street: `Delivery Address ${i + 1}`,
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India'
      },
      createdAt: orderDate,
      updatedAt: orderDate
    });
  }
  
  return orders;
}

async function seedDatabase() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';
    console.log('Connecting to MongoDB:', mongoUri.replace(/:[^:@]+@/, ':****@'));
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Order.deleteMany({});
    await FoodItem.deleteMany({});
    await Restaurant.deleteMany({});
    await User.deleteMany({ role: 'vendor' });
    await User.deleteMany({ role: 'user' });
    console.log('Cleared existing data');

    // Create customers
    const customers = [];
    for (const customerData of sampleCustomers) {
      const hashedPassword = await bcrypt.hash(customerData.password, 10);
      const customer = new User({
        ...customerData,
        password: hashedPassword
      });
      const savedCustomer = await customer.save();
      customers.push(savedCustomer);
      console.log(`Created customer: ${savedCustomer.name}`);
    }

    // Create vendors
    const vendors = [];
    for (const vendorData of sampleVendors) {
      const hashedPassword = await bcrypt.hash(vendorData.password, 10);
      const vendor = new User({
        ...vendorData,
        password: hashedPassword
      });
      const savedVendor = await vendor.save();
      vendors.push(savedVendor);
      console.log(`Created vendor: ${savedVendor.name}`);
    }

    // Create restaurants and link to vendors
    const restaurants = [];
    for (let i = 0; i < sampleRestaurants.length; i++) {
      const restaurant = new Restaurant({
        ...sampleRestaurants[i],
        owner: vendors[i]._id
      });
      const savedRestaurant = await restaurant.save();
      restaurants.push(savedRestaurant);
      console.log(`Created restaurant: ${savedRestaurant.name}`);
    }

    // Create food items for each restaurant
    const foodItems = [];
    for (let i = 0; i < restaurants.length; i++) {
      const restaurant = restaurants[i];
      const startIndex = i === 0 ? 0 : 3; // Spice Garden: 0-2, Delhi Bites: 3-4
      const endIndex = i === 0 ? 3 : 5;
      
      for (let j = startIndex; j < endIndex; j++) {
        const foodItem = new FoodItem({
          ...sampleFoodItems[j],
          restaurantId: restaurant._id
        });
        const savedFoodItem = await foodItem.save();
        foodItems.push(savedFoodItem);
        console.log(`Created food item: ${savedFoodItem.name} for ${restaurant.name}`);
      }
    }

    // Generate and create orders
    const orders = generateRandomOrders();
    
    // Update orders with actual restaurant, customer, and food item IDs
    for (let i = 0; i < orders.length; i++) {
      const restaurantIndex = Math.floor(Math.random() * 2);
      const customerIndex = Math.floor(Math.random() * customers.length);
      
      orders[i].restaurantId = restaurants[restaurantIndex]._id;
      orders[i].userId = customers[customerIndex]._id;
      
      // Update food item IDs based on restaurant
      orders[i].items = orders[i].items.map((item, index) => {
        const itemIndex = restaurantIndex === 0 ? index % 3 : (index % 2) + 3;
        return {
          ...item,
          foodItemId: foodItems[itemIndex]._id
        };
      });
    }
    
    const createdOrders = await Order.insertMany(orders);
    console.log(`Created ${createdOrders.length} orders`);

    // Print summary
    console.log('\n=== SEEDING SUMMARY ===');
    console.log(`Customers: ${customers.length}`);
    console.log(`Vendors: ${vendors.length}`);
    console.log(`Restaurants: ${restaurants.length}`);
    console.log(`Food Items: ${foodItems.length}`);
    console.log(`Orders: ${createdOrders.length}`);
    
    // Show restaurant-specific order counts
    for (const restaurant of restaurants) {
      const orderCount = await Order.countDocuments({ restaurantId: restaurant._id });
      console.log(`${restaurant.name}: ${orderCount} orders`);
    }

    console.log('\nDatabase seeded successfully!');
    console.log('\n=== VENDOR LOGIN CREDENTIALS ===');
    console.log('Vendor 1 - Rajesh Kumar:');
    console.log('  Email: rajesh@restaurant.com');
    console.log('  Password: vendor123');
    console.log('Vendor 2 - Priya Sharma:');
    console.log('  Email: priya@restaurant.com');
    console.log('  Password: vendor123');
    
    process.exit(0);

  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seedDatabase();
