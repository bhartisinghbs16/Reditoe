const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' });

async function run() {
  const adminId = '6a08297b68c45b0d4e9a6163'; 
  const JWT_SECRET = process.env.JWT_SECRET;
  
  // Generate Admin JWT
  const token = jwt.sign({ id: adminId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  
  const orderId = '6a5bdcd04ed4b58342c2782f';
  
  // Connect to DB to check initial state
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const initialOrder = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(orderId) });
  console.log('INITIAL ORDER STATE:');
  console.log('Status:', initialOrder.status);
  console.log('RiderId:', initialOrder.riderId);
  
  const targetStatus = 'OnWay';
  
  console.log(`\nTriggering API PATCH /api/admin/orders/${orderId}/status to ${targetStatus}...`);
  const triggerTime = new Date().toISOString();
  console.log('TRIGGER TIMESTAMP:', triggerTime);
  
  const response = await fetch(`http://localhost:5000/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ status: targetStatus, bypassTransitionCheck: true })
  });
  
  const responseData = await response.json();
  console.log('API RESPONSE STATUS:', response.status);
  console.log('API RESPONSE:', JSON.stringify(responseData, null, 2));
  
  // Wait a couple seconds for async notification creation
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\nChecking for newly stored notifications for user', initialOrder.userId);
  const notifications = await db.collection('usernotifications').find({
    userId: initialOrder.userId,
    createdAt: { $gte: new Date(triggerTime) }
  }).toArray();
  
  console.log(`Found ${notifications.length} new notifications.`);
  if (notifications.length > 0) {
    console.log('NOTIFICATION RECORD(S):');
    console.log(JSON.stringify(notifications, null, 2));
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
