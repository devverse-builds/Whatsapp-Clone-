const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
  {
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['audio', 'video'],
      default: 'audio',
      required: true
    },
    status: {
      type: String,
      enum: ['calling', 'accepted', 'rejected', 'missed', 'ended'],
      default: 'calling'
    },
    startedAt: {
      type: Date
    },
    endedAt: {
      type: Date
    },
    duration: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

const Call = mongoose.model('Call', callSchema);
module.exports = Call;
