import { config } from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '../.env') });

const normalizePhone10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);

const isUserProfileComplete = (user) => {
  const hasName = !!String(user.name || '').trim();
  const hasEmail = !!String(user.email || '').trim();
  const hasDob = !!user.dateOfBirth;
  const hasPhone = normalizePhone10(user.phone).length === 10;
  const hasAltPhone = normalizePhone10(user.alternativePhone).length === 10;
  const hasPhoto = !!String(user.profilePhoto || user.avatar || '').trim();
  return hasName && hasEmail && hasDob && hasPhone && hasAltPhone && hasPhoto;
};

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing in backend/.env');
  }

  await mongoose.connect(mongoUri);
  console.log('[Backfill] Connected to MongoDB');

  const users = await User.find({}, '_id name email phone alternativePhone dateOfBirth profilePhoto avatar isProfileComplete');
  let updated = 0;
  let completeCount = 0;
  let incompleteCount = 0;

  for (const user of users) {
    const nextValue = isUserProfileComplete(user);
    if (nextValue) completeCount += 1;
    else incompleteCount += 1;

    if (user.isProfileComplete !== nextValue) {
      user.isProfileComplete = nextValue;
      await user.save();
      updated += 1;
    }
  }

  console.log('[Backfill] Total users:', users.length);
  console.log('[Backfill] Updated users:', updated);
  console.log('[Backfill] isProfileComplete=true:', completeCount);
  console.log('[Backfill] isProfileComplete=false:', incompleteCount);

  await mongoose.connection.close();
  console.log('[Backfill] Done');
}

run().catch(async (error) => {
  console.error('[Backfill] Failed:', error.message);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});

