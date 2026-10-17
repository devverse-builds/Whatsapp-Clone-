/**
 * WhatsApp Clone - WebRTC Audio & Video Calling Module
 */
const WebRTC = {
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  currentCall: null, // { callId, targetUserId, targetUser, callType, isCaller }
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
  callTimerInterval: null,
  callStartTime: null,

  async init() {
    this.setupEventListeners();
    this.setupSocketListeners();
    try {
      const res = await API.webrtc.getConfig();
      if (res && res.iceServers) {
        this.iceServers = res.iceServers;
      }
    } catch (e) {
      // Use defaults
    }
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

  async startCall(callType) {
    if (!Chats.activeConversation || Chats.activeConversation.type !== 'direct') {
      Utils.showToast('Calls are supported in one-to-one chats', 'info');
      return;
    }

    const recipient = Chats.activeConversation.opponent;
    if (!recipient) {
      Utils.showToast('Recipient not found', 'error');
      return;
    }

    this.currentCall = {
      targetUserId: recipient._id,
      targetUser: recipient,
      callType,
      isCaller: true
    };

    this.showCallModal('calling');

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });

      const localVideo = document.getElementById('call-local-video');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
        localVideo.style.display = callType === 'video' ? 'block' : 'none';
      }

      // Emit invite
      SocketClient.socket.emit(
        'call:invite',
        { receiverId: recipient._id, callType },
        (res) => {
          if (res && res.success) {
            this.currentCall.callId = res.callId;
          } else {
            Utils.showToast(res?.message || 'Call failed to connect', 'error');
            this.endCall();
          }
        }
      );
    } catch (err) {
      Utils.showToast('Failed to access media devices: ' + err.message, 'error');
      this.endCall();
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

    this.showCallModal('incoming');
  },

  async acceptCall() {
    if (!this.currentCall) return;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.currentCall.callType === 'video'
      });

      const localVideo = document.getElementById('call-local-video');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
        localVideo.style.display = this.currentCall.callType === 'video' ? 'block' : 'none';
      }

      this.createPeerConnection();

      // Emit accept to caller
      SocketClient.socket.emit('call:accept', {
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
    if (this.currentCall) {
      SocketClient.socket.emit('call:reject', {
        callId: this.currentCall.callId,
        callerId: this.currentCall.targetUserId
      });
    }
    this.cleanUpCall();
  },

  async handleCallAccepted(data) {
    if (!this.currentCall) return;
    this.showCallModal('connected');
    this.startCallTimer();

    // Caller creates peer connection and sends SDP offer
    this.createPeerConnection();

    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      SocketClient.socket.emit('webrtc:signal', {
        targetUserId: this.currentCall.targetUserId,
        signal: { type: 'offer', sdp: offer }
      });
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  },

  handleCallRejected() {
    Utils.showToast('Call declined', 'info');
    this.cleanUpCall();
  },

  handleCallEnded() {
    Utils.showToast('Call ended', 'info');
    this.cleanUpCall();
  },

  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.currentCall) {
        SocketClient.socket.emit('webrtc:signal', {
          targetUserId: this.currentCall.targetUserId,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    // Remote tracks
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      const remoteVideo = document.getElementById('call-remote-video');
      if (remoteVideo) {
        remoteVideo.srcObject = this.remoteStream;
      }
    };
  },

  async handleSignal(data) {
    const { signal } = data;
    if (!this.peerConnection || !signal) return;

    try {
      if (signal.type === 'offer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        SocketClient.socket.emit('webrtc:signal', {
          targetUserId: this.currentCall.targetUserId,
          signal: { type: 'answer', sdp: answer }
        });
      } else if (signal.type === 'answer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'candidate') {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.error('Error handling WebRTC signal:', err);
    }
  },

  endCall() {
    if (this.currentCall) {
      SocketClient.socket.emit('call:end', {
        callId: this.currentCall.callId,
        targetUserId: this.currentCall.targetUserId
      });
    }
    this.cleanUpCall();
  },

  cleanUpCall() {
    clearInterval(this.callTimerInterval);

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

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
