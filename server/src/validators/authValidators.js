const validateRegister = (req, res, next) => {
  const { displayName, username, password, email, phone } = req.body;

  if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Display name is required' });
  }
  if (displayName.trim().length > 50) {
    return res.status(400).json({ success: false, message: 'Display name cannot exceed 50 characters' });
  }

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ success: false, message: 'Username is required' });
  }
  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3 || cleanUsername.length > 30) {
    return res.status(400).json({ success: false, message: 'Username must be between 3 and 30 characters' });
  }
  if (!/^[a-zA-Z0-9_.]+$/.test(cleanUsername)) {
    return res.status(400).json({ success: false, message: 'Username can only contain alphanumeric characters, dots, and underscores' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
  }

  if (email && typeof email === 'string' && email.trim().length > 0) {
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }
  }

  req.body.username = cleanUsername;
  req.body.displayName = displayName.trim();
  if (email) req.body.email = email.trim().toLowerCase();
  if (phone) req.body.phone = phone.trim();

  next();
};

const validateLogin = (req, res, next) => {
  const { identifier, username, password } = req.body;
  const loginUser = identifier || username;

  if (!loginUser || typeof loginUser !== 'string' || loginUser.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Username or identifier is required' });
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  req.body.identifier = loginUser.trim().toLowerCase();
  next();
};

const validateChangePassword = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({ success: false, message: 'Current password is required' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateChangePassword
};
