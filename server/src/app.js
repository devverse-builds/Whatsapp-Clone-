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
const { apiLimiter } = require('./middleware/rateLimiter');

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

// Strict CORS Origin Validation
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5000';
const extraOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Direct, same-origin, mobile webview
  if (origin === clientOrigin) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)) return true;
  if (extraOrigins.includes(origin)) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: Origin ${origin} not permitted`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

// Body parsers with size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Recursive NoSQL Injection Sanitizer: strips keys starting with $ or containing .
const sanitizeNoSQL = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeNoSQL(obj[key]);
    }
  }
};

app.use((req, res, next) => {
  if (req.body) sanitizeNoSQL(req.body);
  if (req.query) sanitizeNoSQL(req.query);
  if (req.params) sanitizeNoSQL(req.params);
  next();
});

// General API rate limiter
app.use('/api/', apiLimiter);

// Serverless DB connection middleware (ensures connection on Vercel)
const mongoose = require('mongoose');
const { connectDB } = require('./config/database');

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') && mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (err) {
      console.error('[DB Middleware] Connection failed:', err.message);
      let userHint = err.message;
      if (!process.env.MONGODB_URI) {
        userHint = 'MONGODB_URI is not set in Vercel Environment Variables. Please add MONGODB_URI in Vercel Project Settings.';
      } else if (process.env.MONGODB_URI.includes('<') || process.env.MONGODB_URI.includes('>')) {
        userHint = 'MONGODB_URI contains "<" or ">" placeholder brackets. Replace with actual credentials (e.g. whatsapp-admin).';
      }
      return res.status(500).json({
        success: false,
        message: `Database connection error: ${userHint}`
      });
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

// Health check with DB status
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbError = null;
  const rawUri = process.env.MONGODB_URI || '';
  const maskedUri = rawUri ? rawUri.replace(/:([^@]+)@/, ':****@') : 'NOT_SET (falling back to localhost)';

  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'error';
    dbError = err.message;
  }

  res.status(dbStatus === 'connected' ? 200 : 500).json({
    status: dbStatus === 'connected' ? 'ok' : 'error',
    database: {
      status: dbStatus,
      uri: maskedUri,
      hasAngleBrackets: rawUri.includes('<') || rawUri.includes('>'),
      error: dbError,
      readyState: mongoose.connection.readyState
    },
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
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
