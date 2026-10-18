const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { SOCKET_EVENTS, MESSAGE_STATUS, MESSAGE_TYPES } = require('../config/constants');
const { isValidObjectId } = require('../validators/chatValidators');

const registerChatHandlers = (io, socket) => {
  const userId = socket.userId;

  // Join a conversation room
  socket.on('conversation:join', async (data) => {
    try {
      const { conversationId } = data || {};
      if (!conversationId || !isValidObjectId(conversationId)) return;

      const conv = await Conversation.findOne({
        _id: conversationId,
        participants: userId
      });

      if (conv) {
        socket.join(`conversation:${conversationId}`);
      }
    } catch (err) {
      console.error('[Socket] conversation:join error:', err.message);
    }
  });

  // Leave a conversation room
  socket.on('conversation:leave', (data) => {
    const { conversationId } = data || {};
    if (conversationId) {
      socket.leave(`conversation:${conversationId}`);
    }
  });

  // Send message over socket
  socket.on(SOCKET_EVENTS.MESSAGE_SEND, async (data, callback) => {
    try {
      const { conversationId, content, type, attachment, replyTo, clientMessageId } = data || {};

      if (!conversationId || !isValidObjectId(conversationId)) {
        if (typeof callback === 'function') callback({ success: false, message: 'Invalid conversation ID' });
        return;
      }

      const conv = await Conversation.findOne({
        _id: conversationId,
        participants: userId
      });

      if (!conv) {
        if (typeof callback === 'function') callback({ success: false, message: 'Conversation not found or unauthorized' });
        return;
      }

      // Check blocked user
      if (conv.type === 'direct') {
        const otherId = conv.participants.find((p) => p.toString() !== userId);
        if (otherId) {
          const otherUser = await User.findById(otherId);
          if (otherUser && otherUser.blockedUsers.includes(userId)) {
            if (typeof callback === 'function') callback({ success: false, message: 'You are blocked by this user' });
            return;
          }
        }
      }

      // Idempotency
      if (clientMessageId) {
        const existing = await Message.findOne({ conversationId, clientMessageId })
          .populate('senderId', 'displayName username avatar')
          .populate('replyTo');
        if (existing) {
          if (typeof callback === 'function') callback({ success: true, message: existing });
          return;
        }
      }

      const msg = await Message.create({
        conversationId,
        senderId: userId,
        clientMessageId: clientMessageId || `soc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: type || MESSAGE_TYPES.TEXT,
        content: content || '',
        attachment: attachment || undefined,
        replyTo: (replyTo && isValidObjectId(replyTo)) ? replyTo : undefined,
        status: MESSAGE_STATUS.SENT
      });

      const populated = await Message.findById(msg._id)
        .populate('senderId', 'displayName username avatar')
        .populate({
          path: 'replyTo',
          select: 'content senderId type attachment',
          populate: { path: 'senderId', select: 'displayName username' }
        });

      // Update conversation
      conv.lastMessage = msg._id;
      conv.lastActivityAt = new Date();
      conv.deletedFor = [];
      conv.participants.forEach((p) => {
        const pStr = p.toString();
        if (pStr !== userId) {
          const count = (conv.unreadCounts && conv.unreadCounts.get(pStr)) || 0;
          conv.unreadCounts.set(pStr, count + 1);
        }
      });
      await conv.save();

      // Broadcast message to room and conversations update to users
      io.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, populated);
      conv.participants.forEach((p) => {
        io.to(`user:${p.toString()}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
          conversationId,
          lastMessage: populated,
          lastActivityAt: conv.lastActivityAt
        });
      });

      if (typeof callback === 'function') {
        callback({ success: true, message: populated });
      }
    } catch (err) {
      console.error('[Socket] message:send error:', err.message);
      if (typeof callback === 'function') callback({ success: false, message: 'Failed to send message' });
    }
  });

  // Message delivered receipt
  socket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, async (data) => {
    try {
      const { messageId, conversationId } = data || {};
      if (!messageId || !isValidObjectId(messageId)) return;

      const msg = await Message.findById(messageId);
      if (!msg) return;

      const alreadyDelivered = msg.deliveryReceipts.some(
        (dr) => dr.user.toString() === userId
      );

      if (!alreadyDelivered && msg.senderId.toString() !== userId) {
        msg.deliveryReceipts.push({ user: userId, deliveredAt: new Date() });
        if (msg.status === MESSAGE_STATUS.SENT) {
          msg.status = MESSAGE_STATUS.DELIVERED;
        }
        await msg.save();

        io.to(`user:${msg.senderId.toString()}`).emit(SOCKET_EVENTS.MESSAGE_STATUS, {
          conversationId: msg.conversationId,
          messageId: msg._id,
          status: msg.status
        });
      }
    } catch (err) {
      console.error('[Socket] message:delivered error:', err.message);
    }
  });

  // Message read receipt
  socket.on(SOCKET_EVENTS.MESSAGE_READ, async (data) => {
    try {
      const { conversationId, messageIds } = data || {};
      if (!conversationId || !isValidObjectId(conversationId)) return;

      const conv = await Conversation.findOne({
        _id: conversationId,
        participants: userId
      });
      if (!conv) return;

      // Reset user's unread count
      if (conv.unreadCounts) {
        conv.unreadCounts.set(userId, 0);
        await conv.save();
      }

      let idsToUpdate = [];
      if (Array.isArray(messageIds) && messageIds.length > 0) {
        idsToUpdate = messageIds.filter(isValidObjectId);
      } else {
        const unread = await Message.find({
          conversationId,
          senderId: { $ne: userId },
          'readReceipts.user': { $ne: userId }
        }).select('_id');
        idsToUpdate = unread.map((m) => m._id);
      }

      if (idsToUpdate.length > 0) {
        await Message.updateMany(
          { _id: { $in: idsToUpdate } },
          {
            $addToSet: { readReceipts: { user: userId, readAt: new Date() } },
            $set: { status: MESSAGE_STATUS.READ }
          }
        );

        io.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE_STATUS, {
          conversationId,
          messageIds: idsToUpdate,
          status: MESSAGE_STATUS.READ,
          readBy: userId
        });
      }
    } catch (err) {
      console.error('[Socket] message:read error:', err.message);
    }
  });

  // Typing indicators with participant broadcasting & validation
  socket.on(SOCKET_EVENTS.TYPING_START, async (data) => {
    try {
      const { conversationId } = data || {};
      if (!conversationId || !isValidObjectId(conversationId)) return;

      const conv = await Conversation.findOne({
        _id: conversationId,
        participants: userId
      });
      if (!conv) return;

      const payload = {
        conversationId,
        userId,
        displayName: socket.user.displayName,
        isTyping: true
      };

      // Emit to active room
      socket.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.TYPING_UPDATE, payload);

      // Also emit to all participants' user channels for sidebar updates
      conv.participants.forEach((p) => {
        const pId = p.toString();
        if (pId !== userId) {
          io.to(`user:${pId}`).emit(SOCKET_EVENTS.TYPING_UPDATE, payload);
        }
      });
    } catch (err) {
      console.error('[Socket] typing:start error:', err.message);
    }
  });

  socket.on(SOCKET_EVENTS.TYPING_STOP, async (data) => {
    try {
      const { conversationId } = data || {};
      if (!conversationId || !isValidObjectId(conversationId)) return;

      const conv = await Conversation.findOne({
        _id: conversationId,
        participants: userId
      });
      if (!conv) return;

      const payload = {
        conversationId,
        userId,
        displayName: socket.user.displayName,
        isTyping: false
      };

      socket.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.TYPING_UPDATE, payload);

      conv.participants.forEach((p) => {
        const pId = p.toString();
        if (pId !== userId) {
          io.to(`user:${pId}`).emit(SOCKET_EVENTS.TYPING_UPDATE, payload);
        }
      });
    } catch (err) {
      console.error('[Socket] typing:stop error:', err.message);
    }
  });
};

module.exports = {
  registerChatHandlers
};
