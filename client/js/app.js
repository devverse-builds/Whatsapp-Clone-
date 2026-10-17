/**
 * WhatsApp Clone - Main Application Orchestrator
 */
const App = {
  async init() {
    console.log('[App] Initializing WhatsApp Clone...');

    // Initialize modules
    Notifications.init();
    Settings.init();
    Chats.init();
    Messages.init();
    Contacts.init();
    Groups.init();
    Media.init();
    WebRTC.init();
    StatusManager.init();

    this.setupRailNavigation();
    this.setupEmojiPicker();

    // Authenticate user
    await Auth.init();
  },

  setupRailNavigation() {
    // Left navigation rail theme toggle
    const themeBtn = document.getElementById('rail-theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        Settings.applyTheme(next);
      });
    }

    // Chats rail button selects chats view
    const chatsBtn = document.getElementById('rail-chats-btn');
    if (chatsBtn) {
      chatsBtn.addEventListener('click', () => {
        document.querySelectorAll('.rail-btn').forEach((b) => b.classList.remove('active'));
        chatsBtn.classList.add('active');
      });
    }

    // Socket connection status indicator
    SocketClient.on('connection:change', (data) => {
      const banner = document.getElementById('connection-status-banner');
      if (banner) {
        if (!data.connected) {
          if (data.failed) {
            banner.style.background = '#00a884';
            banner.textContent = 'Cloud Sync Active';
            setTimeout(() => { banner.style.display = 'none'; }, 2000);
          } else {
            banner.style.background = '#ea4335';
            banner.style.display = 'flex';
            banner.textContent = 'Connecting to WhatsApp...';
            clearTimeout(this._bannerTimer);
            this._bannerTimer = setTimeout(() => {
              if (banner.style.display === 'flex') {
                banner.style.background = '#00a884';
                banner.textContent = 'Cloud Sync Active';
                setTimeout(() => { banner.style.display = 'none'; }, 1800);
              }
            }, 5000);
          }
        } else {
          clearTimeout(this._bannerTimer);
          banner.style.display = 'none';
        }
      }
    });
  },

  setupEmojiPicker() {
    const emojiBtn = document.getElementById('btn-composer-emoji');
    const textarea = document.getElementById('composer-textarea');
    const emojis = ['😀', '😂', '😍', '👍', '🙏', '❤️', '🔥', '🎉', '👏', '😎', '🤔', '✨', '🚀', '💯'];

    if (emojiBtn && textarea) {
      let emojiPicker = document.getElementById('quick-emoji-picker');
      if (!emojiPicker) {
        emojiPicker = document.createElement('div');
        emojiPicker.id = 'quick-emoji-picker';
        emojiPicker.style.cssText = `
          position: absolute;
          bottom: 64px;
          left: 16px;
          background: var(--bg-dropdown);
          box-shadow: var(--shadow-md);
          border-radius: 12px;
          padding: 8px 12px;
          display: none;
          gap: 8px;
          font-size: 20px;
          z-index: 100;
          cursor: pointer;
          user-select: none;
        `;

        emojis.forEach((emoji) => {
          const span = document.createElement('span');
          span.textContent = emoji;
          span.style.padding = '4px';
          span.style.borderRadius = '6px';
          span.addEventListener('mouseenter', () => (span.style.background = 'var(--bg-hover)'));
          span.addEventListener('mouseleave', () => (span.style.background = 'none'));
          span.addEventListener('click', () => {
            textarea.value += emoji;
            textarea.focus();
            Messages.autoResizeTextarea(textarea);
            emojiPicker.style.display = 'none';
          });
          emojiPicker.appendChild(span);
        });

        document.getElementById('active-chat-panel')?.appendChild(emojiPicker);
      }

      emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.style.display = emojiPicker.style.display === 'flex' ? 'none' : 'flex';
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#quick-emoji-picker') && !e.target.closest('#btn-composer-emoji')) {
          emojiPicker.style.display = 'none';
        }
      });
    }
  },

  async onLogin(user) {
    console.log('[App] Logged in as:', user.displayName, `(@${user.username})`);
    await Chats.loadConversations();
    this.startBackgroundSync();
  },

  startBackgroundSync() {
    if (this._syncInterval) return;
    this._syncInterval = setInterval(async () => {
      if (Auth.currentUser) {
        await Chats.loadConversations();
        if (Chats.activeConversation && window.Messages) {
          await Messages.syncNewMessages();
        }
      }
    }, 3500);
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
