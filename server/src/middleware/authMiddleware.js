const { verifyAccessToken } = require('../utils/tokens');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    let token = null;

    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.'
      });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token'
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.accountStatus !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account not found or inactive'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal authentication error'
    });
  }
};

const socketAuthMiddleware = async (socket, next) => {
  try {
    let token = null;

    // Check auth object in handshake
    if (socket.handshake.auth && socket.handshake.auth.token) {
      token = socket.handshake.auth.token;
    } else if (socket.handshake.headers.cookie) {
      // Parse cookie from handshake
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = Object.fromEntries(
        cookieHeader.split('; ').map((c) => {
          const [key, ...v] = c.split('=');
          return [key, decodeURIComponent(v.join('='))];
        })
      );
      if (cookies.accessToken) {
        token = cookies.accessToken;
      }
    }

    if (!token) {
      return next(new Error('Authentication required for socket connection'));
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);
    if (!user || user.accountStatus !== 'active') {
      return next(new Error('User not found or inactive'));
    }

    socket.user = user;
    socket.userId = user._id.toString();
    next();
  } catch (error) {
    return next(new Error('Invalid socket authentication token'));
  }
};

module.exports = {
  authMiddleware,
  socketAuthMiddleware
};
