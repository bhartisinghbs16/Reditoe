/**
 * Payment Gateway Configuration model
 * Stores multiple payment gateway configurations for admin
 */
import mongoose from 'mongoose';

const paymentGatewaySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Gateway name is required'],
    trim: true,
    unique: true,
  },
  gatewayType: {
    type: String,
    enum: ['stripe', 'cashfree', 'paypal', 'square', 'custom'],
    required: [true, 'Gateway type is required'],
  },
  apiKey: {
    type: String,
    required: [true, 'API key is required'],
  },
  secretKey: {
    type: String,
    required: [true, 'Secret key is required'],
  },
  webhookSecret: {
    type: String,
  },
  environment: {
    type: String,
    enum: ['sandbox', 'live'],
    default: 'sandbox',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  supportedMethods: {
    type: [String],
    default: ['card', 'upi', 'netbanking'],
  },
  currency: {
    type: String,
    default: 'INR',
  },
  merchantId: {
    type: String,
  },
  config: {
    // Additional gateway-specific configuration
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  lastTested: {
    type: Date,
  },
  testStatus: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'pending',
  },
  testMessage: {
    type: String,
  },
}, {
  timestamps: true,
});

// Mask sensitive fields when converting to JSON
paymentGatewaySchema.methods.toJSON = function() {
  const gateway = this.toObject();
  if (gateway.apiKey) {
    gateway.apiKey = gateway.apiKey.substring(0, 8) + '****';
  }
  if (gateway.secretKey) {
    gateway.secretKey = gateway.secretKey.substring(0, 8) + '****';
  }
  if (gateway.webhookSecret) {
    gateway.webhookSecret = gateway.webhookSecret.substring(0, 8) + '****';
  }
  return gateway;
};

const PaymentGateway = mongoose.model('PaymentGateway', paymentGatewaySchema);

export default PaymentGateway;
