const mongoose = require('mongoose');
const { MESSAGE_TYPES } = require('../config/constants');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const validateCreateConversation = (req, res, next) => {
  const { recipientId } = req.body;
  if (!recipientId || !isValidObjectId(recipientId)) {
    return res.status(400).json({ success: false, message: 'Valid recipientId is required' });
  }
  if (recipientId === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: 'Cannot start conversation with yourself' });
  }
  next();
};

const validateSendMessage = (req, res, next) => {
  const { content, type, clientMessageId } = req.body;
  const validTypes = Object.values(MESSAGE_TYPES);

  if (type && !validTypes.includes(type)) {
    return res.status(400).json({ success: false, message: `Invalid message type: ${type}` });
  }

  const msgType = type || MESSAGE_TYPES.TEXT;
  if (msgType === MESSAGE_TYPES.TEXT && (!content || typeof content !== 'string' || content.trim().length === 0)) {
    return res.status(400).json({ success: false, message: 'Text message content cannot be empty' });
  }

  if (!clientMessageId || typeof clientMessageId !== 'string') {
    return res.status(400).json({ success: false, message: 'clientMessageId is required for idempotency' });
  }

  next();
};

module.exports = {
  isValidObjectId,
  validateCreateConversation,
  validateSendMessage
};
