const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const ORDER_ID = '6a5bdcd04ed4b58342c2782f';

async function testAll() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const adminUser = await db.collection('users').findOne({ role: 'admin' });
  if (!adminUser) {
    console.error('No admin found');
    process.exit(1);
  }
  const token = jwt.sign({ id: adminUser._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
  const order = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(ORDER_ID) });
  const userId = order.userId;
  
  const userToken = jwt.sign({ id: userId, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' });

  async function updateStatus(status) {
    try {
      const res = await axios.patch(`http://127.0.0.1:5000/api/admin/orders/${ORDER_ID}/status`, 
        { status, bypassTransitionCheck: true }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    } catch (err) {
      console.error(`Failed to update to ${status}:`, err.response ? err.response.data : err.message);
      return null;
    }
  }

  const statuses = ['Waiting for Confirmation', 'Processing', 'OnWay', 'Delivered', 'Cancelled'];
  for (const status of statuses) {
    await updateStatus(status);
    console.log(`\n✅ Successfully updated order to: ${status}`);
    // Now fetch the frontend tracking response to see what the frontend would get
    try {
      const myOrdersRes = await axios.get(`http://127.0.0.1:5000/api/orders/my-orders`, 
        { headers: { Authorization: `Bearer ${userToken}` } }
      );
      
      const apiOrder = myOrdersRes.data.data.orders.find(o => String(o._id) === ORDER_ID);
      console.log(`   -> Backend returns status: ${apiOrder.status}`);
      
      // Let's simulate the frontend logic to output the exact string
      const statusRaw = String(apiOrder.status || '').toLowerCase();
      const delivered = statusRaw.includes('deliver');
      const cancelled = statusRaw.includes('cancel');
      let summaryTitle = 'Your order is placed';
      if (delivered) summaryTitle = 'Your order was delivered';
      else if (statusRaw.includes('onway')) summaryTitle = 'Your order is on the way';
      else if (cancelled) summaryTitle = 'Your order was cancelled';
      else if (statusRaw.includes('ready')) summaryTitle = 'Your order is ready';
      else if (statusRaw.includes('process') || statusRaw.includes('progress')) summaryTitle = 'Your order is being prepared';
      
      console.log(`   -> Frontend displays text: ${summaryTitle}`);
    } catch(e) { console.error('Error fetching order:', e.response ? JSON.stringify(e.response.data) : e.message); }
  }
  
  // Revert back
  await updateStatus('Waiting for Confirmation');
  console.log('\n✅ Reverted back to Waiting for Confirmation');
  process.exit(0);
}
testAll();
