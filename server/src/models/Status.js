const mongoose = require('mongoose');

const statusViewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const statusSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['text', 'image', 'video'],
      default: 'text'
    },
    content: {
      type: String,
      trim: true,
      default: ''
    },
    backgroundColor: {
      type: String,
      default: '#075E54'
    },
    mediaUrl: {
      type: String,
      default: ''
    },
    viewers: [statusViewSchema],
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expires: 0 } // MongoDB TTL index to auto-remove expired statuses
    }
  },
  {
    timestamps: true
  }
);

statusSchema.index({ userId: 1, createdAt: -1 });

const Status = mongoose.model('Status', statusSchema);
module.exports = Status;
