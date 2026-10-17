const { isValidObjectId } = require('./chatValidators');

const validateCreateGroup = (req, res, next) => {
  const { name, members, description } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Group name is required' });
  }

  if (name.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Group name cannot exceed 100 characters' });
  }

  if (description && description.length > 500) {
    return res.status(400).json({ success: false, message: 'Group description cannot exceed 500 characters' });
  }

  if (!members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one group member must be selected' });
  }

  for (const memberId of members) {
    if (!isValidObjectId(memberId)) {
      return res.status(400).json({ success: false, message: `Invalid member ID: ${memberId}` });
    }
  }

  req.body.name = name.trim();
  next();
};

module.exports = {
  validateCreateGroup
};
