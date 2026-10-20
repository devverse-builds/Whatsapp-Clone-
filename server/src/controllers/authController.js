const User = require('../models/User');
const Session = require('../models/Session');
const bcrypt = require('bcryptjs');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies
} = require('../utils/tokens');

// Constant dummy hash to prevent timing attacks / username enumeration
const DUMMY_HASH = '$2a$10$wT3WfI9r4B/Z6nE0wVlhjO4k4uE0d0E2tK2Q0E0d0E2tK2Q0E0d0E';

const register = async (req, res, next) => {
  try {
    const { displayName, username, password, email, phone } = req.body;

    // Check if user exists with username
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    if (email) {
      const existingEmail = await User.findOne({ normalizedEmail: email });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists'
        });
      }
    }

    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: 'An account with this phone already exists'
        });
      }
    }

    // Hash password
    const passwordHash = await User.hashPassword(password);

    // Default avatar using UI Avatars service or initials svg
    const initial = encodeURIComponent(displayName);
    const defaultAvatar = `https://ui-avatars.com/api/?name=${initial}&background=00a884&color=fff&size=128`;

    const newUser = await User.create({
      displayName,
      username,
      normalizedEmail: email || undefined,
      phone: phone || undefined,
      passwordHash,
      avatar: defaultAvatar
    });

    const accessToken = generateAccessToken({ userId: newUser._id });
    const refreshToken = generateRefreshToken({ userId: newUser._id });

    // Store session
    await Session.create({
      userId: newUser._id,
      refreshToken,
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    setAuthCookies(res, accessToken, refreshToken);

    const userObj = newUser.toJSON();

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: userObj,
        accessToken
      }
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    // Search by username, normalizedEmail, or phone
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { normalizedEmail: identifier },
        { phone: identifier }
      ]
    }).select('+passwordHash');

    if (!user) {
      // Timing attack equalization: keep response duration indistinguishable
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password'
      });
    }

    // Check brute-force account lockout
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remainingMinutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked due to excessive failed attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`
      });
    }

    if (user.accountStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended or deactivated'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const updateData = { failedLoginAttempts: attempts };
      if (attempts >= 5) {
        updateData.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await User.findByIdAndUpdate(user._id, updateData);

      const remainingAttempts = Math.max(0, 5 - attempts);
      const message = attempts >= 5
        ? 'Account temporarily locked for 15 minutes due to too many failed attempts.'
        : (attempts >= 3
            ? `Invalid username/email or password. ${remainingAttempts} attempt(s) remaining before account lockout.`
            : 'Invalid username/email or password');

      return res.status(401).json({
        success: false,
        message
      });
    }

    // Reset failed attempts upon successful login
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      await User.findByIdAndUpdate(user._id, {
        failedLoginAttempts: 0,
        $unset: { lockUntil: 1 }
      });
    }

    const accessToken = generateAccessToken({ userId: user._id });
    const refreshToken = generateRefreshToken({ userId: user._id });

    await Session.create({
      userId: user._id,
      refreshToken,
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    setAuthCookies(res, accessToken, refreshToken);

    const userObj = user.toJSON();

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userObj,
        accessToken
      }
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await Session.deleteOne({ refreshToken });
    }

    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
};

const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (err) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Expired or invalid refresh token'
      });
    }

    const session = await Session.findOne({ refreshToken, userId: decoded.userId });
    if (!session) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Session revoked or invalid'
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.accountStatus !== 'active') {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Account not found or inactive'
      });
    }

    // Rotate refresh token
    const newAccessToken = generateAccessToken({ userId: user._id });
    const newRefreshToken = generateRefreshToken({ userId: user._id });

    session.refreshToken = newRefreshToken;
    session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await session.save();

    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({
      success: true,
      message: 'Token refreshed',
      data: {
        user: user.toJSON(),
        accessToken: newAccessToken
      }
    });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+passwordHash');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password does not match'
      });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    await user.save();

    // Invalidate all other sessions for security
    await Session.deleteMany({ userId: user._id });

    // Create fresh session
    const accessToken = generateAccessToken({ userId: user._id });
    const refreshToken = generateRefreshToken({ userId: user._id });
    await Session.create({
      userId: user._id,
      refreshToken,
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    await User.findByIdAndUpdate(userId, { accountStatus: 'deleted' });
    await Session.deleteMany({ userId });
    clearAuthCookies(res);

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
  refresh,
  changePassword,
  deleteAccount
};
