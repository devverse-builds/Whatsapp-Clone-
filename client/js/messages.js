/**
 * WhatsApp Clone - Messages & Conversation View Manager
 */
const Messages = {
  currentConversation: null,
  messages: [],
  hasMore: false,
  nextCursor: null,
  isLoadingOlder: false,
  activeReplyTo: null,
  typingTimeout: null,
  editingMessageId: null,

  init() {
    this.setupEventListeners();
    this.setupSocketListeners();
  },

  setupEventListeners() {
    const textarea = document.getElementById('composer-textarea');
    const sendBtn = document.getElementById('btn-composer-send');
    const cancelReplyBtn = document.getElementById('reply-preview-cancel');
    const messagesContainer = document.getElementById('chat-messages-container');

    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });

      textarea.addEventListener('input', () => {
        this.autoResizeTextarea(textarea);
        this.handleTyping();
      });

      // On mobile devices, scroll to bottom when keyboard appears
      textarea.addEventListener('focus', () => {
        setTimeout(() => {
          this.scrollToBottom();
        }, 320);
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        this.handleSendMessage();
      });
    }

    if (cancelReplyBtn) {
      cancelReplyBtn.addEventListener('click', () => {
        this.clearReplyPreview();
      });
    }

    if (messagesContainer) {
      messagesContainer.addEventListener('scroll', () => {
        if (messagesContainer.scrollTop <= 40 && this.hasMore && !this.isLoadingOlder) {
          this.loadOlderMessages();
        }
      });
    }

    // Close any open message dropdown when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.message-action-trigger') && !e.target.closest('.dropdown-menu')) {
        this.closeAllDropdowns();
      }
    });
  },

  setupSocketListeners() {
    SocketClient.on('message:new', (message) => {
      this.handleNewIncomingMessage(message);
    });

    SocketClient.on('message:status', (data) => {
      this.handleMessageStatus(data);
    });

    SocketClient.on('message:updated', (message) => {
      this.handleMessageUpdated(message);
    });

    SocketClient.on('message:deleted', (data) => {
      this.handleMessageDeleted(data);
    });

    SocketClient.on('typing:update', (data) => {
      this.handleTypingUpdate(data);
    });
  },

  async loadConversation(conv) {
    this.currentConversation = conv;
    this.messages = [];
    this.hasMore = false;
    this.nextCursor = null;
    this.clearReplyPreview();

    // Show panel, hide welcome
    const welcome = document.getElementById('welcome-screen');
    const panel = document.getElementById('active-chat-panel');
    if (welcome) welcome.style.display = 'none';
    if (panel) panel.classList.add('active');

    // Update Header Info
    this.renderHeader(conv);

    // Fetch initial messages
    const container = document.getElementById('chat-messages-container');
    if (container) {
      container.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; height:100%; color:var(--text-muted);">
          <div style="font-size:14px;">Loading messages...</div>
        </div>
      `;
    }

    try {
      const res = await API.messages.get(conv._id);
      if (res && res.success && res.data) {
        this.messages = res.data.messages || [];
        this.hasMore = res.data.hasMore;
        this.nextCursor = res.data.nextCursor;
        this.renderMessages();
        this.scrollToBottom();

        // Mark as read
        API.messages.markAsRead(conv._id);
        SocketClient.sendReadReceipt(conv._id);
      }
    } catch (err) {
      console.error('Failed to load messages:', err.message);
      if (container) {
        container.innerHTML = `
          <div style="display:flex; justify-content:center; align-items:center; height:100%; color:#ea4335;">
            Failed to load messages. Please try again.
          </div>
        `;
      }
    }
  },

  renderHeader(conv) {
    const avatarEl = document.getElementById('chat-header-avatar');
    const nameEl = document.getElementById('chat-header-name');
    const statusEl = document.getElementById('chat-header-status');

    const name = Chats.getConversationName(conv);
    const avatar = Chats.getConversationAvatar(conv);

    if (avatarEl) {
      avatarEl.src = avatar;
      avatarEl.alt = name;
    }
    if (nameEl) {
      nameEl.textContent = name;
    }
    this.updateHeaderPresence(conv);
  },

  updateHeaderPresence(conv) {
    const statusEl = document.getElementById('chat-header-status');
    if (!statusEl) return;

    if (conv.type === 'group') {
      const count = conv.participants ? conv.participants.length : 0;
      statusEl.textContent = `${count} members`;
      statusEl.className = 'chat-header-status';
    } else {
      const isOnline = conv.opponent?.isOnline;
      const lastSeenText = Utils.formatLastSeen(conv.opponent?.lastSeen, isOnline);
      statusEl.textContent = lastSeenText;
      statusEl.className = `chat-header-status ${isOnline ? 'online' : ''}`;
    }
  },

  renderMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; height:100%; color:var(--text-muted);">
          <div style="background:var(--bg-modal); padding:8px 16px; border-radius:8px; box-shadow:var(--shadow-sm); font-size:13px;">
            🔒 Messages are end-to-end authorized and securely stored. Start conversation!
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    let lastDateStr = null;

    this.messages.forEach((msg) => {
      const msgDateStr = Utils.formatDateSeparator(msg.createdAt);
      if (msgDateStr !== lastDateStr) {
        const sepEl = document.createElement('div');
        sepEl.className = 'date-separator';
        sepEl.innerHTML = `<span class="date-pill">${msgDateStr}</span>`;
        container.appendChild(sepEl);
        lastDateStr = msgDateStr;
      }

      const msgEl = this.createMessageElement(msg);
      container.appendChild(msgEl);
    });
  },

  createMessageElement(msg) {
    if (msg.type === 'system') {
      const sysRow = document.createElement('div');
      sysRow.className = 'system-message-row';
      sysRow.innerHTML = `<span class="system-pill">${Utils.escapeHtml(msg.content)}</span>`;
      return sysRow;
    }

    const currentUserId = Auth.currentUser?._id;
    const senderId = msg.senderId?._id || msg.senderId;
    const isOutgoing = senderId === currentUserId;

    const row = document.createElement('div');
    row.className = `message-row ${isOutgoing ? 'outgoing' : 'incoming'}`;
    row.dataset.id = msg._id;
    row.dataset.clientId = msg.clientMessageId;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Group sender name if incoming
    let senderNameHtml = '';
    if (!isOutgoing && this.currentConversation?.type === 'group' && msg.senderId?.displayName) {
      senderNameHtml = `<div class="message-sender-name">${Utils.escapeHtml(msg.senderId.displayName)}</div>`;
    }

    // Quoted reply preview
    let quotedHtml = '';
    if (msg.replyTo && typeof msg.replyTo === 'object') {
      const replyAuthor = msg.replyTo.senderId?.displayName || 'User';
      const replySnippet = msg.replyTo.content || (msg.replyTo.type === 'image' ? 'Photo' : 'Media');
      quotedHtml = `
        <div class="quoted-reply-box" onclick="Messages.scrollToMessage('${msg.replyTo._id}')">
          <div class="quoted-reply-author">${Utils.escapeHtml(replyAuthor)}</div>
          <div class="quoted-reply-text">${Utils.escapeHtml(replySnippet)}</div>
        </div>
      `;
    }

    // Media Content
    let mediaHtml = '';
    if (msg.attachment && msg.attachment.url && !msg.deletedForEveryone) {
      if (msg.type === 'image') {
        mediaHtml = `
          <div class="message-media-image" onclick="Media.showLightbox('${msg.attachment.url}', '${Utils.escapeHtml(msg.attachment.fileName || '')}')">
            <img src="${msg.attachment.url}" alt="${Utils.escapeHtml(msg.attachment.fileName || 'Image')}" loading="lazy">
          </div>
        `;
      } else if (msg.type === 'video') {
        mediaHtml = `
          <div class="message-media-video">
            <video src="${msg.attachment.url}" controls></video>
          </div>
        `;
      } else if (msg.type === 'audio' || msg.type === 'voice') {
        mediaHtml = `
          <div class="voice-msg-player">
            <audio src="${msg.attachment.url}" preload="metadata"></audio>
            <button class="voice-play-btn" onclick="Media.toggleAudioPlay(this)">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <div class="voice-progress-container">
              <div class="voice-bar-bg" onclick="Media.seekAudio(event, this)">
                <div class="voice-bar-fill"></div>
              </div>
              <span class="voice-duration">${Utils.formatDuration(msg.attachment.duration || 0)}</span>
            </div>
          </div>
        `;
      } else if (msg.type === 'document') {
        mediaHtml = `
          <div class="message-media-doc">
            <svg width="28" height="28" fill="var(--wa-teal)" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
            <div class="doc-info">
              <div class="doc-name">${Utils.escapeHtml(msg.attachment.fileName || 'Document')}</div>
              <div class="doc-size">${Utils.formatFileSize(msg.attachment.fileSize || 0)}</div>
            </div>
            <a href="${msg.attachment.url}" download="${Utils.escapeHtml(msg.attachment.fileName || 'file')}" class="doc-download-btn" title="Download">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
            </a>
          </div>
        `;
      }
    }

    // Text Content
    let textHtml = '';
    if (msg.deletedForEveryone) {
      textHtml = `<span style="font-style: italic; color: var(--text-muted);"><svg width="14" height="14" style="vertical-align: -2px; margin-right: 4px;" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>This message was deleted</span>`;
    } else if (msg.content) {
      textHtml = `<span class="message-content-text">${Utils.escapeHtml(msg.content)}</span>`;
    }

    // Status Tick (sent, delivered, read)
    let tickHtml = '';
    if (isOutgoing && !msg.deletedForEveryone) {
      const st = msg.status || 'sent';
      if (st === 'read') {
        tickHtml = `<span class="status-tick-read" title="Read">✓✓</span>`;
      } else if (st === 'delivered') {
        tickHtml = `<span class="status-tick-delivered" title="Delivered">✓✓</span>`;
      } else if (st === 'sending') {
        tickHtml = `<span class="status-tick-sending" title="Sending">🕒</span>`;
      } else {
        tickHtml = `<span class="status-tick-sent" title="Sent">✓</span>`;
      }
    }

    // Edited label
    const editedHtml = msg.editedAt ? `<span class="message-edited-tag">edited</span> ` : '';

    // Action Trigger Button
    const triggerBtn = `<button class="message-action-trigger" onclick="Messages.toggleMessageMenu(event, '${msg._id}', ${isOutgoing}, ${!!msg.deletedForEveryone})">
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
    </button>`;

    bubble.innerHTML = `
      ${triggerBtn}
      ${senderNameHtml}
      ${quotedHtml}
      ${mediaHtml}
      ${textHtml}
      <div class="message-footer">
        ${editedHtml}
        <span class="message-time">${Utils.formatTime(msg.createdAt)}</span>
        <span class="message-status-tick">${tickHtml}</span>
      </div>
    `;

    row.appendChild(bubble);
    return row;
  },

  async handleSendMessage() {
    const textarea = document.getElementById('composer-textarea');
    if (!textarea) return;

    const content = textarea.value.trim();
    if (!content) return;

    // Check if we are editing an existing message
    if (this.editingMessageId) {
      const editId = this.editingMessageId;
      this.editingMessageId = null;
      textarea.value = '';
      this.autoResizeTextarea(textarea);

      try {
        await API.messages.edit(editId, content);
      } catch (err) {
        Utils.showToast(err.message || 'Failed to edit message', 'error');
      }
      return;
    }

    const conversationId = this.currentConversation?._id;
    if (!conversationId) return;

    textarea.value = '';
    this.autoResizeTextarea(textarea);
    this.stopTyping();

    const clientMessageId = Utils.generateClientId();
    const replyTo = this.activeReplyTo ? this.activeReplyTo._id : undefined;
    this.clearReplyPreview();

    // Optimistic message object
    const optimisticMsg = {
      _id: clientMessageId,
      conversationId,
      senderId: Auth.currentUser,
      clientMessageId,
      type: 'text',
      content,
      replyTo: this.activeReplyTo || undefined,
      status: 'sending',
      createdAt: new Date().toISOString()
    };

    this.messages.push(optimisticMsg);
    this.renderMessages();
    this.scrollToBottom();

    // Send via socket with fallback to REST API
    try {
      const sent = await SocketClient.sendMessage({
        conversationId,
        content,
        type: 'text',
        replyTo,
        clientMessageId
      });

      // Replace optimistic message
      const idx = this.messages.findIndex((m) => m.clientMessageId === clientMessageId);
      if (idx !== -1 && sent) {
        this.messages[idx] = sent;
        this.renderMessages();
      }
    } catch (err) {
      // Fallback to REST API
      try {
        const res = await API.messages.send(conversationId, {
          content,
          type: 'text',
          replyTo,
          clientMessageId
        });
        if (res && res.success && res.data) {
          const idx = this.messages.findIndex((m) => m.clientMessageId === clientMessageId);
          if (idx !== -1) {
            this.messages[idx] = res.data.message;
            this.renderMessages();
          }
        }
      } catch (apiErr) {
        Utils.showToast('Failed to deliver message. Tap to retry.', 'error');
      }
    }
  },

  handleNewIncomingMessage(message) {
    if (this.currentConversation && message.conversationId === this.currentConversation._id) {
      // Avoid duplicate rendering
      const exists = this.messages.some(
        (m) => m._id === message._id || (message.clientMessageId && m.clientMessageId === message.clientMessageId)
      );

      if (!exists) {
        this.messages.push(message);
        this.renderMessages();
        this.scrollToBottom();

        // Send delivery and read receipts
        SocketClient.sendDeliveredReceipt(message._id, message.conversationId);
        SocketClient.sendReadReceipt(message.conversationId, [message._id]);
      }
    } else {
      // Incoming message for another chat
      SocketClient.sendDeliveredReceipt(message._id, message.conversationId);
      if (window.Notifications) {
        window.Notifications.onIncomingMessage(message);
      }
    }
  },

  handleMessageStatus(data) {
    const { conversationId, messageId, messageIds, status } = data;
    if (this.currentConversation && this.currentConversation._id === conversationId) {
      const targetIds = messageIds || [messageId];
      let updated = false;

      this.messages.forEach((msg) => {
        if (targetIds.includes(msg._id)) {
          msg.status = status;
          updated = true;
        }
      });

      if (updated) {
        this.renderMessages();
      }
    }
  },

  handleMessageUpdated(updatedMsg) {
    const idx = this.messages.findIndex((m) => m._id === updatedMsg._id);
    if (idx !== -1) {
      this.messages[idx] = updatedMsg;
      this.renderMessages();
    }
  },

  handleMessageDeleted(data) {
    const { messageId } = data;
    const msg = this.messages.find((m) => m._id === messageId);
    if (msg) {
      msg.deletedForEveryone = true;
      msg.content = 'This message was deleted';
      msg.attachment = undefined;
      this.renderMessages();
    }
  },

  handleTyping() {
    if (!this.currentConversation) return;

    SocketClient.startTyping(this.currentConversation._id);

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 2500);
  },

  stopTyping() {
    if (this.currentConversation) {
      SocketClient.stopTyping(this.currentConversation._id);
    }
  },

  handleTypingUpdate(data) {
    const { conversationId, userId, displayName, isTyping } = data;
    if (this.currentConversation && this.currentConversation._id === conversationId) {
      if (userId !== Auth.currentUser?._id) {
        const statusEl = document.getElementById('chat-header-status');
        if (statusEl) {
          if (isTyping) {
            statusEl.textContent = this.currentConversation.type === 'group'
              ? `${displayName} is typing...`
              : 'typing...';
            statusEl.className = 'chat-header-status online';
          } else {
            this.updateHeaderPresence(this.currentConversation);
          }
        }
      }
    }
  },

  setReplyTo(message) {
    this.activeReplyTo = message;
    const bar = document.getElementById('reply-preview-bar');
    const senderEl = document.getElementById('reply-preview-sender');
    const textEl = document.getElementById('reply-preview-text');
    const textarea = document.getElementById('composer-textarea');

    if (bar && senderEl && textEl) {
      senderEl.textContent = message.senderId?.displayName || 'User';
      textEl.textContent = message.content || (message.type === 'image' ? 'Photo' : 'Media');
      bar.classList.add('active');
      if (textarea) textarea.focus();
    }
  },

  clearReplyPreview() {
    this.activeReplyTo = null;
    const bar = document.getElementById('reply-preview-bar');
    if (bar) bar.classList.remove('active');
  },

  toggleMessageMenu(event, messageId, isOutgoing, isDeleted) {
    event.stopPropagation();
    this.closeAllDropdowns();

    const menu = document.getElementById('message-dropdown-menu');
    if (!menu) return;

    const message = this.messages.find((m) => m._id === messageId);
    if (!message) return;

    menu.innerHTML = `
      <div class="dropdown-item" onclick="Messages.setReplyTo(Messages.messages.find(m => m._id === '${messageId}')); Messages.closeAllDropdowns();">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
        Reply
      </div>
      ${isOutgoing && !isDeleted && message.type === 'text' ? `
        <div class="dropdown-item" onclick="Messages.startEditingMessage('${messageId}'); Messages.closeAllDropdowns();">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          Edit
        </div>
      ` : ''}
      <div class="dropdown-item danger" onclick="Messages.deleteMessage('${messageId}', false); Messages.closeAllDropdowns();">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        Delete for me
      </div>
      ${isOutgoing && !isDeleted ? `
        <div class="dropdown-item danger" onclick="Messages.deleteMessage('${messageId}', true); Messages.closeAllDropdowns();">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          Delete for everyone
        </div>
      ` : ''}
    `;

    // Position menu near click
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;
    menu.classList.add('active');
  },

  closeAllDropdowns() {
    const menu = document.getElementById('message-dropdown-menu');
    if (menu) menu.classList.remove('active');
  },

  startEditingMessage(messageId) {
    const msg = this.messages.find((m) => m._id === messageId);
    if (!msg) return;

    this.editingMessageId = messageId;
    const textarea = document.getElementById('composer-textarea');
    if (textarea) {
      textarea.value = msg.content;
      textarea.focus();
      this.autoResizeTextarea(textarea);
      Utils.showToast('Editing message. Press Enter to save.', 'info');
    }
  },

  async deleteMessage(messageId, forEveryone) {
    try {
      await API.messages.delete(messageId, forEveryone);
      if (!forEveryone) {
        this.messages = this.messages.filter((m) => m._id !== messageId);
        this.renderMessages();
      }
    } catch (err) {
      Utils.showToast(err.message || 'Failed to delete message', 'error');
    }
  },

  async loadOlderMessages() {
    if (!this.currentConversation || !this.nextCursor || this.isLoadingOlder) return;

    this.isLoadingOlder = true;
    const container = document.getElementById('chat-messages-container');
    const scrollHeightBefore = container ? container.scrollHeight : 0;

    try {
      const res = await API.messages.get(this.currentConversation._id, this.nextCursor);
      if (res && res.success && res.data) {
        const older = res.data.messages || [];
        this.hasMore = res.data.hasMore;
        this.nextCursor = res.data.nextCursor;

        if (older.length > 0) {
          this.messages = [...older, ...this.messages];
          this.renderMessages();

          // Restore scroll position
          if (container) {
            container.scrollTop = container.scrollHeight - scrollHeightBefore;
          }
        }
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
    } finally {
      this.isLoadingOlder = false;
    }
  },

  scrollToBottom() {
    const container = document.getElementById('chat-messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  },

  scrollToMessage(messageId) {
    const el = document.querySelector(`.message-row[data-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.backgroundColor = 'rgba(0, 168, 132, 0.2)';
      setTimeout(() => {
        el.style.backgroundColor = '';
      }, 1200);
    }
  },

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  },

  async syncNewMessages() {
    if (!this.currentConversation) return;
    try {
      const res = await API.messages.get(this.currentConversation._id, null, 25);
      if (res && res.success && res.data && res.data.messages) {
        const serverMessages = res.data.messages;
        let hasNew = false;
        serverMessages.forEach((sMsg) => {
          const exists = this.messages.some(
            (m) => m._id === sMsg._id || (sMsg.clientMessageId && m.clientMessageId === sMsg.clientMessageId)
          );
          if (!exists) {
            this.messages.push(sMsg);
            hasNew = true;
          } else {
            const idx = this.messages.findIndex((m) => m._id === sMsg._id);
            if (idx !== -1 && (
              this.messages[idx].status !== sMsg.status ||
              this.messages[idx].content !== sMsg.content ||
              this.messages[idx].deletedForEveryone !== sMsg.deletedForEveryone
            )) {
              this.messages[idx] = sMsg;
              hasNew = true;
            }
          }
        });
        if (hasNew) {
          const container = document.getElementById('chat-messages-container');
          const isAtBottom = container ? (container.scrollHeight - container.scrollTop - container.clientHeight < 150) : false;
          this.renderMessages();
          if (isAtBottom) {
            this.scrollToBottom();
          }
        }
      }
    } catch (err) {
      // Silent catch for background polling sync
    }
  }
};

window.Messages = Messages;
