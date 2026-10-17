const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { CONVERSATION_TYPES } = require('../config/constants');
const { isValidObjectId } = require('../validators/chatValidators');

const getConversations = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({
      participants: userId,
      deletedFor: { $ne: userId }
    })
      .populate('participants', 'displayName username avatar isOnline lastSeen about')
      .populate('lastMessage')
      .sort({ lastActivityAt: -1 });

    const formatted = conversations.map((conv) => {
      const convObj = conv.toJSON();
      const userIdStr = userId.toString();

      convObj.isPinned = conv.pinnedBy.some((id) => id.toString() === userIdStr);
      convObj.isArchived = conv.archivedBy.some((id) => id.toString() === userIdStr);
      convObj.isMuted = conv.mutedBy.some((id) => id.toString() === userIdStr);
      convObj.unreadCount = (conv.unreadCounts && conv.unreadCounts.get(userIdStr)) || 0;

      // If direct chat, populate opponent details directly
      if (conv.type === CONVERSATION_TYPES.DIRECT) {
        const otherUser = conv.participants.find(
          (p) => p && p._id.toString() !== userIdStr
        );
        convObj.opponent = otherUser || null;
      }

      return convObj;
    });

    return res.status(200).json({
      success: true,
      data: { conversations: formatted }
    });
  } catch (error) {
    next(error);
  }
};

const createConversation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { recipientId } = req.body;

    if (!recipientId || !isValidObjectId(recipientId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid recipientId is required'
      });
    }

    if (recipientId === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot start conversation with yourself'
      });
    }

    // Verify recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient || recipient.accountStatus !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Check if direct conversation already exists
    let conversation = await Conversation.findOne({
      type: CONVERSATION_TYPES.DIRECT,
      participants: { $all: [userId, recipientId], $size: 2 }
    })
      .populate('participants', 'displayName username avatar isOnline lastSeen about')
      .populate('lastMessage');

    if (conversation) {
      // Remove from deletedFor if previously deleted
      if (conversation.deletedFor.some((id) => id.toString() === userId.toString())) {
        conversation.deletedFor = conversation.deletedFor.filter(
          (id) => id.toString() !== userId.toString()
        );
        await conversation.save();
      }

      const convObj = conversation.toJSON();
      convObj.isPinned = conversation.pinnedBy.some((id) => id.toString() === userId.toString());
      convObj.isArchived = conversation.archivedBy.some((id) => id.toString() === userId.toString());
      convObj.isMuted = conversation.mutedBy.some((id) => id.toString() === userId.toString());
      convObj.unreadCount = (conversation.unreadCounts && conversation.unreadCounts.get(userId.toString())) || 0;
      convObj.opponent = conversation.participants.find(
        (p) => p._id.toString() !== userId.toString()
      );

      return res.status(200).json({
        success: true,
        data: { conversation: convObj }
      });
    }

    // Create new direct conversation
    const newConv = await Conversation.create({
      type: CONVERSATION_TYPES.DIRECT,
      participants: [userId, recipientId],
      lastActivityAt: new Date()
    });

    const populated = await Conversation.findById(newConv._id)
      .populate('participants', 'displayName username avatar isOnline lastSeen about');

    const convObj = populated.toJSON();
    convObj.isPinned = false;
    convObj.isArchived = false;
    convObj.isMuted = false;
    convObj.unreadCount = 0;
    convObj.opponent = populated.participants.find(
      (p) => p._id.toString() !== userId.toString()
    );

    return res.status(201).json({
      success: true,
      data: { conversation: convObj }
    });
  } catch (error) {
    next(error);
  }
};

const getConversationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: userId
    })
      .populate('participants', 'displayName username avatar isOnline lastSeen about')
      .populate('lastMessage');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }

    const convObj = conversation.toJSON();
    const userIdStr = userId.toString();
    convObj.isPinned = conversation.pinnedBy.some((p) => p.toString() === userIdStr);
    convObj.isArchived = conversation.archivedBy.some((p) => p.toString() === userIdStr);
    convObj.isMuted = conversation.mutedBy.some((p) => p.toString() === userIdStr);
    convObj.unreadCount = (conversation.unreadCounts && conversation.unreadCounts.get(userIdStr)) || 0;

    if (conversation.type === CONVERSATION_TYPES.DIRECT) {
      convObj.opponent = conversation.participants.find(
        (p) => p._id.toString() !== userIdStr
      );
    }

    return res.status(200).json({
      success: true,
      data: { conversation: convObj }
    });
  } catch (error) {
    next(error);
  }
};

const updateConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { pinned, archived, muted } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }

    if (typeof pinned === 'boolean') {
      if (pinned) {
        conversation.pinnedBy.addToSet(userId);
      } else {
        conversation.pinnedBy.pull(userId);
      }
    }

    if (typeof archived === 'boolean') {
      if (archived) {
        conversation.archivedBy.addToSet(userId);
      } else {
        conversation.archivedBy.pull(userId);
      }
    }

    if (typeof muted === 'boolean') {
      if (muted) {
        conversation.mutedBy.addToSet(userId);
      } else {
        conversation.mutedBy.pull(userId);
      }
    }

    await conversation.save();

    return res.status(200).json({
      success: true,
      message: 'Conversation updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findOne({
      _id: id,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }

    // Mark as deleted for this user
    conversation.deletedFor.addToSet(userId);
    await conversation.save();

    return res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConversations,
  createConversation,
  getConversationById,
  updateConversation,
  deleteConversation
};
