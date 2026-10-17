module.exports = {
  ROLES: {
    ADMIN: 'admin',
    MEMBER: 'member'
  },
  CONVERSATION_TYPES: {
    DIRECT: 'direct',
    GROUP: 'group'
  },
  MESSAGE_TYPES: {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    VOICE: 'voice',
    DOCUMENT: 'document',
    SYSTEM: 'system'
  },
  MESSAGE_STATUS: {
    SENDING: 'sending',
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read'
  },
  PRIVACY_OPTIONS: {
    EVERYONE: 'everyone',
    CONTACTS: 'contacts',
    NOBODY: 'nobody'
  },
  SOCKET_EVENTS: {
    // Client to Server
    MESSAGE_SEND: 'message:send',
    MESSAGE_DELIVERED: 'message:delivered',
    MESSAGE_READ: 'message:read',
    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',
    PRESENCE_UPDATE: 'presence:update',
    CALL_INVITE: 'call:invite',
    CALL_ACCEPT: 'call:accept',
    CALL_REJECT: 'call:reject',
    CALL_END: 'call:end',
    WEBRTC_SIGNAL: 'webrtc:signal',

    // Server to Client
    MESSAGE_NEW: 'message:new',
    MESSAGE_ACK: 'message:ack',
    MESSAGE_STATUS: 'message:status',
    MESSAGE_UPDATED: 'message:updated',
    MESSAGE_DELETED: 'message:deleted',
    TYPING_UPDATE: 'typing:update',
    PRESENCE_UPDATED: 'presence:update',
    CONVERSATION_UPDATED: 'conversation:updated',
    NOTIFICATION_NEW: 'notification:new',
    CALL_INCOMING: 'call:incoming',
    CALL_ACCEPTED: 'call:accepted',
    CALL_REJECTED: 'call:rejected',
    CALL_ENDED: 'call:ended',
    WEBRTC_SIGNAL_RECEIVED: 'webrtc:signal'
  }
};
