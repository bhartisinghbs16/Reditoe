/**
 * Email Template model for email notification system
 * Additive only - does not modify existing functionality
 */
import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['account', 'order', 'payment', 'marketing', 'notification', 'system'],
    required: true
  },
  
  // Template content
  subject: {
    type: String,
    required: true
  },
  htmlContent: {
    type: String,
    required: true
  },
  textContent: {
    type: String,
    required: true
  },
  
  // Template configuration
  variables: [{
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'date', 'object'],
      default: 'string'
    },
    required: {
      type: Boolean,
      default: false
    },
    defaultValue: mongoose.Schema.Types.Mixed
  }],
  
  // Template metadata
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  version: {
    type: Number,
    default: 1
  },
  
  // Usage tracking
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: Date,
  
  // Organization support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  
  // Template styling
  styling: {
    headerColor: {
      type: String,
      default: '#007bff'
    },
    footerColor: {
      type: String,
      default: '#6c757d'
    },
    fontFamily: {
      type: String,
      default: 'Arial, sans-serif'
    },
    logoUrl: String
  },
  
  // Sending configuration
  sendingConfig: {
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    },
    retryAttempts: {
      type: Number,
      default: 3
    },
    retryDelay: {
      type: Number,
      default: 300 // seconds
    }
  },
  
  // Preview data
  previewData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for performance
emailTemplateSchema.index({ category: 1 });
emailTemplateSchema.index({ isActive: 1 });
emailTemplateSchema.index({ organizationId: 1 });

// Instance methods
emailTemplateSchema.methods.render = function(data = {}) {
  const handlebars = require('handlebars');
  
  // Register helpers
  handlebars.registerHelper('formatDate', (date, format) => {
    if (!date) return '';
    const d = new Date(date);
    if (format === 'short') {
      return d.toLocaleDateString();
    } else if (format === 'long') {
      return d.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
    return d.toISOString();
  });
  
  handlebars.registerHelper('formatCurrency', (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  });
  
  handlebars.registerHelper('capitalize', (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  
  // Merge with default values
  const templateData = { ...this.previewData, ...data };
  
  // Compile templates
  const subjectTemplate = handlebars.compile(this.subject);
  const htmlTemplate = handlebars.compile(this.htmlContent);
  const textTemplate = handlebars.compile(this.textContent);
  
  return {
    subject: subjectTemplate(templateData),
    html: htmlTemplate(templateData),
    text: textTemplate(templateData)
  };
};

emailTemplateSchema.methods.validateVariables = function(data = {}) {
  const errors = [];
  
  for (const variable of this.variables) {
    if (variable.required && !data[variable.name]) {
      errors.push(`Required variable '${variable.name}' is missing`);
    }
    
    if (data[variable.name] && variable.type === 'number' && isNaN(data[variable.name])) {
      errors.push(`Variable '${variable.name}' must be a number`);
    }
    
    if (data[variable.name] && variable.type === 'boolean' && typeof data[variable.name] !== 'boolean') {
      errors.push(`Variable '${variable.name}' must be a boolean`);
    }
    
    if (data[variable.name] && variable.type === 'date' && !(data[variable.name] instanceof Date) && isNaN(Date.parse(data[variable.name]))) {
      errors.push(`Variable '${variable.name}' must be a valid date`);
    }
  }
  
  return errors;
};

emailTemplateSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

// Static methods
emailTemplateSchema.statics.getDefaultTemplates = function() {
  return this.find({ isDefault: true, isActive: true });
};

emailTemplateSchema.statics.getTemplatesByCategory = function(category, organizationId = null) {
  const filter = { category, isActive: true };
  if (organizationId) {
    filter.organizationId = organizationId;
  } else {
    filter.organizationId = null; // Global templates
  }
  
  return this.find(filter).sort({ displayName: 1 });
};

emailTemplateSchema.statics.renderTemplate = function(templateName, data = {}, organizationId = null) {
  return this.findOne({ 
    name: templateName, 
    isActive: true,
    $or: [
      { organizationId: organizationId },
      { organizationId: null }
    ]
  })
  .sort({ organizationId: -1 }) // Prefer organization-specific templates
  .then(template => {
    if (!template) {
      throw new Error(`Email template '${templateName}' not found`);
    }
    
    const errors = template.validateVariables(data);
    if (errors.length > 0) {
      throw new Error(`Template validation failed: ${errors.join(', ')}`);
    }
    
    // Increment usage count
    template.incrementUsage();
    
    return template.render(data);
  });
};

// Pre-save middleware
emailTemplateSchema.pre('save', function(next) {
  if (this.isModified('htmlContent') || this.isModified('textContent')) {
    // Basic template validation
    if (!this.htmlContent.includes('{{') && !this.htmlContent.includes('}}')) {
      return next(new Error('Template must contain at least one variable placeholder'));
    }
  }
  
  next();
});

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);

export default EmailTemplate;
