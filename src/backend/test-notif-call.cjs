require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  try {
    // If process.env.MONGODB_URI fails due to DNS, try local if it's a local DB
    // But it's an Atlas cluster. We will just try connecting.
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    // Dynamic import for ES modules
    const notificationServiceModule = await import('./services/notificationService.js');
    const notificationService = notificationServiceModule.default;
    
    console.log('Sending notification...');
    const result = await notificationService.sendOrderNotification('6a5bdcd04ed4b58342c2782f', 'order_on_the_way');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error calling sendOrderNotification:', err.message, err.stack);
  }
  
  await mongoose.disconnect();
}
run();
