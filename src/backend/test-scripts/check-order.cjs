require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const mongoose = require('mongoose');
require('../models/Order.js');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const order = await mongoose.model('Order').findById('6a5bdcd04ed4b58342c2782f');
  console.log('=== CURRENT ORDER STATE ===');
  console.log(JSON.stringify({ status: order.status, riderId: order.riderId, createdAt: order.createdAt }, null, 2));
  mongoose.disconnect();
}).catch(console.error);
