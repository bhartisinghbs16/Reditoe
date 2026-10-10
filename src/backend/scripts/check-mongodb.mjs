/**
 * Checks an Atlas connection string before anything depends on it.
 *
 *   node scripts/check-mongodb.mjs "mongodb+srv://user:pass@host/db"
 *
 * A connection string that merely connects is not enough: the API writes on
 * every order, so this proves it can write and clean up after itself, and
 * says plainly which of the usual three things is wrong when it cannot -
 * a password with an unescaped character, an IP that was never allowed, or a
 * user with read-only rights.
 */
import mongoose from 'mongoose';

const uri = process.argv[2] || process.env.MONGODB_URI;

if (!uri) {
  console.error('Pass the connection string, or set MONGODB_URI.');
  process.exit(1);
}

// The password sits between the last ':' and the '@'; never print it back.
const safe = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:••••@');
console.log('Checking', safe, '\n');

if (/[<>]/.test(uri)) {
  console.error('The string still has <placeholders> in it - replace them with the real user and password.');
  process.exit(1);
}

const start = Date.now();

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('connected           ok  (' + (Date.now() - start) + 'ms)');

  const admin = mongoose.connection.db.admin();
  const info = await admin.serverStatus().catch(() => null);
  if (info) console.log('server              ' + info.version + '  ' + (info.host ?? ''));
  console.log('database            ' + mongoose.connection.name);

  const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  console.log('collections         ' + (names.length ? names.length + ' (' + names.slice(0, 5).join(', ') + (names.length > 5 ? ', …' : '') + ')' : 'none yet - a new cluster'));

  // The write test, which is the one that matters.
  const probe = mongoose.connection.db.collection('__reditoe_write_check');
  const { insertedId } = await probe.insertOne({ at: new Date() });
  await probe.deleteOne({ _id: insertedId });
  await probe.drop().catch(() => {});
  console.log('write access        ok');

  console.log('\nGood to use. Put it in backend/.env as MONGODB_URI.');
  await mongoose.disconnect();
} catch (error) {
  const message = String(error?.message ?? error);
  console.error('\nFAILED:', message, '\n');

  if (/authentication failed|bad auth/i.test(message)) {
    console.error('The username or password is wrong.');
    console.error('If the password contains @ : / ? # [ ] or %, it has to be percent-encoded');
    console.error('in the string - an @ in a password ends the password early. Simplest fix is');
    console.error('to set a password of letters and digits only in Database Access.');
  } else if (/timed out|ENOTFOUND|ECONNREFUSED|querySrv/i.test(message)) {
    console.error('Could not reach the cluster. Almost always Network Access: this machine\'s');
    console.error('IP is not on the allow list. Add it in Atlas under Network Access, and add');
    console.error('the EC2 IP too before deploying.');
  } else if (/not authorized/i.test(message)) {
    console.error('The user connected but may not write. Give it "Read and write to any');
    console.error('database" in Database Access.');
  }
  process.exit(1);
}
