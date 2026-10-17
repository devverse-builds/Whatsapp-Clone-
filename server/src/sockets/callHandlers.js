const Call = require('../models/Call');
const User = require('../models/User');
const { SOCKET_EVENTS } = require('../config/constants');
const { isValidObjectId } = require('../validators/chatValidators');

const registerCallHandlers = (io, socket) => {
  const userId = socket.userId;

  // Initiate call
  socket.on(SOCKET_EVENTS.CALL_INVITE, async (data, callback) => {
    try {
      const { receiverId, callType } = data || {};

      if (!receiverId || !isValidObjectId(receiverId)) {
        if (typeof callback === 'function') callback({ success: false, message: 'Invalid receiver ID' });
        return;
      }

      // Check if receiver is online
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        if (typeof callback === 'function') callback({ success: false, message: 'User not found' });
        return;
      }

      if (receiver.blockedUsers.includes(userId)) {
        if (typeof callback === 'function') callback({ success: false, message: 'User is unavailable' });
        return;
      }

      const callRecord = await Call.create({
        callerId: userId,
        receiverId,
        type: callType === 'video' ? 'video' : 'audio',
        status: 'calling',
        startedAt: new Date()
      });

      const callerUser = await User.findById(userId).select('displayName username avatar');

      // Emit incoming call to receiver
      io.to(`user:${receiverId}`).emit(SOCKET_EVENTS.CALL_INCOMING, {
        callId: callRecord._id,
        caller: callerUser,
        callType: callRecord.type
      });

      if (typeof callback === 'function') {
        callback({ success: true, callId: callRecord._id });
      }
    } catch (err) {
      console.error('[Call] invite error:', err.message);
      if (typeof callback === 'function') callback({ success: false, message: 'Failed to initiate call' });
    }
  });

  // Accept call
  socket.on(SOCKET_EVENTS.CALL_ACCEPT, async (data) => {
    try {
      const { callId, callerId } = data || {};
      if (callId && isValidObjectId(callId)) {
        await Call.findByIdAndUpdate(callId, { status: 'accepted' });
      }

      if (callerId) {
        io.to(`user:${callerId}`).emit(SOCKET_EVENTS.CALL_ACCEPTED, {
          callId,
          acceptedBy: userId
        });
      }
    } catch (err) {
      console.error('[Call] accept error:', err.message);
    }
  });

  // Reject call
  socket.on(SOCKET_EVENTS.CALL_REJECT, async (data) => {
    try {
      const { callId, callerId } = data || {};
      if (callId && isValidObjectId(callId)) {
        await Call.findByIdAndUpdate(callId, { status: 'rejected', endedAt: new Date() });
      }

      if (callerId) {
        io.to(`user:${callerId}`).emit(SOCKET_EVENTS.CALL_REJECTED, {
          callId,
          rejectedBy: userId
        });
      }
    } catch (err) {
      console.error('[Call] reject error:', err.message);
    }
  });

  // End call
  socket.on(SOCKET_EVENTS.CALL_END, async (data) => {
    try {
      const { callId, targetUserId } = data || {};
      if (callId && isValidObjectId(callId)) {
        const call = await Call.findById(callId);
        if (call) {
          call.status = 'ended';
          call.endedAt = new Date();
          if (call.startedAt) {
            call.duration = Math.round((call.endedAt - call.startedAt) / 1000);
          }
          await call.save();
        }
      }

      if (targetUserId) {
        io.to(`user:${targetUserId}`).emit(SOCKET_EVENTS.CALL_ENDED, {
          callId,
          endedBy: userId
        });
      }
    } catch (err) {
      console.error('[Call] end error:', err.message);
    }
  });

  // WebRTC Signaling: SDP offer/answer and ICE candidate relay
  socket.on(SOCKET_EVENTS.WEBRTC_SIGNAL, (data) => {
    const { targetUserId, signal } = data || {};
    if (targetUserId && signal) {
      io.to(`user:${targetUserId}`).emit(SOCKET_EVENTS.WEBRTC_SIGNAL_RECEIVED, {
        senderId: userId,
        signal
      });
    }
  });
};

module.exports = {
  registerCallHandlers
};
