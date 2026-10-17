/**
 * WhatsApp Clone - Contacts & User Search Manager
 */
const Contacts = {
  searchResults: [],

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    // New chat button in sidebar header
    const newChatBtn = document.getElementById('btn-new-chat');
    const newChatModal = document.getElementById('modal-new-chat');
    const closeNewChatBtn = document.getElementById('btn-close-new-chat');
    const searchInput = document.getElementById('new-chat-search-input');

    if (newChatBtn && newChatModal) {
      newChatBtn.addEventListener('click', () => {
        newChatModal.classList.add('active');
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        this.searchUsers('');
      });
    }

    if (closeNewChatBtn && newChatModal) {
      closeNewChatBtn.addEventListener('click', () => {
        newChatModal.classList.remove('active');
      });
    }

    if (searchInput) {
      searchInput.addEventListener(
        'input',
        Utils.debounce((e) => {
          this.searchUsers(e.target.value.trim());
        }, 300)
      );
    }
  },

  async searchUsers(query) {
    const listContainer = document.getElementById('new-chat-user-list');
    if (!listContainer) return;

    listContainer.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
        Searching contacts...
      </div>
    `;

    try {
      const res = await API.users.search(query);
      if (res && res.success) {
        this.searchResults = res.data.users || [];
        this.renderSearchResults();
      }
    } catch (err) {
      listContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #ea4335; font-size: 13px;">
          Failed to search users.
        </div>
      `;
    }
  },

  renderSearchResults() {
    const listContainer = document.getElementById('new-chat-user-list');
    if (!listContainer) return;

    if (this.searchResults.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 30px 20px; text-align: center; color: var(--text-muted); font-size: 14px;">
          No contacts found. Try a different username or name.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    this.searchResults.forEach((user) => {
      const item = document.createElement('div');
      item.className = 'user-select-item';
      const avatarUrl = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=00a884&color=fff`;

      item.innerHTML = `
        <img class="user-select-avatar" src="${avatarUrl}" alt="${Utils.escapeHtml(user.displayName)}">
        <div class="user-select-info">
          <div class="user-select-name">${Utils.escapeHtml(user.displayName)} <span style="font-size: 12px; color: var(--text-muted);">@${Utils.escapeHtml(user.username)}</span></div>
          <div class="user-select-about">${Utils.escapeHtml(user.about || '')}</div>
        </div>
      `;

      item.addEventListener('click', async () => {
        await this.startConversationWithUser(user);
      });

      listContainer.appendChild(item);
    });
  },

  async startConversationWithUser(user) {
    try {
      const res = await API.conversations.create(user._id);
      if (res && res.success && res.data) {
        const modal = document.getElementById('modal-new-chat');
        if (modal) modal.classList.remove('active');

        // Refresh conversation list & select
        await Chats.loadConversations();
        const conv = res.data.conversation;
        await Chats.selectConversation(conv);
      }
    } catch (err) {
      Utils.showToast(err.message || 'Could not start chat', 'error');
    }
  },

  async blockContact(userId) {
    try {
      await API.users.block(userId);
      Utils.showToast('Contact blocked', 'info');
      await Chats.loadConversations();
    } catch (err) {
      Utils.showToast(err.message || 'Failed to block contact', 'error');
    }
  },

  async unblockContact(userId) {
    try {
      await API.users.unblock(userId);
      Utils.showToast('Contact unblocked', 'success');
      await Chats.loadConversations();
    } catch (err) {
      Utils.showToast(err.message || 'Failed to unblock contact', 'error');
    }
  }
};

window.Contacts = Contacts;
