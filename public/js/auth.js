/**
 * WhatsApp Clone - Auth Module
 */
const Auth = {
  currentUser: null,

  async init() {
    this.setupEventListeners();
    return this.checkAuth();
  },

  setupEventListeners() {
    const loginTab = document.getElementById('tab-login');
    const registerTab = document.getElementById('tab-register');
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');

    if (loginTab && registerTab) {
      loginTab.addEventListener('click', () => {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        this.clearAlerts();
      });

      registerTab.addEventListener('click', () => {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.style.display = 'flex';
        loginForm.style.display = 'none';
        this.clearAlerts();
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleRegister();
      });
    }

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }
  },

  clearAlerts() {
    const alertEl = document.getElementById('auth-alert');
    if (alertEl) {
      alertEl.className = 'auth-alert';
      alertEl.textContent = '';
      alertEl.style.display = 'none';
    }
  },

  showAlert(message, isError = true) {
    const alertEl = document.getElementById('auth-alert');
    if (alertEl) {
      alertEl.className = `auth-alert ${isError ? 'error' : 'success'}`;
      alertEl.textContent = message;
      alertEl.style.display = 'block';
    }
  },

  async checkAuth() {
    try {
      const res = await API.auth.getMe();
      if (res && res.success && res.data && res.data.user) {
        this.currentUser = res.data.user;
        this.onAuthSuccess(this.currentUser);
        return true;
      }
    } catch (err) {
      this.currentUser = null;
      this.showAuthUI();
      return false;
    }
  },

  async handleLogin() {
    this.clearAlerts();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = document.getElementById('btn-login-submit');

    if (!identifier || !password) {
      this.showAlert('Please fill in all fields');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      const res = await API.auth.login({ identifier, password });
      if (res && res.success) {
        this.currentUser = res.data.user;
        this.onAuthSuccess(this.currentUser);
      }
    } catch (err) {
      this.showAlert(err.message || 'Login failed');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  },

  async handleRegister() {
    this.clearAlerts();
    const displayName = document.getElementById('reg-displayname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const submitBtn = document.getElementById('btn-register-submit');

    if (!displayName || !username || !password) {
      this.showAlert('Name, username, and password are required');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      const payload = { displayName, username, password };
      if (email) payload.email = email;
      if (phone) payload.phone = phone;

      const res = await API.auth.register(payload);
      if (res && res.success) {
        this.currentUser = res.data.user;
        this.onAuthSuccess(this.currentUser);
      }
    } catch (err) {
      this.showAlert(err.message || 'Registration failed');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  },

  async handleLogout() {
    try {
      await API.auth.logout();
    } catch (err) {
      console.warn('Logout error:', err.message);
    }
    this.currentUser = null;
    SocketClient.disconnect();
    this.showAuthUI();
    Utils.showToast('Logged out successfully', 'info');
  },

  onAuthSuccess(user) {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('main-container').style.display = 'flex';

    // Update rail avatar
    const railAvatar = document.getElementById('rail-user-avatar');
    if (railAvatar) {
      railAvatar.src = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=00a884&color=fff`;
      railAvatar.alt = user.displayName;
    }

    // Apply saved theme
    if (user.theme) {
      document.documentElement.setAttribute('data-theme', user.theme === 'light' ? 'light' : 'dark');
    }

    // Connect socket
    SocketClient.init();

    // Trigger app initialization for logged-in user
    if (window.App && typeof window.App.onLogin === 'function') {
      window.App.onLogin(user);
    }
  },

  showAuthUI() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('main-container').style.display = 'none';
  }
};

window.Auth = Auth;
