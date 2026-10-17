/**
 * WhatsApp Clone - Notifications & Audio Synthesizer
 */
const Notifications = {
  audioCtx: null,

  init() {
    if ('Notification' in window && Notification.permission === 'default') {
      // Prompt user gently after first user interaction
      document.addEventListener('click', () => {
        if (Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }, { once: true });
    }
  },

  playChime() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      // Elegant two-tone WhatsApp style chime synthesized via Web Audio API
      const now = this.audioCtx.currentTime;

      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(880, now); // A5
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.12);

      osc2.frequency.setValueAtTime(1320, now + 0.08); // E6
      osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.2);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc1.start(now);
      osc1.stop(now + 0.15);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.35);
    } catch (e) {
      // Audio autoplay restrictions
    }
  },

  onIncomingMessage(message) {
    // Check user notification settings
    const soundsEnabled = Auth.currentUser?.notificationSettings?.sounds !== false;
    if (soundsEnabled) {
      this.playChime();
    }

    // Browser Notification
    const desktopEnabled = Auth.currentUser?.notificationSettings?.desktop !== false;
    if (desktopEnabled && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const senderName = message.senderId?.displayName || 'WhatsApp';
      const body = message.content ? Utils.escapeHtml(message.content) : 'New media message';
      new Notification(`New message from ${senderName}`, {
        body,
        icon: message.senderId?.avatar || '/favicon.ico'
      });
    }
  }
};

window.Notifications = Notifications;
