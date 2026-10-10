require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const notifs = await mongoose.connection.db.collection('usernotifications').find({
    userId: new mongoose.Types.ObjectId('6a3af7db9316a93ea68efd2b'),
    createdAt: { $gte: new Date('2026-07-21T23:42:51.728Z') }
  }).toArray();
  console.log('RAW RESULT:', notifs);
  await mongoose.disconnect();
}
run();
