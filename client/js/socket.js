/**
 * WhatsApp Clone - Real-time Socket.IO Client
 */
const SocketClient = {
  socket: null,
  listeners: {},

  init() {
    if (this.socket) return this.socket;
    if (typeof io !== 'function') {
      console.warn('[Socket] Socket.IO client library not loaded, using REST polling fallback.');
      return null;
    }

    try {
      // Connect to same host
      this.socket = io({
        withCredentials: true,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1500
      });
    } catch (err) {
      console.warn('[Socket] Failed to create socket connection, using REST fallback:', err.message);
      return null;
    }

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server, id:', this.socket.id);
      this.trigger('connection:change', { connected: true });
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected from server:', reason);
      this.trigger('connection:change', { connected: false, reason });
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[Socket] Connection attempt error:', error.message);
    });

    this.socket.on('reconnect_failed', () => {
      console.warn('[Socket] Reconnect attempts exhausted. Using HTTP Cloud Sync.');
      this.trigger('connection:change', { connected: false, failed: true });
    });

    // Chat Events
    this.socket.on('message:new', (message) => {
      this.trigger('message:new', message);
    });

    this.socket.on('message:status', (data) => {
      this.trigger('message:status', data);
    });

    this.socket.on('message:updated', (message) => {
      this.trigger('message:updated', message);
    });

    this.socket.on('message:deleted', (data) => {
      this.trigger('message:deleted', data);
    });

    this.socket.on('typing:update', (data) => {
      this.trigger('typing:update', data);
    });

    this.socket.on('presence:update', (data) => {
      this.trigger('presence:update', data);
    });

    this.socket.on('conversation:updated', (data) => {
      this.trigger('conversation:updated', data);
    });

    // WebRTC Calling Events
    this.socket.on('call:incoming', (data) => {
      this.trigger('call:incoming', data);
    });

    this.socket.on('call:accepted', (data) => {
      this.trigger('call:accepted', data);
    });

    this.socket.on('call:rejected', (data) => {
      this.trigger('call:rejected', data);
    });

    this.socket.on('call:ended', (data) => {
      this.trigger('call:ended', data);
    });

    this.socket.on('webrtc:signal', (data) => {
      this.trigger('webrtc:signal', data);
    });

    return this.socket;
  },

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  },

  trigger(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[Socket] Listener error on '${event}':`, err);
        }
      });
    }
  },

  joinConversation(conversationId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('conversation:join', { conversationId });
    }
  },

  leaveConversation(conversationId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('conversation:leave', { conversationId });
    }
  },

  sendMessage(messagePayload) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error('Socket disconnected'));
      }
      this.socket.emit('message:send', messagePayload, (res) => {
        if (res && res.success) {
          resolve(res.message);
        } else {
          reject(new Error(res?.message || 'Failed to send'));
        }
      });
    });
  },

  sendDeliveredReceipt(messageId, conversationId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('message:delivered', { messageId, conversationId });
    }
  },

  sendReadReceipt(conversationId, messageIds) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('message:read', { conversationId, messageIds });
    }
  },

  startTyping(conversationId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('typing:start', { conversationId });
    }
  },

  stopTyping(conversationId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('typing:stop', { conversationId });
    }
  },

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
};

window.SocketClient = SocketClient;
