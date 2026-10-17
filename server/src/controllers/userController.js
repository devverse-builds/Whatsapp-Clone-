const User = require('../models/User');

const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length === 0) {
      return res.status(200).json({
        success: true,
        data: { users: [] }
      });
    }

    const cleanQuery = query.trim();
    const regex = new RegExp(cleanQuery, 'i');

    const users = await User.find({
      _id: { $ne: req.user._id },
      accountStatus: 'active',
      $or: [
        { username: regex },
        { displayName: regex },
        { phone: cleanQuery }
      ]
    })
      .select('displayName username avatar about isOnline lastSeen')
      .limit(20);

    return res.status(200).json({
      success: true,
      data: { users }
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user || user.accountStatus !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isBlockedByThem = user.blockedUsers.some(
      (id) => id.toString() === req.user._id.toString()
    );
    const isBlockedByMe = req.user.blockedUsers.some(
      (id) => id.toString() === user._id.toString()
    );

    const result = {
      _id: user._id,
      displayName: user.displayName,
      username: user.username,
      about: isBlockedByThem ? '' : user.about,
      avatar: (isBlockedByThem || user.privacy.profilePhoto === 'nobody') ? '' : user.avatar,
      isOnline: isBlockedByThem ? false : (user.privacy.online === 'nobody' ? false : user.isOnline),
      lastSeen: isBlockedByThem ? null : (user.privacy.lastSeen === 'nobody' ? null : user.lastSeen),
      isBlockedByMe,
      isBlockedByThem
    };

    return res.status(200).json({
      success: true,
      data: { user: result }
    });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { displayName, about, avatar, privacy, notificationSettings, theme, chatWallpaper } = req.body;
    const user = await User.findById(req.user._id);

    if (displayName && typeof displayName === 'string') {
      user.displayName = displayName.trim().slice(0, 50);
    }
    if (about !== undefined && typeof about === 'string') {
      user.about = about.trim().slice(0, 140);
    }
    if (avatar !== undefined && typeof avatar === 'string') {
      user.avatar = avatar;
    }
    if (theme && ['light', 'dark', 'system'].includes(theme)) {
      user.theme = theme;
    }
    if (chatWallpaper !== undefined && typeof chatWallpaper === 'string') {
      user.chatWallpaper = chatWallpaper;
    }
    if (privacy && typeof privacy === 'object') {
      if (privacy.lastSeen && ['everyone', 'contacts', 'nobody'].includes(privacy.lastSeen)) {
        user.privacy.lastSeen = privacy.lastSeen;
      }
      if (privacy.online && ['everyone', 'contacts', 'nobody'].includes(privacy.online)) {
        user.privacy.online = privacy.online;
      }
      if (privacy.profilePhoto && ['everyone', 'contacts', 'nobody'].includes(privacy.profilePhoto)) {
        user.privacy.profilePhoto = privacy.profilePhoto;
      }
      if (privacy.status && ['everyone', 'contacts', 'nobody'].includes(privacy.status)) {
        user.privacy.status = privacy.status;
      }
      if (typeof privacy.readReceipts === 'boolean') {
        user.privacy.readReceipts = privacy.readReceipts;
      }
    }
    if (notificationSettings && typeof notificationSettings === 'object') {
      if (typeof notificationSettings.sounds === 'boolean') {
        user.notificationSettings.sounds = notificationSettings.sounds;
      }
      if (typeof notificationSettings.desktop === 'boolean') {
        user.notificationSettings.desktop = notificationSettings.desktop;
      }
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: user.toJSON() }
    });
  } catch (error) {
    next(error);
  }
};

const getBlockedUsers = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('blockedUsers', 'displayName username avatar about');
    return res.status(200).json({
      success: true,
      data: { blockedUsers: user.blockedUsers }
    });
  } catch (error) {
    next(error);
  }
};

const blockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot block yourself'
      });
    }

    const userToBlock = await User.findById(userId);
    if (!userToBlock) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { blockedUsers: userId }
    });

    return res.status(200).json({
      success: true,
      message: 'User blocked successfully'
    });
  } catch (error) {
    next(error);
  }
};

const unblockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { blockedUsers: userId }
    });

    return res.status(200).json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  searchUsers,
  getUserById,
  updateProfile,
  getBlockedUsers,
  blockUser,
  unblockUser
};
