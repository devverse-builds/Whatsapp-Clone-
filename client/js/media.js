/**
 * WhatsApp Clone - Media & Voice Recording Manager
 */
const Media = {
  mediaRecorder: null,
  recordedChunks: [],
  recordingStartTime: null,
  recordingTimerInterval: null,
  currentPlayingAudio: null,

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    // Attachment button toggle
    const attachBtn = document.getElementById('btn-attach-menu');
    const attachMenu = document.getElementById('attachment-menu-popup');

    if (attachBtn && attachMenu) {
      attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        attachMenu.classList.toggle('active');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#attachment-menu-popup') && !e.target.closest('#btn-attach-menu')) {
          attachMenu.classList.remove('active');
        }
      });
    }

    // Attachment file inputs
    const photoInput = document.getElementById('input-attach-photo');
    const docInput = document.getElementById('input-attach-doc');

    if (photoInput) {
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFileUpload(file, file.type.startsWith('video/') ? 'video' : 'image');
        photoInput.value = '';
        if (attachMenu) attachMenu.classList.remove('active');
      });
    }

    if (docInput) {
      docInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFileUpload(file, 'document');
        docInput.value = '';
        if (attachMenu) attachMenu.classList.remove('active');
      });
    }

    // Voice record controls
    const voiceBtn = document.getElementById('btn-composer-voice');
    const cancelVoiceBtn = document.getElementById('btn-voice-cancel');
    const sendVoiceBtn = document.getElementById('btn-voice-send');

    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => {
        this.startVoiceRecording();
      });
    }

    if (cancelVoiceBtn) {
      cancelVoiceBtn.addEventListener('click', () => {
        this.cancelVoiceRecording();
      });
    }

    if (sendVoiceBtn) {
      sendVoiceBtn.addEventListener('click', () => {
        this.stopAndSendVoiceRecording();
      });
    }

    // Lightbox modal close
    const lightboxModal = document.getElementById('modal-media-lightbox');
    const closeLightboxBtn = document.getElementById('btn-close-lightbox');

    if (closeLightboxBtn && lightboxModal) {
      closeLightboxBtn.addEventListener('click', () => {
        lightboxModal.classList.remove('active');
      });
    }
  },

  async handleFileUpload(file, messageType) {
    if (!Chats.activeConversation) {
      Utils.showToast('Please select a conversation first', 'error');
      return;
    }

    const conversationId = Chats.activeConversation._id;
    Utils.showToast(`Uploading ${file.name}...`, 'info');

    try {
      const uploadRes = await API.media.upload(file);
      if (uploadRes && uploadRes.success && uploadRes.data) {
        const attachmentData = uploadRes.data;

        await Messages.handleSendMessage(); // Clear any text
        const clientMessageId = Utils.generateClientId();

        const msgPayload = {
          conversationId,
          type: messageType,
          content: '',
          attachment: attachmentData,
          clientMessageId
        };

        await API.messages.send(conversationId, msgPayload);
        Utils.showToast('File sent successfully', 'success');
      }
    } catch (err) {
      Utils.showToast(err.message || 'Upload failed', 'error');
    }
  },

  async startVoiceRecording() {
    if (!Chats.activeConversation) {
      Utils.showToast('Please select a conversation first', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start();
      this.recordingStartTime = Date.now();

      // Switch to recording UI
      const normalBar = document.getElementById('composer-normal-bar');
      const recordingBar = document.getElementById('composer-recording-bar');
      if (normalBar) normalBar.style.display = 'none';
      if (recordingBar) recordingBar.classList.add('active');

      const timerEl = document.getElementById('voice-recording-timer');
      this.recordingTimerInterval = setInterval(() => {
        const elapsedSecs = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        if (timerEl) timerEl.textContent = Utils.formatDuration(elapsedSecs);
      }, 500);
    } catch (err) {
      console.error('Microphone error:', err);
      Utils.showToast('Could not access microphone: ' + err.message, 'error');
    }
  },

  cancelVoiceRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
    this.resetRecordingUI();
    Utils.showToast('Voice recording cancelled', 'info');
  },

  stopAndSendVoiceRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

    const durationSec = Math.floor((Date.now() - this.recordingStartTime) / 1000);

    this.mediaRecorder.onstop = async () => {
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
      const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });

      try {
        Utils.showToast('Uploading voice note...', 'info');
        const uploadRes = await API.media.upload(audioFile);
        if (uploadRes && uploadRes.success) {
          const attachment = uploadRes.data;
          attachment.duration = durationSec;

          await API.messages.send(Chats.activeConversation._id, {
            type: 'voice',
            attachment,
            clientMessageId: Utils.generateClientId()
          });
          Utils.showToast('Voice note sent', 'success');
        }
      } catch (err) {
        Utils.showToast(err.message || 'Failed to send voice note', 'error');
      }
    };

    this.mediaRecorder.stop();
    this.resetRecordingUI();
  },

  resetRecordingUI() {
    clearInterval(this.recordingTimerInterval);
    const normalBar = document.getElementById('composer-normal-bar');
    const recordingBar = document.getElementById('composer-recording-bar');
    if (normalBar) normalBar.style.display = 'flex';
    if (recordingBar) recordingBar.classList.remove('active');

    const timerEl = document.getElementById('voice-recording-timer');
    if (timerEl) timerEl.textContent = '0:00';
  },

  toggleAudioPlay(btn) {
    const player = btn.closest('.voice-msg-player');
    const audio = player.querySelector('audio');
    const fillBar = player.querySelector('.voice-bar-fill');

    if (this.currentPlayingAudio && this.currentPlayingAudio !== audio) {
      this.currentPlayingAudio.pause();
      const otherBtn = this.currentPlayingAudio.closest('.voice-msg-player')?.querySelector('.voice-play-btn');
      if (otherBtn) {
        otherBtn.innerHTML = '<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
      }
    }

    if (audio.paused) {
      audio.play();
      this.currentPlayingAudio = audio;
      btn.innerHTML = '<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

      audio.ontimeupdate = () => {
        if (audio.duration) {
          const percent = (audio.currentTime / audio.duration) * 100;
          fillBar.style.width = `${percent}%`;
        }
      };

      audio.onended = () => {
        btn.innerHTML = '<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
        fillBar.style.width = '0%';
      };
    } else {
      audio.pause();
      btn.innerHTML = '<svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    }
  },

  seekAudio(event, bar) {
    const player = bar.closest('.voice-msg-player');
    const audio = player.querySelector('audio');
    const fillBar = player.querySelector('.voice-bar-fill');

    const rect = bar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));

    if (audio.duration) {
      audio.currentTime = percent * audio.duration;
      fillBar.style.width = `${percent * 100}%`;
    }
  },

  showLightbox(url, title) {
    const modal = document.getElementById('modal-media-lightbox');
    const imgEl = document.getElementById('lightbox-image');
    const titleEl = document.getElementById('lightbox-title');
    const downloadBtn = document.getElementById('lightbox-download');

    if (modal && imgEl) {
      imgEl.src = url;
      if (titleEl) titleEl.textContent = title || 'Image Preview';
      if (downloadBtn) {
        downloadBtn.href = url;
        downloadBtn.download = title || 'image';
      }
      modal.classList.add('active');
    }
  }
};

window.Media = Media;
