const { socketAuthMiddleware } = require('../middleware/authMiddleware');
const { handleUserConnected, handleUserDisconnected } = require('./presenceHandlers');
const { registerChatHandlers } = require('./chatHandlers');
const { registerCallHandlers } = require('./callHandlers');

const setupSockets = (io) => {
  // Apply socket auth middleware
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    // console.log(`[Socket] User connected: ${socket.user.username} (${userId})`);

    // Join user's personal room for direct events
    socket.join(`user:${userId}`);

    // Update presence
    await handleUserConnected(io, socket);

    // Register handlers
    registerChatHandlers(io, socket);
    registerCallHandlers(io, socket);

    // Handle disconnect
    socket.on('disconnect', async () => {
      // console.log(`[Socket] User disconnected: ${userId}`);
      await handleUserDisconnected(io, socket);
    });
  });
};

module.exports = setupSockets;
