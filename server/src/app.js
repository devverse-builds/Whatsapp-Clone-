require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const groupRoutes = require('./routes/groupRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const statusRoutes = require('./routes/statusRoutes');

const app = express();

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://ui-avatars.com", "https://res.cloudinary.com", "*"],
        mediaSrc: ["'self'", "blob:", "data:", "*"],
        connectSrc: ["'self'", "ws:", "wss:", "http://localhost:*", "https://*"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// CORS
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5000';
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin || origin === clientOrigin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true); // Dev-friendly fallback
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serverless DB connection middleware (ensures connection on Vercel)
const mongoose = require('mongoose');
const { connectDB } = require('./config/database');

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') && mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (err) {
      console.error('[DB Middleware] Connection failed:', err.message);
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }
  }
  next();
});

// Static directories
const fs = require('fs');
const uploadsDir = path.resolve(__dirname, '../../uploads');
const clientDir = fs.existsSync(path.resolve(__dirname, '../../public'))
  ? path.resolve(__dirname, '../../public')
  : path.resolve(__dirname, '../../client');

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(clientDir));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ICE Servers endpoint for WebRTC calling
app.get('/api/v1/webrtc/config', (req, res) => {
  let iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.ICE_SERVERS) {
    try {
      iceServers = JSON.parse(process.env.ICE_SERVERS);
    } catch (e) {
      // Use defaults
    }
  }
  res.status(200).json({ success: true, iceServers });
});

// Versioned API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/statuses', statusRoutes);

// Fallback to client index.html for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
