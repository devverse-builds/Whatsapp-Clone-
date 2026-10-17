/**
 * WhatsApp Clone - Settings & Profile Manager
 */
const Settings = {
  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const railSettingsBtn = document.getElementById('rail-settings-btn');
    const railProfileBtn = document.getElementById('rail-profile-btn');
    const settingsModal = document.getElementById('modal-settings');
    const closeSettingsBtn = document.getElementById('btn-close-settings');

    if (railSettingsBtn && settingsModal) {
      railSettingsBtn.addEventListener('click', () => {
        this.openSettings('general');
      });
    }

    if (railProfileBtn && settingsModal) {
      railProfileBtn.addEventListener('click', () => {
        this.openSettings('profile');
      });
    }

    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
      });
    }

    // Profile form
    const profileForm = document.getElementById('form-edit-profile');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSaveProfile();
      });
    }

    // Privacy form
    const privacyForm = document.getElementById('form-edit-privacy');
    if (privacyForm) {
      privacyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSavePrivacy();
      });
    }

    // Wallpaper picker
    const wallpaperSelect = document.getElementById('setting-wallpaper-select');
    if (wallpaperSelect) {
      wallpaperSelect.addEventListener('change', (e) => {
        this.applyWallpaper(e.target.value);
      });
    }

    // Theme selector
    const themeSelect = document.getElementById('setting-theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        this.applyTheme(e.target.value);
      });
    }

    // Change password form
    const passForm = document.getElementById('form-change-password');
    if (passForm) {
      passForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleChangePassword();
      });
    }

    // Delete account button
    const deleteAccBtn = document.getElementById('btn-delete-account');
    if (deleteAccBtn) {
      deleteAccBtn.addEventListener('click', async () => {
        await this.handleDeleteAccount();
      });
    }
  },

  openSettings(tab = 'profile') {
    const modal = document.getElementById('modal-settings');
    if (!modal) return;

    modal.classList.add('active');
    this.populateCurrentValues();
    this.loadBlockedUsers();
  },

  populateCurrentValues() {
    const user = Auth.currentUser;
    if (!user) return;

    const nameInput = document.getElementById('setting-display-name');
    const aboutInput = document.getElementById('setting-about');
    const avatarInput = document.getElementById('setting-avatar');
    const themeSelect = document.getElementById('setting-theme-select');
    const wallpaperSelect = document.getElementById('setting-wallpaper-select');

    if (nameInput) nameInput.value = user.displayName || '';
    if (aboutInput) aboutInput.value = user.about || '';
    if (avatarInput) avatarInput.value = user.avatar || '';
    if (themeSelect) themeSelect.value = user.theme || 'dark';
    if (wallpaperSelect) wallpaperSelect.value = user.chatWallpaper || 'default';

    // Privacy
    const p = user.privacy || {};
    const lastSeenSelect = document.getElementById('privacy-last-seen');
    const profilePhotoSelect = document.getElementById('privacy-profile-photo');
    const readReceiptsCheck = document.getElementById('privacy-read-receipts');

    if (lastSeenSelect) lastSeenSelect.value = p.lastSeen || 'everyone';
    if (profilePhotoSelect) profilePhotoSelect.value = p.profilePhoto || 'everyone';
    if (readReceiptsCheck) readReceiptsCheck.checked = p.readReceipts !== false;
  },

  async handleSaveProfile() {
    const displayName = document.getElementById('setting-display-name').value.trim();
    const about = document.getElementById('setting-about').value.trim();
    const avatar = document.getElementById('setting-avatar').value.trim();

    if (!displayName) {
      Utils.showToast('Display name cannot be empty', 'error');
      return;
    }

    try {
      const res = await API.users.updateProfile({ displayName, about, avatar });
      if (res && res.success) {
        Auth.currentUser = res.data.user;
        Auth.onAuthSuccess(res.data.user);
        Utils.showToast('Profile updated!', 'success');
      }
    } catch (err) {
      Utils.showToast(err.message || 'Failed to update profile', 'error');
    }
  },

  async handleSavePrivacy() {
    const lastSeen = document.getElementById('privacy-last-seen').value;
    const profilePhoto = document.getElementById('privacy-profile-photo').value;
    const readReceipts = document.getElementById('privacy-read-receipts').checked;

    try {
      const res = await API.users.updateProfile({
        privacy: { lastSeen, profilePhoto, readReceipts }
      });
      if (res && res.success) {
        Auth.currentUser = res.data.user;
        Utils.showToast('Privacy settings saved', 'success');
      }
    } catch (err) {
      Utils.showToast(err.message || 'Failed to save privacy settings', 'error');
    }
  },

  async applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    try {
      await API.users.updateProfile({ theme });
      if (Auth.currentUser) Auth.currentUser.theme = theme;
    } catch (e) {
      // Local fallback
    }
  },

  async applyWallpaper(wallpaper) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    container.className = 'chat-messages-container wallpaper-' + wallpaper;
    try {
      await API.users.updateProfile({ chatWallpaper: wallpaper });
      if (Auth.currentUser) Auth.currentUser.chatWallpaper = wallpaper;
    } catch (e) {
      // Local fallback
    }
  },

  async loadBlockedUsers() {
    const container = document.getElementById('settings-blocked-list');
    if (!container) return;

    try {
      const res = await API.users.getBlocked();
      if (res && res.success) {
        const blocked = res.data.blockedUsers || [];
        if (blocked.length === 0) {
          container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">No blocked users</div>';
          return;
        }

        container.innerHTML = '';
        blocked.forEach((user) => {
          const item = document.createElement('div');
          item.className = 'user-select-item';
          item.style.padding = '8px 0';

          item.innerHTML = `
            <img class="user-select-avatar" src="${user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}`}">
            <div class="user-select-info">
              <div class="user-select-name">${Utils.escapeHtml(user.displayName)}</div>
              <div class="user-select-about">@${Utils.escapeHtml(user.username)}</div>
            </div>
            <button class="filter-chip" style="color:#ea4335;" onclick="Settings.unblockUser('${user._id}')">Unblock</button>
          `;

          container.appendChild(item);
        });
      }
    } catch (err) {
      container.innerHTML = '<div style="color:#ea4335; font-size:13px;">Failed to load blocked users</div>';
    }
  },

  async unblockUser(userId) {
    try {
      await API.users.unblock(userId);
      Utils.showToast('User unblocked', 'success');
      await this.loadBlockedUsers();
    } catch (err) {
      Utils.showToast(err.message || 'Failed to unblock user', 'error');
    }
  },

  async handleChangePassword() {
    const currentPassword = document.getElementById('input-current-password').value;
    const newPassword = document.getElementById('input-new-password').value;

    if (!currentPassword || !newPassword) {
      Utils.showToast('Please fill in both password fields', 'error');
      return;
    }

    try {
      await API.auth.changePassword({ currentPassword, newPassword });
      Utils.showToast('Password changed successfully!', 'success');
      document.getElementById('input-current-password').value = '';
      document.getElementById('input-new-password').value = '';
    } catch (err) {
      Utils.showToast(err.message || 'Failed to change password', 'error');
    }
  },

  async handleDeleteAccount() {
    if (!confirm('Are you absolutely sure you want to permanently delete your account? This action cannot be undone.')) {
      return;
    }

    try {
      await API.auth.deleteAccount();
      Auth.currentUser = null;
      SocketClient.disconnect();
      document.getElementById('modal-settings').classList.remove('active');
      Auth.showAuthUI();
      Utils.showToast('Account deleted', 'info');
    } catch (err) {
      Utils.showToast(err.message || 'Failed to delete account', 'error');
    }
  }
};

window.Settings = Settings;
