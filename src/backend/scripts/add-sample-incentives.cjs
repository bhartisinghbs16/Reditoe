/**
 * CommonJS script to create sample incentive templates
 * Run with: node scripts/add-sample-incentives.cjs
 */

const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vinsta');

const sampleTemplates = [
  {
    name: "Weekend Warrior",
    description: "Complete 15 orders this weekend for extra reward!",
    type: "orders_completed",
    targetValue: 15,
    rewardAmount: 250,
    periodType: "weekly",
    difficulty: "medium",
    category: "engagement",
    tags: ["weekend", "orders", "bonus"],
    conditions: {
      minOrderValue: 50
    },
    priority: 10,
    isActive: true
  },
  {
    name: "Daily Earner",
    description: "Earn ₹500 in a single day",
    type: "earnings_target",
    targetValue: 500,
    rewardAmount: 100,
    periodType: "daily",
    difficulty: "hard",
    category: "performance",
    tags: ["daily", "earnings", "target"],
    priority: 8,
    isActive: true
  },
  {
    name: "Rating Star",
    description: "Maintain 4.5+ average rating for 30 days",
    type: "rating_target",
    targetValue: 4.5,
    rewardAmount: 150,
    periodType: "monthly",
    difficulty: "medium",
    category: "quality",
    tags: ["rating", "quality", "customer"],
    priority: 7,
    isActive: true
  },
  {
    name: "Peak Hours Pro",
    description: "Complete 8 orders during peak hours (6PM-10PM)",
    type: "orders_completed",
    targetValue: 8,
    rewardAmount: 120,
    periodType: "daily",
    difficulty: "medium",
    category: "performance",
    tags: ["peak", "time", "efficiency"],
    conditions: {
      timeRestrictions: ["peak_hours"]
    },
    priority: 9,
    isActive: true
  },
  {
    name: "Morning Hustle",
    description: "Complete 5 orders before 12 PM",
    type: "orders_completed",
    targetValue: 5,
    rewardAmount: 60,
    periodType: "daily",
    difficulty: "easy",
    category: "engagement",
    tags: ["morning", "early", "bonus"],
    conditions: {
      timeRestrictions: ["morning"]
    },
    priority: 5,
    isActive: true
  }
];

async function createSampleIncentives() {
  try {
    console.log('Creating sample incentive templates...');
    
    // Define the schema inline to avoid import issues
    const incentiveTemplateSchema = new mongoose.Schema({
      name: String,
      description: String,
      type: String,
      targetValue: Number,
      rewardAmount: Number,
      periodType: String,
      difficulty: String,
      category: String,
      tags: [String],
      conditions: Object,
      priority: Number,
      isActive: Boolean,
      createdBy: mongoose.Schema.Types.ObjectId,
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });
    
    const IncentiveTemplate = mongoose.model('IncentiveTemplate', incentiveTemplateSchema);
    
    // Get an admin user to set as createdBy
    const User = mongoose.model('User', new mongoose.Schema({
      name: String,
      email: String,
      role: String
    }));
    
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('No admin user found. Creating a dummy admin user...');
      const dummyAdmin = new User({
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin'
      });
      await dummyAdmin.save();
      console.log('Created dummy admin user');
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const templateData of sampleTemplates) {
      try {
        // Check if template already exists
        const existingTemplate = await IncentiveTemplate.findOne({ 
          name: templateData.name 
        });

        if (existingTemplate) {
          // Update existing template
          Object.assign(existingTemplate, templateData, {
            updatedAt: new Date()
          });
          await existingTemplate.save();
          console.log(`✅ Updated template: ${templateData.name}`);
          updatedCount++;
        } else {
          // Create new template
          const template = new IncentiveTemplate({
            ...templateData,
            createdBy: adminUser?._id || dummyAdmin._id
          });
          await template.save();
          console.log(`✅ Created template: ${templateData.name}`);
          createdCount++;
        }
      } catch (error) {
        console.error(`❌ Error creating template ${templateData.name}:`, error.message);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${createdCount} new templates`);
    console.log(`   Updated: ${updatedCount} existing templates`);
    console.log(`   Total: ${createdCount + updatedCount} templates processed`);

    // Get total count
    const totalTemplates = await IncentiveTemplate.countDocuments({ isActive: true });
    console.log(`   Active templates in system: ${totalTemplates}`);

  } catch (error) {
    console.error('Error creating sample incentives:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run the script
createSampleIncentives();
