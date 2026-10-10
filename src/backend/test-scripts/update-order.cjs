require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const mongoose = require('mongoose');
require('../models/User.js');
require('../models/Order.js');

// Hard timeout to prevent hanging
setTimeout(() => {
  console.error('❌ Script timed out after 10 seconds.');
  process.exit(1);
}, 10000);

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000
}).then(async () => {
  await mongoose.model('Order').updateOne(
    { _id: '6a5bdcd04ed4b58342c2782f' },
    { $set: { status: 'OnWay', riderId: '6a08aac768c45b0d4e9a6ad3' } }
  );
  console.log('✅ DB update applied.');
  const order = await mongoose.model('Order').findById('6a5bdcd04ed4b58342c2782f');
  console.log('=== CONFIRM ORDER STATE ===');
  console.log(JSON.stringify({ status: order.status, riderId: order.riderId, createdAt: order.createdAt }, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
