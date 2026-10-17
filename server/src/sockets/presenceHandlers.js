const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { SOCKET_EVENTS } = require('../config/constants');

const handleUserConnected = async (io, socket) => {
  const userId = socket.userId;
  try {
    await User.findByIdAndUpdate(userId, {
      $set: { isOnline: true },
      $addToSet: { socketIds: socket.id }
    });

    // Notify contacts in all conversations
    const userConvs = await Conversation.find({ participants: userId }).select('participants');
    const contactSet = new Set();
    userConvs.forEach((c) => {
      c.participants.forEach((p) => {
        if (p.toString() !== userId) contactSet.add(p.toString());
      });
    });

    contactSet.forEach((contactId) => {
      io.to(`user:${contactId}`).emit(SOCKET_EVENTS.PRESENCE_UPDATED, {
        userId,
        isOnline: true,
        lastSeen: new Date()
      });
    });
  } catch (err) {
    console.error('[Presence] Error on user connect:', err.message);
  }
};

const handleUserDisconnected = async (io, socket) => {
  const userId = socket.userId;
  try {
    const user = await User.findById(userId);
    if (!user) return;

    user.socketIds = user.socketIds.filter((id) => id !== socket.id);

    // If no more active sockets for this user, mark as offline
    if (user.socketIds.length === 0) {
      user.isOnline = false;
      user.lastSeen = new Date();
      await user.save();

      const userConvs = await Conversation.find({ participants: userId }).select('participants');
      const contactSet = new Set();
      userConvs.forEach((c) => {
        c.participants.forEach((p) => {
          if (p.toString() !== userId) contactSet.add(p.toString());
        });
      });

      contactSet.forEach((contactId) => {
        io.to(`user:${contactId}`).emit(SOCKET_EVENTS.PRESENCE_UPDATED, {
          userId,
          isOnline: false,
          lastSeen: user.lastSeen
        });
      });
    } else {
      await user.save();
    }
  } catch (err) {
    console.error('[Presence] Error on user disconnect:', err.message);
  }
};

module.exports = {
  handleUserConnected,
  handleUserDisconnected
};
