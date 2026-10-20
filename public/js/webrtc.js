/**
 * WhatsApp Clone - WebRTC Audio & Video Calling Module
 * Hardened for Mobile & Desktop: ICE Candidate Queuing, Audio Playback Fallback,
 * Web Audio Ringing/Ringback Synthesizers, Camera Graceful Fallback, Call Auto-timeout.
 */
const WebRTC = {
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  currentCall: null, // { callId, targetUserId, targetUser, callType, isCaller }
  pendingCandidates: [],
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302'] }
  ],
  callTimerInterval: null,
  callStartTime: null,
  callTimeoutTimer: null,
  audioCtx: null,
  ringInterval: null,

  async init() {
    this.setupEventListeners();
    this.setupSocketListeners();
    try {
      const res = await API.webrtc.getConfig();
      if (res && res.iceServers && res.iceServers.length) {
        this.iceServers = res.iceServers;
      }
    } catch (e) {
      // Use STUN defaults
    }
  },

  safeEmit(event, data, callback) {
    if (window.SocketClient && SocketClient.socket && SocketClient.socket.connected) {
      SocketClient.socket.emit(event, data, callback);
      return true;
    }
    Utils.showToast('Network connection lost. Please reconnect.', 'error');
    return false;
  },

  setupEventListeners() {
    const audioCallBtn = document.getElementById('btn-header-call-audio');
    const videoCallBtn = document.getElementById('btn-header-call-video');

    if (audioCallBtn) {
      audioCallBtn.addEventListener('click', () => {
        this.startCall('audio');
      });
    }

    if (videoCallBtn) {
      videoCallBtn.addEventListener('click', () => {
        this.startCall('video');
      });
    }

    // Call controls in overlay
    const hangupBtn = document.getElementById('btn-call-hangup');
    const acceptBtn = document.getElementById('btn-call-accept');
    const rejectBtn = document.getElementById('btn-call-reject');
    const muteBtn = document.getElementById('btn-call-mute');
    const videoToggleBtn = document.getElementById('btn-call-toggle-video');

    if (hangupBtn) {
      hangupBtn.addEventListener('click', () => this.endCall());
    }

    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => this.acceptCall());
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => this.rejectCall());
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', () => this.toggleMute());
    }

    if (videoToggleBtn) {
      videoToggleBtn.addEventListener('click', () => this.toggleVideo());
    }
  },

  setupSocketListeners() {
    SocketClient.on('call:incoming', (data) => {
      this.handleIncomingCall(data);
    });

    SocketClient.on('call:accepted', (data) => {
      this.handleCallAccepted(data);
    });

    SocketClient.on('call:rejected', (data) => {
      this.handleCallRejected(data);
    });

    SocketClient.on('call:ended', (data) => {
      this.handleCallEnded(data);
    });

    SocketClient.on('webrtc:signal', (data) => {
      this.handleSignal(data);
    });
  },

  // Ringback tone (for caller while waiting for recipient to answer)
  startRingbackTone() {
    this.stopAudioTones();
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx();

      const playBeep = () => {
        if (!this.audioCtx || this.audioCtx.state === 'closed') return;
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        osc2.frequency.setValueAtTime(480, this.audioCtx.currentTime);

        gain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 1.8);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(this.audioCtx.currentTime + 1.8);
        osc2.stop(this.audioCtx.currentTime + 1.8);
      };

      playBeep();
      this.ringInterval = setInterval(playBeep, 4000);
    } catch (e) {
      console.warn('[WebRTC] Ringback tone audio error:', e);
    }
  },

  // Incoming call ringtone (melodic WhatsApp-style alert for receiver)
  startIncomingRingtone() {
    this.stopAudioTones();
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx();

      const playChime = () => {
        if (!this.audioCtx || this.audioCtx.state === 'closed') return;
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(740, this.audioCtx.currentTime);
        osc.frequency.setValueAtTime(987, this.audioCtx.currentTime + 0.18);
        osc.frequency.setValueAtTime(740, this.audioCtx.currentTime + 0.36);
        osc.frequency.setValueAtTime(987, this.audioCtx.currentTime + 0.54);

        gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.9);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.9);
      };

      playChime();
      this.ringInterval = setInterval(playChime, 2200);
    } catch (e) {
      console.warn('[WebRTC] Ringtone audio error:', e);
    }
  },

  stopAudioTones() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  },

  async startCall(callType) {
    if (!Chats.activeConversation || Chats.activeConversation.type !== 'direct') {
      Utils.showToast('Voice and video calls are supported in one-to-one chats', 'info');
      return;
    }

    const recipient = Chats.activeConversation.opponent;
    if (!recipient) {
      Utils.showToast('Recipient not found', 'error');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      Utils.showToast('Calling is not supported on this browser or connection', 'error');
      return;
    }

    this.currentCall = {
      targetUserId: recipient._id,
      targetUser: recipient,
      callType,
      isCaller: true
    };
    this.pendingCandidates = [];

    this.showCallModal('calling');
    this.startRingbackTone();

    // 35s auto-timeout if not answered
    this.callTimeoutTimer = setTimeout(() => {
      if (this.currentCall && this.currentCall.isCaller && !this.peerConnection) {
        Utils.showToast('No answer', 'info');
        this.endCall();
      }
    }, 35000);

    try {
      // Capture media with graceful video fallback
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false
        });
      } catch (mediaErr) {
        if (callType === 'video') {
          Utils.showToast('Camera unavailable, switching to voice call', 'info');
          this.currentCall.callType = 'audio';
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } else {
          throw mediaErr;
        }
      }

      const localVideo = document.getElementById('call-local-video');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
        localVideo.style.display = this.currentCall.callType === 'video' ? 'block' : 'none';
      }

      // Emit invite to server
      const sent = this.safeEmit(
        'call:invite',
        { receiverId: recipient._id, callType: this.currentCall.callType },
        (res) => {
          if (res && res.success) {
            if (this.currentCall) this.currentCall.callId = res.callId;
          } else {
            this.stopAudioTones();
            Utils.showToast(res?.message || 'Call failed to connect', 'error');
            this.cleanUpCall();
          }
        }
      );

      if (!sent) {
        this.cleanUpCall();
      }
    } catch (err) {
      this.stopAudioTones();
      Utils.showToast('Could not access microphone/camera: ' + err.message, 'error');
      this.cleanUpCall();
    }
  },

  async handleIncomingCall(data) {
    const { callId, caller, callType } = data;
    this.currentCall = {
      callId,
      targetUserId: caller._id,
      targetUser: caller,
      callType,
      isCaller: false
    };
    this.pendingCandidates = [];

    this.showCallModal('incoming');
    this.startIncomingRingtone();

    // 35s auto-timeout if user doesn't respond
    this.callTimeoutTimer = setTimeout(() => {
      if (this.currentCall && !this.currentCall.isCaller && !this.peerConnection) {
        this.rejectCall();
      }
    }, 35000);
  },

  async acceptCall() {
    if (!this.currentCall) return;
    this.stopAudioTones();
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
    }

    try {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: this.currentCall.callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false
        });
      } catch (mediaErr) {
        if (this.currentCall.callType === 'video') {
          Utils.showToast('Camera unavailable, accepting as audio call', 'info');
          this.currentCall.callType = 'audio';
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } else {
          throw mediaErr;
        }
      }

      const localVideo = document.getElementById('call-local-video');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
        localVideo.style.display = this.currentCall.callType === 'video' ? 'block' : 'none';
      }

      this.createPeerConnection();

      // Emit accept to caller
      this.safeEmit('call:accept', {
        callId: this.currentCall.callId,
        callerId: this.currentCall.targetUserId
      });

      this.showCallModal('connected');
      this.startCallTimer();
    } catch (err) {
      Utils.showToast('Could not access microphone/camera', 'error');
      this.rejectCall();
    }
  },

  rejectCall() {
    this.stopAudioTones();
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
    }
    if (this.currentCall) {
      this.safeEmit('call:reject', {
        callId: this.currentCall.callId,
        callerId: this.currentCall.targetUserId
      });
    }
    this.cleanUpCall();
  },

  async handleCallAccepted(data) {
    if (!this.currentCall) return;
    this.stopAudioTones();
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
    }

    this.showCallModal('connected');
    this.startCallTimer();

    // Caller creates peer connection and sends SDP offer
    this.createPeerConnection();

    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.currentCall.callType === 'video'
      });
      await this.peerConnection.setLocalDescription(offer);

      this.safeEmit('webrtc:signal', {
        targetUserId: this.currentCall.targetUserId,
        signal: { type: 'offer', sdp: offer }
      });
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
      Utils.showToast('Failed to negotiate call', 'error');
      this.endCall();
    }
  },

  handleCallRejected() {
    this.stopAudioTones();
    Utils.showToast('Call declined', 'info');
    this.cleanUpCall();
  },

  handleCallEnded() {
    this.stopAudioTones();
    Utils.showToast('Call ended', 'info');
    this.cleanUpCall();
  },

  createPeerConnection() {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
    }

    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Relay local ICE candidates to peer
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.currentCall) {
        this.safeEmit('webrtc:signal', {
          targetUserId: this.currentCall.targetUserId,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    // Attach remote stream to both video and dedicated audio elements
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      const remoteVideo = document.getElementById('call-remote-video');
      const remoteAudio = document.getElementById('call-remote-audio');

      if (remoteVideo) {
        remoteVideo.srcObject = this.remoteStream;
        remoteVideo.play().catch(() => {});
      }
      if (remoteAudio) {
        remoteAudio.srcObject = this.remoteStream;
        remoteAudio.play().catch((err) => {
          console.warn('[WebRTC] Audio auto-play restricted:', err);
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      const state = this.peerConnection.connectionState;
      if (state === 'failed') {
        Utils.showToast('Call connection failed', 'error');
        this.endCall();
      } else if (state === 'disconnected') {
        Utils.showToast('Call disconnected', 'info');
      }
    };
  },

  async drainPendingCandidates() {
    if (!this.peerConnection) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTC] Error adding buffered ICE candidate:', err);
      }
    }
  },

  async handleSignal(data) {
    const { signal } = data;
    if (!signal) return;

    try {
      if (signal.type === 'offer') {
        if (!this.peerConnection) {
          this.createPeerConnection();
        }
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await this.drainPendingCandidates();

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.safeEmit('webrtc:signal', {
          targetUserId: this.currentCall?.targetUserId,
          signal: { type: 'answer', sdp: answer }
        });
      } else if (signal.type === 'answer') {
        if (this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await this.drainPendingCandidates();
        }
      } else if (signal.type === 'candidate') {
        // Queue candidate if remoteDescription is not yet set to prevent InvalidStateError
        if (!this.peerConnection || !this.peerConnection.remoteDescription || !this.peerConnection.remoteDescription.type) {
          this.pendingCandidates.push(signal.candidate);
        } else {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.warn('[WebRTC] Candidate error:', err);
          }
        }
      }
    } catch (err) {
      console.error('[WebRTC] Error handling signal:', err);
    }
  },

  endCall() {
    this.stopAudioTones();
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
    }
    if (this.currentCall) {
      this.safeEmit('call:end', {
        callId: this.currentCall.callId,
        targetUserId: this.currentCall.targetUserId
      });
    }
    this.cleanUpCall();
  },

  cleanUpCall() {
    this.stopAudioTones();
    if (this.callTimeoutTimer) {
      clearTimeout(this.callTimeoutTimer);
      this.callTimeoutTimer = null;
    }
    clearInterval(this.callTimerInterval);
    this.callTimerInterval = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }

    const localVideo = document.getElementById('call-local-video');
    const remoteVideo = document.getElementById('call-remote-video');
    const remoteAudio = document.getElementById('call-remote-audio');

    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    if (remoteAudio) remoteAudio.srcObject = null;

    this.pendingCandidates = [];
    this.currentCall = null;

    const modal = document.getElementById('modal-call-overlay');
    if (modal) modal.classList.remove('active');
  },

  showCallModal(state) {
    const modal = document.getElementById('modal-call-overlay');
    if (!modal) return;

    modal.classList.add('active');

    const peerAvatar = document.getElementById('call-peer-avatar');
    const peerName = document.getElementById('call-peer-name');
    const statusLabel = document.getElementById('call-status-label');
    const acceptBtn = document.getElementById('btn-call-accept');
    const rejectBtn = document.getElementById('btn-call-reject');
    const hangupBtn = document.getElementById('btn-call-hangup');
    const videoStage = document.getElementById('call-video-stage');

    const target = this.currentCall?.targetUser;
    const isVideo = this.currentCall?.callType === 'video';

    if (peerAvatar) {
      peerAvatar.src = target?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(target?.displayName || 'User')}&background=00a884&color=fff`;
    }
    if (peerName) {
      peerName.textContent = target?.displayName || 'Contact';
    }

    if (videoStage) {
      videoStage.style.display = isVideo && state === 'connected' ? 'flex' : 'none';
    }

    if (state === 'calling') {
      if (statusLabel) statusLabel.textContent = `Calling (${isVideo ? 'Video' : 'Voice'})...`;
      if (acceptBtn) acceptBtn.style.display = 'none';
      if (rejectBtn) rejectBtn.style.display = 'none';
      if (hangupBtn) hangupBtn.style.display = 'flex';
    } else if (state === 'incoming') {
      if (statusLabel) statusLabel.textContent = `Incoming ${isVideo ? 'Video' : 'Voice'} Call...`;
      if (acceptBtn) acceptBtn.style.display = 'flex';
      if (rejectBtn) rejectBtn.style.display = 'flex';
      if (hangupBtn) hangupBtn.style.display = 'none';
    } else if (state === 'connected') {
      if (statusLabel) statusLabel.textContent = '00:00';
      if (acceptBtn) acceptBtn.style.display = 'none';
      if (rejectBtn) rejectBtn.style.display = 'none';
      if (hangupBtn) hangupBtn.style.display = 'flex';
    }
  },

  startCallTimer() {
    this.callStartTime = Date.now();
    const statusLabel = document.getElementById('call-status-label');

    this.callTimerInterval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - this.callStartTime) / 1000);
      if (statusLabel) {
        statusLabel.textContent = Utils.formatDuration(elapsedSec);
      }
    }, 1000);
  },

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const muteBtn = document.getElementById('btn-call-mute');
        if (muteBtn) {
          muteBtn.classList.toggle('disabled', !audioTrack.enabled);
        }
        Utils.showToast(audioTrack.enabled ? 'Microphone unmuted' : 'Microphone muted', 'info');
      }
    }
  },

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const videoBtn = document.getElementById('btn-call-toggle-video');
        if (videoBtn) {
          videoBtn.classList.toggle('disabled', !videoTrack.enabled);
        }
        Utils.showToast(videoTrack.enabled ? 'Camera turned on' : 'Camera turned off', 'info');
      }
    }
  }
};

window.WebRTC = WebRTC;
