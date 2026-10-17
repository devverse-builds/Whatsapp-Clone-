const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { MESSAGE_TYPES, MESSAGE_STATUS, SOCKET_EVENTS } = require('../config/constants');
const { isValidObjectId } = require('../validators/chatValidators');
const { getIO } = require('../services/socketService');

const getMessages = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const before = req.query.before; // Cursor (Date ISO string or messageId)

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    // Verify conversation access
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }

    const query = {
      conversationId,
      deletedFor: { $ne: userId }
    };

    if (before) {
      if (isValidObjectId(before)) {
        const cursorMsg = await Message.findById(before);
        if (cursorMsg) {
          query.createdAt = { $lt: cursorMsg.createdAt };
        }
      } else {
        const cursorDate = new Date(before);
        if (!isNaN(cursorDate.getTime())) {
          query.createdAt = { $lt: cursorDate };
        }
      }
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('senderId', 'displayName username avatar')
      .populate({
        path: 'replyTo',
        select: 'content senderId type attachment',
        populate: { path: 'senderId', select: 'displayName username' }
      });

    const hasMore = messages.length > limit;
    const paginated = hasMore ? messages.slice(0, limit) : messages;

    // Return in ascending chronological order for the client
    paginated.reverse();

    const nextCursor = hasMore && paginated.length > 0 ? paginated[0]._id : null;

    return res.status(200).json({
      success: true,
      data: {
        messages: paginated,
        hasMore,
        nextCursor
      }
    });
  } catch (error) {
    next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user._id;
    const { content, type, attachment, replyTo, clientMessageId } = req.body;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }

    // Check blocked status if direct conversation
    if (conversation.type === 'direct') {
      const otherParticipantId = conversation.participants.find(
        (p) => p.toString() !== userId.toString()
      );
      if (otherParticipantId) {
        const otherUser = await User.findById(otherParticipantId);
        if (otherUser && otherUser.blockedUsers.includes(userId)) {
          return res.status(403).json({
            success: false,
            message: 'You cannot send messages to this contact'
          });
        }
      }
    }

    // Idempotency check: see if clientMessageId already exists in this conversation
    if (clientMessageId) {
      const existing = await Message.findOne({
        conversationId,
        clientMessageId
      })
        .populate('senderId', 'displayName username avatar')
        .populate({
          path: 'replyTo',
          select: 'content senderId type attachment',
          populate: { path: 'senderId', select: 'displayName username' }
        });

      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Message already received (idempotent)',
          data: { message: existing }
        });
      }
    }

    const messageData = {
      conversationId,
      senderId: userId,
      clientMessageId: clientMessageId || `srv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type: type || MESSAGE_TYPES.TEXT,
      content: content || '',
      attachment: attachment || undefined,
      replyTo: (replyTo && isValidObjectId(replyTo)) ? replyTo : undefined,
      status: MESSAGE_STATUS.SENT
    };

    const message = await Message.create(messageData);

    const populated = await Message.findById(message._id)
      .populate('senderId', 'displayName username avatar')
      .populate({
        path: 'replyTo',
        select: 'content senderId type attachment',
        populate: { path: 'senderId', select: 'displayName username' }
      });

    // Update conversation lastMessage & lastActivityAt
    conversation.lastMessage = message._id;
    conversation.lastActivityAt = new Date();

    // Increment unread counts for participants other than sender
    conversation.participants.forEach((p) => {
      const pStr = p.toString();
      if (pStr !== userId.toString()) {
        const current = (conversation.unreadCounts && conversation.unreadCounts.get(pStr)) || 0;
        conversation.unreadCounts.set(pStr, current + 1);
      }
    });

    // Clear deletedFor so conversation reappears if previously deleted
    conversation.deletedFor = [];
    await conversation.save();

    // Emit Socket.IO event to conversation room
    const io = getIO();
    if (io) {
      io.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, populated);
      conversation.participants.forEach((p) => {
        io.to(`user:${p.toString()}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
          conversationId,
          lastMessage: populated,
          lastActivityAt: conversation.lastActivityAt
        });
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message: populated }
    });
  } catch (error) {
    next(error);
  }
};

const editMessage = async (req, res, next) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;
    const { content } = req.body;

    if (!isValidObjectId(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content cannot be empty'
      });
    }

    const message = await Message.findOne({
      _id: messageId,
      senderId: userId,
      deletedForEveryone: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found, already deleted, or unauthorized'
      });
    }

    // Only allow editing text messages within 15 minutes of creation
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (message.createdAt < fifteenMinutesAgo) {
      return res.status(400).json({
        success: false,
        message: 'Messages can only be edited within 15 minutes of sending'
      });
    }

    message.content = content.trim();
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('senderId', 'displayName username avatar')
      .populate({
        path: 'replyTo',
        select: 'content senderId type attachment',
        populate: { path: 'senderId', select: 'displayName username' }
      });

    const io = getIO();
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit(
        SOCKET_EVENTS.MESSAGE_UPDATED,
        populated
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Message updated',
      data: { message: populated }
    });
  } catch (error) {
    next(error);
  }
};

const deleteMessage = async (req, res, next) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;
    const { forEveryone } = req.body;

    if (!isValidObjectId(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Verify user is in the conversation
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (forEveryone) {
      // Must be sender to delete for everyone
      if (message.senderId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Only the sender can delete a message for everyone'
        });
      }

      message.deletedForEveryone = true;
      message.content = 'This message was deleted';
      message.attachment = undefined;
      await message.save();

      const io = getIO();
      if (io) {
        io.to(`conversation:${message.conversationId}`).emit(
          SOCKET_EVENTS.MESSAGE_DELETED,
          {
            messageId: message._id,
            conversationId: message.conversationId,
            deletedForEveryone: true
          }
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Message deleted for everyone'
      });
    } else {
      // Delete for me
      message.deletedFor.addToSet(userId);
      await message.save();

      return res.status(200).json({
        success: true,
        message: 'Message deleted for you'
      });
    }
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation ID'
      });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Reset unread count for this user
    if (conversation.unreadCounts) {
      conversation.unreadCounts.set(userId.toString(), 0);
      await conversation.save();
    }

    // Update unread messages where sender is not userId
    const unreadMessages = await Message.find({
      conversationId,
      senderId: { $ne: userId },
      'readReceipts.user': { $ne: userId }
    });

    const messageIds = unreadMessages.map((m) => m._id);

    if (messageIds.length > 0) {
      await Message.updateMany(
        { _id: { $in: messageIds } },
        {
          $addToSet: { readReceipts: { user: userId, readAt: new Date() } },
          $set: { status: MESSAGE_STATUS.READ }
        }
      );

      const io = getIO();
      if (io) {
        io.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE_STATUS, {
          conversationId,
          messageIds,
          status: MESSAGE_STATUS.READ,
          readBy: userId
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      data: { count: messageIds.length }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead
};
