/**
 * Seed initial RBAC roles for the system
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Role from '../models/Role.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vinsta';

const initialRoles = [
  {
    name: 'super_admin',
    displayName: 'Super Admin',
    description: 'Full system access with all permissions',
    permissions: [
      { resource: 'users', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'vendors', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'riders', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'orders', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'restaurants', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'analytics', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'marketing', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'financial', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'settings', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'backups', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'notifications', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'reports', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'dashboard', actions: ['create', 'read', 'update', 'delete', 'manage'] }
    ],
    level: 1
  },
  {
    name: 'finance_admin',
    displayName: 'Finance Admin',
    description: 'Manages financial operations, payouts, and settlements',
    permissions: [
      { resource: 'orders', actions: ['read'] },
      { resource: 'vendors', actions: ['read', 'update'] },
      { resource: 'financial', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'analytics', actions: ['read'] },
      { resource: 'reports', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'dashboard', actions: ['read'] }
    ],
    level: 2
  },
  {
    name: 'marketing_admin',
    displayName: 'Marketing Admin',
    description: 'Manages marketing campaigns, coupons, and promotions',
    permissions: [
      { resource: 'users', actions: ['read'] },
      { resource: 'marketing', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'analytics', actions: ['read'] },
      { resource: 'notifications', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'reports', actions: ['read'] },
      { resource: 'dashboard', actions: ['read'] }
    ],
    level: 3
  },
  {
    name: 'support_admin',
    displayName: 'Support Admin',
    description: 'Manages customer support, vendors, and riders',
    permissions: [
      { resource: 'users', actions: ['read', 'update'] },
      { resource: 'vendors', actions: ['read', 'update'] },
      { resource: 'riders', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'orders', actions: ['read', 'update'] },
      { resource: 'notifications', actions: ['create', 'read', 'update'] },
      { resource: 'reports', actions: ['read'] },
      { resource: 'dashboard', actions: ['read'] }
    ],
    level: 4
  }
];

const seedRoles = async () => {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    
    console.log('🗑️ Clearing existing roles...');
    await Role.deleteMany({});
    
    console.log('📦 Creating initial roles...');
    const createdRoles = await Role.insertMany(initialRoles);
    
    console.log('✅ Successfully created roles:');
    createdRoles.forEach(role => {
      console.log(`   - ${role.displayName} (${role.name}) - Level ${role.level}`);
    });
    
    console.log(`\n🎉 ${createdRoles.length} roles seeded successfully!`);
    
  } catch (error) {
    console.error('❌ Error seeding roles:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
};

seedRoles();
