/**
 * WhatsApp Clone - Groups Manager
 */
const Groups = {
  selectedMembers: new Set(),
  availableUsers: [],

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const newGroupBtn = document.getElementById('btn-new-group');
    const newGroupModal = document.getElementById('modal-new-group');
    const closeNewGroupBtn = document.getElementById('btn-close-new-group');
    const groupForm = document.getElementById('form-create-group');
    const groupInfoBtn = document.getElementById('btn-group-info');
    const groupInfoModal = document.getElementById('modal-group-info');
    const closeGroupInfoBtn = document.getElementById('btn-close-group-info');

    if (newGroupBtn && newGroupModal) {
      newGroupBtn.addEventListener('click', () => {
        newGroupModal.classList.add('active');
        this.selectedMembers.clear();
        this.loadUsersForGroup();
      });
    }

    if (closeNewGroupBtn && newGroupModal) {
      closeNewGroupBtn.addEventListener('click', () => {
        newGroupModal.classList.remove('active');
      });
    }

    if (groupForm) {
      groupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleCreateGroup();
      });
    }

    if (groupInfoBtn && groupInfoModal) {
      groupInfoBtn.addEventListener('click', () => {
        if (Chats.activeConversation && Chats.activeConversation.type === 'group') {
          this.openGroupInfo(Chats.activeConversation);
        }
      });
    }

    if (closeGroupInfoBtn && groupInfoModal) {
      closeGroupInfoBtn.addEventListener('click', () => {
        groupInfoModal.classList.remove('active');
      });
    }
  },

  async loadUsersForGroup() {
    const listContainer = document.getElementById('group-member-selection-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted);">Loading contacts...</div>';

    try {
      const res = await API.users.search('');
      if (res && res.success) {
        this.availableUsers = res.data.users || [];
        this.renderUserSelection();
      }
    } catch (err) {
      listContainer.innerHTML = '<div style="padding:16px; text-align:center; color:#ea4335;">Failed to load contacts</div>';
    }
  },

  renderUserSelection() {
    const listContainer = document.getElementById('group-member-selection-list');
    if (!listContainer) return;

    if (this.availableUsers.length === 0) {
      listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">No contacts available to add.</div>';
      return;
    }

    listContainer.innerHTML = '';
    this.availableUsers.forEach((user) => {
      const item = document.createElement('div');
      item.className = `user-select-item ${this.selectedMembers.has(user._id) ? 'selected' : ''}`;
      const avatarUrl = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=00a884&color=fff`;

      item.innerHTML = `
        <img class="user-select-avatar" src="${avatarUrl}" alt="${Utils.escapeHtml(user.displayName)}">
        <div class="user-select-info">
          <div class="user-select-name">${Utils.escapeHtml(user.displayName)}</div>
          <div class="user-select-about">@${Utils.escapeHtml(user.username)}</div>
        </div>
        <input type="checkbox" ${this.selectedMembers.has(user._id) ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--wa-teal); pointer-events:none;">
      `;

      item.addEventListener('click', () => {
        if (this.selectedMembers.has(user._id)) {
          this.selectedMembers.delete(user._id);
        } else {
          this.selectedMembers.add(user._id);
        }
        this.renderUserSelection();
      });

      listContainer.appendChild(item);
    });
  },

  async handleCreateGroup() {
    const nameInput = document.getElementById('group-name-input');
    const descInput = document.getElementById('group-desc-input');
    const submitBtn = document.getElementById('btn-submit-create-group');

    const name = nameInput.value.trim();
    const description = descInput ? descInput.value.trim() : '';

    if (!name) {
      Utils.showToast('Please enter a group name', 'error');
      return;
    }

    if (this.selectedMembers.size === 0) {
      Utils.showToast('Please select at least one group member', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
      const members = Array.from(this.selectedMembers);
      const res = await API.groups.create({
        name,
        description,
        members
      });

      if (res && res.success) {
        Utils.showToast('Group created successfully!', 'success');
        const modal = document.getElementById('modal-new-group');
        if (modal) modal.classList.remove('active');
        nameInput.value = '';
        if (descInput) descInput.value = '';

        await Chats.loadConversations();
        await Chats.selectConversation(res.data.group);
      }
    } catch (err) {
      Utils.showToast(err.message || 'Failed to create group', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Group';
    }
  },

  openGroupInfo(group) {
    const modal = document.getElementById('modal-group-info');
    if (!modal) return;

    modal.classList.add('active');

    const titleEl = document.getElementById('group-info-name');
    const descEl = document.getElementById('group-info-desc');
    const countEl = document.getElementById('group-info-count');
    const membersList = document.getElementById('group-info-members-list');
    const leaveBtn = document.getElementById('btn-leave-group');

    if (titleEl) titleEl.textContent = group.groupMeta?.name || 'Group';
    if (descEl) descEl.textContent = group.groupMeta?.description || 'No description provided';
    if (countEl) countEl.textContent = `${group.participants?.length || 0} participants`;

    const myUserId = Auth.currentUser?._id;
    const isCurrentUserAdmin = group.participantRoles?.some(
      (pr) => (pr.user?._id === myUserId || pr.user === myUserId) && pr.role === 'admin'
    );

    if (membersList) {
      membersList.innerHTML = '';
      (group.participants || []).forEach((p) => {
        const pId = p._id || p;
        const roleObj = group.participantRoles?.find(
          (pr) => (pr.user?._id === pId || pr.user === pId)
        );
        const isAdmin = roleObj && roleObj.role === 'admin';
        const isSelf = pId === myUserId;

        const row = document.createElement('div');
        row.className = 'user-select-item';
        const avatarUrl = p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.displayName || 'U')}&background=00a884&color=fff`;

        row.innerHTML = `
          <img class="user-select-avatar" src="${avatarUrl}" alt="${Utils.escapeHtml(p.displayName || '')}">
          <div class="user-select-info">
            <div class="user-select-name">${Utils.escapeHtml(p.displayName || 'User')} ${isSelf ? '<span style="font-size:12px; color:var(--text-muted);">(You)</span>' : ''}</div>
            <div class="user-select-about">${Utils.escapeHtml(p.about || '')}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${isAdmin ? '<span style="background:rgba(0,168,132,0.12); color:var(--wa-teal); padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600;">Admin</span>' : ''}
            ${isCurrentUserAdmin && !isSelf ? `
              <button class="doc-download-btn" style="color:#ea4335;" title="Remove from group" onclick="Groups.removeMember('${group._id}', '${pId}')">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            ` : ''}
          </div>
        `;
        membersList.appendChild(row);
      });
    }

    if (leaveBtn) {
      leaveBtn.onclick = () => this.leaveGroup(group._id);
    }
  },

  async removeMember(groupId, memberId) {
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      await API.groups.removeMember(groupId, memberId);
      Utils.showToast('Member removed', 'info');
      const updated = await API.conversations.getById(groupId);
      if (updated && updated.data) {
        this.openGroupInfo(updated.data.conversation);
      }
    } catch (err) {
      Utils.showToast(err.message || 'Failed to remove member', 'error');
    }
  },

  async leaveGroup(groupId) {
    if (!confirm('Are you sure you want to leave this group?')) return;
    try {
      await API.groups.leave(groupId);
      Utils.showToast('You left the group', 'info');
      const modal = document.getElementById('modal-group-info');
      if (modal) modal.classList.remove('active');

      const welcome = document.getElementById('welcome-screen');
      const panel = document.getElementById('active-chat-panel');
      if (panel) panel.classList.remove('active');
      if (welcome) welcome.style.display = 'flex';

      Chats.activeConversation = null;
      await Chats.loadConversations();
    } catch (err) {
      Utils.showToast(err.message || 'Failed to leave group', 'error');
    }
  }
};

window.Groups = Groups;
