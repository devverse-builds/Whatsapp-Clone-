/**
 * WhatsApp Clone - Status (Stories) Manager
 */
const StatusManager = {
  myStatuses: [],
  contactStatuses: [],
  activeStatusIndex: 0,
  activeStoryList: [],
  storyTimer: null,
  isPaused: false,

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const railStatusBtn = document.getElementById('rail-status-btn');
    const statusModal = document.getElementById('modal-status');
    const closeStatusBtn = document.getElementById('btn-close-status');

    if (railStatusBtn && statusModal) {
      railStatusBtn.addEventListener('click', () => {
        statusModal.classList.add('active');
        this.loadStatuses();
      });
    }

    if (closeStatusBtn && statusModal) {
      closeStatusBtn.addEventListener('click', () => {
        statusModal.classList.remove('active');
      });
    }

    // Add status buttons
    const addTextBtn = document.getElementById('btn-add-text-status');
    const addImgInput = document.getElementById('input-status-image');
    const textStatusModal = document.getElementById('modal-create-text-status');
    const closeTextStatusBtn = document.getElementById('btn-close-text-status');
    const submitTextStatusBtn = document.getElementById('btn-submit-text-status');

    if (addTextBtn && textStatusModal) {
      addTextBtn.addEventListener('click', () => {
        textStatusModal.classList.add('active');
      });
    }

    if (closeTextStatusBtn && textStatusModal) {
      closeTextStatusBtn.addEventListener('click', () => {
        textStatusModal.classList.remove('active');
      });
    }

    if (submitTextStatusBtn) {
      submitTextStatusBtn.addEventListener('click', () => {
        this.handleCreateTextStatus();
      });
    }

    if (addImgInput) {
      addImgInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          await this.handleCreateImageStatus(file);
          addImgInput.value = '';
        }
      });
    }

    // Story viewer close
    const storyViewer = document.getElementById('modal-story-viewer');
    const closeStoryBtn = document.getElementById('btn-close-story-viewer');

    if (closeStoryBtn && storyViewer) {
      closeStoryBtn.addEventListener('click', () => {
        this.closeStoryViewer();
      });
    }
  },

  async loadStatuses() {
    const myContainer = document.getElementById('my-status-container');
    const contactsContainer = document.getElementById('contact-statuses-list');

    try {
      const res = await API.statuses.getAll();
      if (res && res.success && res.data) {
        this.myStatuses = res.data.myStatuses || [];
        this.contactStatuses = res.data.contactStatuses || [];
        this.renderStatusList();
      }
    } catch (err) {
      console.error('Failed to load statuses:', err.message);
    }
  },

  renderStatusList() {
    const myContainer = document.getElementById('my-status-container');
    const contactsContainer = document.getElementById('contact-statuses-list');

    // My Status
    if (myContainer) {
      const myAvatar = Auth.currentUser?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(Auth.currentUser?.displayName || 'Me')}&background=00a884&color=fff`;

      if (this.myStatuses.length > 0) {
        const latest = this.myStatuses[0];
        myContainer.innerHTML = `
          <div class="user-select-item" style="padding: 8px 0;" onclick="StatusManager.viewStories(StatusManager.myStatuses, 0, true)">
            <div style="position:relative; width:48px; height:48px; border-radius:50%; border:2px solid var(--wa-teal); padding:2px;">
              <img src="${myAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
            </div>
            <div class="user-select-info">
              <div class="user-select-name">My Status</div>
              <div class="user-select-about">${Utils.formatTime(latest.createdAt)} • ${this.myStatuses.length} update(s)</div>
            </div>
          </div>
        `;
      } else {
        myContainer.innerHTML = `
          <div class="user-select-item" style="padding: 8px 0;">
            <img class="user-select-avatar" src="${myAvatar}">
            <div class="user-select-info">
              <div class="user-select-name">My Status</div>
              <div class="user-select-about">No updates yet</div>
            </div>
          </div>
        `;
      }
    }

    // Contact Statuses
    if (contactsContainer) {
      if (this.contactStatuses.length === 0) {
        contactsContainer.innerHTML = '<div style="padding:20px 0; color:var(--text-muted); font-size:13px;">No recent status updates from your contacts.</div>';
        return;
      }

      contactsContainer.innerHTML = '';
      this.contactStatuses.forEach((group) => {
        const user = group.user;
        const statuses = group.statuses;
        const avatarUrl = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=00a884&color=fff`;
        const latest = statuses[0];

        const item = document.createElement('div');
        item.className = 'user-select-item';
        item.style.padding = '8px 0';

        item.innerHTML = `
          <div style="position:relative; width:48px; height:48px; border-radius:50%; border:2px solid var(--wa-teal); padding:2px;">
            <img src="${avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
          </div>
          <div class="user-select-info">
            <div class="user-select-name">${Utils.escapeHtml(user.displayName)}</div>
            <div class="user-select-about">${Utils.formatTime(latest.createdAt)}</div>
          </div>
        `;

        item.addEventListener('click', () => {
          this.viewStories(statuses, 0, false);
        });

        contactsContainer.appendChild(item);
      });
    }
  },

  async handleCreateTextStatus() {
    const textInput = document.getElementById('text-status-input');
    const colorSelect = document.getElementById('text-status-color');

    const content = textInput.value.trim();
    const backgroundColor = colorSelect ? colorSelect.value : '#075E54';

    if (!content) {
      Utils.showToast('Please type your status message', 'error');
      return;
    }

    try {
      await API.statuses.create({
        type: 'text',
        content,
        backgroundColor
      });

      Utils.showToast('Status posted!', 'success');
      textInput.value = '';
      const modal = document.getElementById('modal-create-text-status');
      if (modal) modal.classList.remove('active');

      await this.loadStatuses();
    } catch (err) {
      Utils.showToast(err.message || 'Failed to post status', 'error');
    }
  },

  async handleCreateImageStatus(file) {
    try {
      Utils.showToast('Uploading status image...', 'info');
      const uploadRes = await API.media.upload(file);
      if (uploadRes && uploadRes.success) {
        await API.statuses.create({
          type: 'image',
          mediaUrl: uploadRes.data.url,
          content: ''
        });
        Utils.showToast('Status photo posted!', 'success');
        await this.loadStatuses();
      }
    } catch (err) {
      Utils.showToast(err.message || 'Failed to upload status', 'error');
    }
  },

  viewStories(storyList, startIndex = 0, isMine = false) {
    if (!storyList || storyList.length === 0) return;

    this.activeStoryList = storyList;
    this.activeStatusIndex = startIndex;

    const viewer = document.getElementById('modal-story-viewer');
    if (viewer) viewer.classList.add('active');

    this.showCurrentStory(isMine);
  },

  showCurrentStory(isMine) {
    clearTimeout(this.storyTimer);
    const story = this.activeStoryList[this.activeStatusIndex];
    if (!story) {
      this.closeStoryViewer();
      return;
    }

    // Record view if not mine
    if (!isMine) {
      API.statuses.view(story._id);
    }

    const stage = document.getElementById('story-viewer-stage');
    const headerInfo = document.getElementById('story-viewer-author');
    const progressContainer = document.getElementById('story-viewer-progress-bars');
    const viewersInfo = document.getElementById('story-viewer-viewers');

    if (headerInfo) {
      const author = story.userId?.displayName || 'Status';
      headerInfo.innerHTML = `
        <span style="font-weight:600; font-size:15px; color:#fff;">${Utils.escapeHtml(author)}</span>
        <span style="font-size:12px; color:rgba(255,255,255,0.7); margin-left:8px;">${Utils.formatTime(story.createdAt)}</span>
      `;
    }

    // Render Progress Bars
    if (progressContainer) {
      progressContainer.innerHTML = '';
      this.activeStoryList.forEach((_, idx) => {
        const barWrapper = document.createElement('div');
        barWrapper.style.cssText = 'flex:1; height:3px; background:rgba(255,255,255,0.3); border-radius:2px; overflow:hidden; position:relative;';

        const fill = document.createElement('div');
        fill.className = 'story-fill';
        fill.style.cssText = `height:100%; background:#fff; width:${idx < this.activeStatusIndex ? '100%' : (idx === this.activeStatusIndex ? '0%' : '0%')};`;

        if (idx === this.activeStatusIndex) {
          fill.style.transition = 'width 5s linear';
          setTimeout(() => { fill.style.width = '100%'; }, 50);
        }

        barWrapper.appendChild(fill);
        progressContainer.appendChild(barWrapper);
      });
    }

    // Render Stage Content
    if (stage) {
      if (story.type === 'image' && story.mediaUrl) {
        stage.style.backgroundColor = '#000';
        stage.innerHTML = `
          <img src="${story.mediaUrl}" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px;">
          ${story.content ? `<div style="position:absolute; bottom:40px; color:#fff; font-size:16px; background:rgba(0,0,0,0.6); padding:8px 20px; border-radius:20px;">${Utils.escapeHtml(story.content)}</div>` : ''}
        `;
      } else {
        stage.style.backgroundColor = story.backgroundColor || '#075E54';
        stage.innerHTML = `
          <div style="font-size:26px; font-weight:600; color:#fff; max-width:80%; text-align:center; line-height:1.5;">
            ${Utils.escapeHtml(story.content)}
          </div>
        `;
      }
    }

    // Viewers list for my status
    if (viewersInfo) {
      if (isMine && story.viewers) {
        viewersInfo.style.display = 'block';
        viewersInfo.innerHTML = `👁 Viewed by ${story.viewers.length} people`;
      } else {
        viewersInfo.style.display = 'none';
      }
    }

    // Auto advance after 5 seconds
    this.storyTimer = setTimeout(() => {
      this.nextStory(isMine);
    }, 5000);
  },

  nextStory(isMine) {
    if (this.activeStatusIndex < this.activeStoryList.length - 1) {
      this.activeStatusIndex++;
      this.showCurrentStory(isMine);
    } else {
      this.closeStoryViewer();
    }
  },

  prevStory(isMine) {
    if (this.activeStatusIndex > 0) {
      this.activeStatusIndex--;
      this.showCurrentStory(isMine);
    }
  },

  closeStoryViewer() {
    clearTimeout(this.storyTimer);
    const viewer = document.getElementById('modal-story-viewer');
    if (viewer) viewer.classList.remove('active');
  }
};

window.StatusManager = StatusManager;
