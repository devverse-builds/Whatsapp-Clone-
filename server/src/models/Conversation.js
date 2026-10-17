const mongoose = require('mongoose');
const { CONVERSATION_TYPES, ROLES } = require('../config/constants');

const participantRoleSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: [ROLES.ADMIN, ROLES.MEMBER],
      default: ROLES.MEMBER
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [CONVERSATION_TYPES.DIRECT, CONVERSATION_TYPES.GROUP],
      default: CONVERSATION_TYPES.DIRECT,
      required: true
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    participantRoles: [participantRoleSchema],
    groupMeta: {
      name: {
        type: String,
        trim: true,
        maxlength: [100, 'Group name cannot exceed 100 characters']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [500, 'Group description cannot exceed 500 characters'],
        default: ''
      },
      avatar: {
        type: String,
        default: ''
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    pinnedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    archivedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    mutedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    unreadCounts: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true }
  }
);

// Compound indexes for fast retrieval
conversationSchema.index({ participants: 1, lastActivityAt: -1 });
conversationSchema.index({ 'groupMeta.name': 'text' });

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;
