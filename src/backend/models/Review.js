import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  foodRating: {
    type: Number,
    min: 1,
    max: 5
  },
  serviceRating: {
    type: Number,
    min: 1,
    max: 5
  },
  deliveryRating: {
    type: Number,
    min: 1,
    max: 5
  },
  images: [{
    type: String
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  response: {
    text: String,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'pending'
  },
  flaggedReason: String,
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderatedAt: Date
}, {
  timestamps: true
});

// Indexes for better performance
reviewSchema.index({ orderId: 1 });
reviewSchema.index({ userId: 1 });
reviewSchema.index({ restaurantId: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ status: 1 });
reviewSchema.index({ createdAt: -1 });
reviewSchema.index({ isVerified: 1 });

// Pre-save middleware
reviewSchema.pre('save', function(next) {
  if (this.isModified('rating') && (this.rating < 1 || this.rating > 5)) {
    return next(new Error('Rating must be between 1 and 5'));
  }
  next();
});

// Static methods
reviewSchema.statics.getAverageRating = async function(restaurantId) {
  const stats = await this.aggregate([
    { $match: { restaurantId, status: 'approved' } },
    {
      $group: {
        _id: '$restaurantId',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  
  return stats.length > 0 ? stats[0] : { averageRating: 0, totalReviews: 0 };
};

reviewSchema.statics.getRatingDistribution = async function(restaurantId) {
  const distribution = await this.aggregate([
    { $match: { restaurantId, status: 'approved' } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  return distribution;
};

// Virtual for average of sub-ratings
reviewSchema.virtual('averageSubRatings').get(function() {
  const ratings = [this.foodRating, this.serviceRating, this.deliveryRating].filter(r => r != null);
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
});

const Review = mongoose.model('Review', reviewSchema);

export default Review;
