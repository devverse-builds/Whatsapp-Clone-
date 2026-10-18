/**
 * WhatsApp Clone - Chats Sidebar & List Manager
 */
const Chats = {
  conversations: [],
  activeConversation: null,
  currentFilter: 'all', // 'all' | 'unread' | 'groups'
  searchQuery: '',

  init() {
    this.setupEventListeners();
    this.setupSocketListeners();
  },

  setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('sidebar-search-input');
    const searchClear = document.getElementById('sidebar-search-clear');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (searchClear) {
          searchClear.style.display = this.searchQuery ? 'flex' : 'none';
        }
        this.render();
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.style.display = 'none';
        this.render();
      });
    }

    // Filter chips
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentFilter = chip.dataset.filter || 'all';
        this.render();
      });
    });

    // Mobile back button from active conversation
    const backBtn = document.getElementById('chat-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (window.history.state && window.history.state.inChat) {
          window.history.back();
        } else {
          this.closeActiveChat();
        }
      });
    }

    // Hardware / browser back button on mobile
    window.addEventListener('popstate', (e) => {
      this.closeActiveChat();
    });
  },

  closeActiveChat() {
    const viewport = document.getElementById('chat-viewport');
    if (viewport) {
      viewport.classList.remove('mobile-active');
    }
    this.activeConversation = null;
    document.querySelectorAll('.conversation-item').forEach((i) => i.classList.remove('active'));
    const welcome = document.getElementById('welcome-screen');
    const panel = document.getElementById('active-chat-panel');
    if (welcome && window.innerWidth > 768) {
      welcome.style.display = 'flex';
    }
    if (panel) {
      panel.classList.remove('active');
    }
  },

  setupSocketListeners() {
    SocketClient.on('conversation:updated', (data) => {
      this.handleConversationUpdated(data);
    });

    SocketClient.on('presence:update', (data) => {
      this.handlePresenceUpdated(data);
    });

    SocketClient.on('typing:update', (data) => {
      this.handleTypingUpdated(data);
    });
  },

  async loadConversations() {
    try {
      const res = await API.conversations.getAll();
      if (res && res.success && res.data) {
        this.conversations = res.data.conversations || [];
        this.render();
      }
    } catch (err) {
      console.error('Failed to load conversations:', err.message);
    }
  },

  render() {
    const container = document.getElementById('conversations-list');
    if (!container) return;

    let filtered = [...this.conversations];

    // Filter by type or unread
    if (this.currentFilter === 'unread') {
      filtered = filtered.filter((c) => (c.unreadCount || 0) > 0);
    } else if (this.currentFilter === 'groups') {
      filtered = filtered.filter((c) => c.type === 'group');
    }

    // Filter by search query
    if (this.searchQuery) {
      filtered = filtered.filter((c) => {
        const name = this.getConversationName(c).toLowerCase();
        const lastMsg = c.lastMessage?.content?.toLowerCase() || '';
        return name.includes(this.searchQuery) || lastMsg.includes(this.searchQuery);
      });
    }

    // Sort: pinned first, then by lastActivityAt descending
    filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.lastActivityAt) - new Date(a.lastActivityAt);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
          <svg style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
          <p style="font-size: 15px; font-weight: 500;">${this.searchQuery ? 'No chats found' : 'No chats yet'}</p>
          <p style="font-size: 13px; margin-top: 4px;">Click the new chat button to start messaging</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    filtered.forEach((conv) => {
      const itemEl = this.createConversationElement(conv);
      container.appendChild(itemEl);
    });
  },

  getConversationName(conv) {
    if (conv.type === 'group') {
      return conv.groupMeta?.name || 'Group Chat';
    }
    return conv.opponent?.displayName || conv.opponent?.username || 'Contact';
  },

  getConversationAvatar(conv) {
    if (conv.type === 'group') {
      return conv.groupMeta?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.groupMeta?.name || 'G')}&background=00a884&color=fff`;
    }
    return conv.opponent?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.opponent?.displayName || 'U')}&background=00a884&color=fff`;
  },

  createConversationElement(conv) {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    item.dataset.id = conv._id;

    if (this.activeConversation && this.activeConversation._id === conv._id) {
      item.classList.add('active');
    }

    const name = this.getConversationName(conv);
    const avatar = this.getConversationAvatar(conv);
    const isOnline = conv.type === 'direct' && conv.opponent?.isOnline;
    const timeStr = conv.lastMessage ? Utils.formatTime(conv.lastMessage.createdAt) : '';

    let lastMsgPreview = 'No messages yet';
    let statusIconHtml = '';

    if (conv.lastMessage) {
      if (conv.lastMessage.deletedForEveryone) {
        lastMsgPreview = '<span style="font-style: italic;">This message was deleted</span>';
      } else if (conv.lastMessage.type === 'image') {
        lastMsgPreview = '📷 Photo';
      } else if (conv.lastMessage.type === 'video') {
        lastMsgPreview = '🎥 Video';
      } else if (conv.lastMessage.type === 'audio' || conv.lastMessage.type === 'voice') {
        lastMsgPreview = '🎤 Voice note';
      } else if (conv.lastMessage.type === 'document') {
        lastMsgPreview = '📄 Document';
      } else {
        lastMsgPreview = Utils.escapeHtml(conv.lastMessage.content || '');
      }

      // Check if current user was sender
      const isMyMsg = conv.lastMessage.senderId?._id === Auth.currentUser?._id || conv.lastMessage.senderId === Auth.currentUser?._id;
      if (isMyMsg && !conv.lastMessage.deletedForEveryone) {
        const status = conv.lastMessage.status || 'sent';
        if (status === 'read') {
          statusIconHtml = `<span style="color: var(--wa-green-check); font-size: 13px;">✓✓</span> `;
        } else if (status === 'delivered') {
          statusIconHtml = `<span style="color: var(--text-muted); font-size: 13px;">✓✓</span> `;
        } else {
          statusIconHtml = `<span style="color: var(--text-muted); font-size: 13px;">✓</span> `;
        }
      }
    }

    item.innerHTML = `
      <div class="conv-avatar-wrapper">
        <img class="conv-avatar" src="${avatar}" alt="${Utils.escapeHtml(name)}" onerror="this.src='https://ui-avatars.com/api/?name=Chat&background=00a884&color=fff'">
        ${isOnline ? '<div class="online-indicator"></div>' : ''}
      </div>
      <div class="conv-details">
        <div class="conv-row-top">
          <span class="conv-name">${Utils.escapeHtml(name)}</span>
          <span class="conv-time">${timeStr}</span>
        </div>
        <div class="conv-row-bottom">
          <span class="conv-last-msg">${statusIconHtml}${lastMsgPreview}</span>
          <div class="conv-badges">
            ${conv.isPinned ? `<svg class="pin-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>` : ''}
            ${conv.isMuted ? `<svg class="mute-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>` : ''}
            ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ''}
          </div>
        </div>
      </div>
    `;

    item.addEventListener('click', () => {
      this.selectConversation(conv);
    });

    return item;
  },

  async selectConversation(conv) {
    if (this.activeConversation) {
      SocketClient.leaveConversation(this.activeConversation._id);
    }

    this.activeConversation = conv;

    // Reset unread locally
    conv.unreadCount = 0;
    this.render();

    // Mark as active in UI
    document.querySelectorAll('.conversation-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.id === conv._id);
    });

    // Mobile slide in & history entry for mobile back button
    const viewport = document.getElementById('chat-viewport');
    if (viewport) {
      viewport.classList.add('mobile-active');
      if (window.innerWidth <= 768) {
        window.history.pushState({ inChat: true, convId: conv._id }, '');
      }
    }

    // Join socket room
    SocketClient.joinConversation(conv._id);

    // Load messages
    if (window.Messages) {
      await window.Messages.loadConversation(conv);
    }
  },

  handleConversationUpdated(data) {
    const { conversationId, lastMessage, lastActivityAt, conversation } = data;
    const existingIndex = this.conversations.findIndex((c) => c._id === conversationId);

    if (existingIndex !== -1) {
      if (lastMessage) {
        this.conversations[existingIndex].lastMessage = lastMessage;
      }
      if (lastActivityAt) {
        this.conversations[existingIndex].lastActivityAt = lastActivityAt;
      }
      if (conversation) {
        this.conversations[existingIndex] = conversation;
      }
      // If this conversation is currently open, mark read
      if (this.activeConversation && this.activeConversation._id === conversationId) {
        this.conversations[existingIndex].unreadCount = 0;
      } else if (lastMessage && lastMessage.senderId !== Auth.currentUser?._id && lastMessage.senderId?._id !== Auth.currentUser?._id) {
        this.conversations[existingIndex].unreadCount = (this.conversations[existingIndex].unreadCount || 0) + 1;
      }
    } else if (conversation) {
      this.conversations.unshift(conversation);
    } else {
      this.loadConversations();
      return;
    }

    this.render();
  },

  handlePresenceUpdated(data) {
    const { userId, isOnline, lastSeen } = data;
    this.conversations.forEach((conv) => {
      if (conv.type === 'direct' && conv.opponent && conv.opponent._id === userId) {
        conv.opponent.isOnline = isOnline;
        conv.opponent.lastSeen = lastSeen;
      }
    });

    if (this.activeConversation && this.activeConversation.opponent && this.activeConversation.opponent._id === userId) {
      this.activeConversation.opponent.isOnline = isOnline;
      this.activeConversation.opponent.lastSeen = lastSeen;
      if (window.Messages) {
        window.Messages.updateHeaderPresence(this.activeConversation);
      }
    }

    this.render();
  },

  handleTypingUpdated(data) {
    const { conversationId, userId, displayName, isTyping } = data;
    if (userId === Auth.currentUser?._id) return;

    const item = document.querySelector(`.conversation-item[data-id="${conversationId}"]`);
    if (!item) return;

    const snippetEl = item.querySelector('.conv-snippet');
    if (!snippetEl) return;

    if (!this._typingTimers) this._typingTimers = {};

    if (isTyping) {
      if (!snippetEl.dataset.originalHtml) {
        snippetEl.dataset.originalHtml = snippetEl.innerHTML;
      }
      snippetEl.innerHTML = `<span class="conv-typing-status"><span class="typing-dots-mini"></span> typing...</span>`;
      
      clearTimeout(this._typingTimers[conversationId]);
      this._typingTimers[conversationId] = setTimeout(() => {
        if (snippetEl && snippetEl.dataset.originalHtml) {
          snippetEl.innerHTML = snippetEl.dataset.originalHtml;
          delete snippetEl.dataset.originalHtml;
        }
      }, 3500);
    } else {
      clearTimeout(this._typingTimers[conversationId]);
      if (snippetEl && snippetEl.dataset.originalHtml) {
        snippetEl.innerHTML = snippetEl.dataset.originalHtml;
        delete snippetEl.dataset.originalHtml;
      }
    }
  }
};

window.Chats = Chats;
