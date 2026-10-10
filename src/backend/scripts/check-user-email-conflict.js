import mongoose from 'mongoose';
import User from '../models/User.js';

const emailArg = (process.argv[2] || '').trim().toLowerCase();

if (!emailArg) {
  console.error('Usage: node scripts/check-user-email-conflict.js <email>');
  process.exit(1);
}

const run = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is missing');
    }

    await mongoose.connect(mongoUri);

    const users = await User.find({ email: emailArg })
      .select('_id email phone isProfileComplete createdAt role')
      .sort({ createdAt: 1 })
      .lean();

    console.log(`[Email Check] email=${emailArg}`);
    console.log(`[Email Check] matches=${users.length}`);

    users.forEach((user, index) => {
      console.log(
        JSON.stringify(
          {
            row: index + 1,
            id: String(user._id),
            email: user.email || '',
            phone: user.phone || '',
            isProfileComplete: user.isProfileComplete === true,
            role: user.role || '',
            createdAt: user.createdAt || null,
          },
          null,
          2
        )
      );
    });
  } catch (error) {
    console.error('[Email Check] failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
};

run();
