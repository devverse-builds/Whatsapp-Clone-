/**
 * WhatsApp Clone - API Client
 */
const API = {
  baseURL: '/api/v1',

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = options.headers || {};

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      method: options.method || 'GET',
      headers,
      credentials: 'include',
      ...options
    };

    if (options.body && !(options.body instanceof FormData)) {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error(`API Error [${config.method} ${endpoint}]:`, error.message);
      throw error;
    }
  },

  // Auth Endpoints
  auth: {
    register: (payload) => API.request('/auth/register', { method: 'POST', body: payload }),
    login: (payload) => API.request('/auth/login', { method: 'POST', body: payload }),
    logout: () => API.request('/auth/logout', { method: 'POST' }),
    getMe: () => API.request('/auth/me'),
    refresh: () => API.request('/auth/refresh', { method: 'POST' }),
    changePassword: (payload) => API.request('/auth/change-password', { method: 'POST', body: payload }),
    deleteAccount: () => API.request('/auth/delete-account', { method: 'DELETE' })
  },

  // Users Endpoints
  users: {
    search: (query) => API.request(`/users/search?query=${encodeURIComponent(query)}`),
    getUser: (userId) => API.request(`/users/${userId}`),
    updateProfile: (payload) => API.request('/users/me', { method: 'PATCH', body: payload }),
    getBlocked: () => API.request('/users/me/blocked'),
    block: (userId) => API.request(`/users/${userId}/block`, { method: 'POST' }),
    unblock: (userId) => API.request(`/users/${userId}/block`, { method: 'DELETE' })
  },

  // Conversations Endpoints
  conversations: {
    getAll: () => API.request('/conversations'),
    create: (recipientId) => API.request('/conversations', { method: 'POST', body: { recipientId } }),
    getById: (id) => API.request(`/conversations/${id}`),
    update: (id, payload) => API.request(`/conversations/${id}`, { method: 'PATCH', body: payload }),
    delete: (id) => API.request(`/conversations/${id}`, { method: 'DELETE' })
  },

  // Messages Endpoints
  messages: {
    get: (conversationId, before = null, limit = 40) => {
      let query = `?limit=${limit}`;
      if (before) query += `&before=${encodeURIComponent(before)}`;
      return API.request(`/conversations/${conversationId}/messages${query}`);
    },
    send: (conversationId, payload) => API.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: payload
    }),
    markAsRead: (conversationId) => API.request(`/conversations/${conversationId}/read`, { method: 'POST' }),
    edit: (messageId, content) => API.request(`/messages/${messageId}`, { method: 'PATCH', body: { content } }),
    delete: (messageId, forEveryone = false) => API.request(`/messages/${messageId}`, {
      method: 'DELETE',
      body: { forEveryone }
    })
  },

  // Groups Endpoints
  groups: {
    create: (payload) => API.request('/groups', { method: 'POST', body: payload }),
    update: (id, payload) => API.request(`/groups/${id}`, { method: 'PATCH', body: payload }),
    addMembers: (id, members) => API.request(`/groups/${id}/members`, { method: 'POST', body: { members } }),
    removeMember: (id, userId) => API.request(`/groups/${id}/members/${userId}`, { method: 'DELETE' }),
    leave: (id) => API.request(`/groups/${id}/leave`, { method: 'POST' })
  },

  // Media Endpoints
  media: {
    upload: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return API.request('/media/upload', {
        method: 'POST',
        body: formData
      });
    }
  },

  // Status Endpoints
  statuses: {
    create: (payload) => API.request('/statuses', { method: 'POST', body: payload }),
    getAll: () => API.request('/statuses'),
    view: (statusId) => API.request(`/statuses/${statusId}/view`, { method: 'POST' }),
    delete: (statusId) => API.request(`/statuses/${statusId}`, { method: 'DELETE' })
  },

  // WebRTC ICE Configuration
  webrtc: {
    getConfig: () => API.request('/webrtc/config')
  }
};

window.API = API;
