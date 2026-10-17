const Status = require('../models/Status');
const User = require('../models/User');
const { isValidObjectId } = require('../validators/chatValidators');

const createStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { type, content, backgroundColor, mediaUrl } = req.body;

    if (type === 'image' && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'mediaUrl is required for image status'
      });
    }

    if (type === 'text' && (!content || content.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Content cannot be empty for text status'
      });
    }

    const newStatus = await Status.create({
      userId,
      type: type || 'text',
      content: content ? content.trim() : '',
      backgroundColor: backgroundColor || '#075E54',
      mediaUrl: mediaUrl || '',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    const populated = await Status.findById(newStatus._id).populate(
      'userId',
      'displayName username avatar'
    );

    return res.status(201).json({
      success: true,
      message: 'Status created successfully',
      data: { status: populated }
    });
  } catch (error) {
    next(error);
  }
};

const getStatuses = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const blockedList = req.user.blockedUsers || [];

    const now = new Date();

    // Find all unexpired statuses of users not blocked
    const statuses = await Status.find({
      userId: { $nin: blockedList },
      expiresAt: { $gt: now }
    })
      .populate('userId', 'displayName username avatar')
      .populate('viewers.user', 'displayName username avatar')
      .sort({ createdAt: -1 });

    // Group statuses by user
    const grouped = {};
    const myStatuses = [];

    statuses.forEach((status) => {
      const statusUserId = status.userId._id.toString();
      if (statusUserId === userId.toString()) {
        myStatuses.push(status);
      } else {
        if (!grouped[statusUserId]) {
          grouped[statusUserId] = {
            user: status.userId,
            statuses: []
          };
        }
        grouped[statusUserId].statuses.push(status);
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        myStatuses,
        contactStatuses: Object.values(grouped)
      }
    });
  } catch (error) {
    next(error);
  }
};

const viewStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid status ID' });
    }

    const status = await Status.findById(id);
    if (!status) {
      return res.status(404).json({ success: false, message: 'Status not found or expired' });
    }

    // Check if already viewed
    const alreadyViewed = status.viewers.some(
      (v) => v.user.toString() === userId.toString()
    );

    if (!alreadyViewed && status.userId.toString() !== userId.toString()) {
      status.viewers.push({
        user: userId,
        viewedAt: new Date()
      });
      await status.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Status view recorded'
    });
  } catch (error) {
    next(error);
  }
};

const deleteStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid status ID' });
    }

    const status = await Status.findOne({ _id: id, userId });
    if (!status) {
      return res.status(404).json({ success: false, message: 'Status not found or unauthorized' });
    }

    await Status.deleteOne({ _id: id });

    return res.status(200).json({
      success: true,
      message: 'Status deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createStatus,
  getStatuses,
  viewStatus,
  deleteStatus
};
