require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { connectDB, disconnectDB } = require('./config/database');
const { initIO } = require('./services/socketService');
const setupSockets = require('./sockets/socketHandler');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Connect to MongoDB
  await connectDB();

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize Socket.IO
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5000';
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || origin === clientOrigin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
          callback(null, true);
        } else {
          callback(null, true);
        }
      },
      credentials: true,
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Store IO instance in service
  initIO(io);

  // Configure Socket event handlers
  setupSockets(io);

  // Start HTTP listening
  server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` WhatsApp Clone Server running on port ${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` Client URL: http://localhost:${PORT}`);
    console.log(` API Endpoint: http://localhost:${PORT}/api/v1`);
    console.log(` Health Check: http://localhost:${PORT}/api/health`);
    console.log(`===============================================`);
  });

  // Graceful shutdown
  const handleExit = async (signal) => {
    console.log(`\nReceived ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      await disconnectDB();
      console.log('Server closed successfully.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));

  return { app, server, io };
};

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = startServer;
