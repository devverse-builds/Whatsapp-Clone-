const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validateCreateGroup } = require('../validators/groupValidators');

router.use(authMiddleware);

router.post('/', validateCreateGroup, groupController.createGroup);
router.patch('/:id', groupController.updateGroup);
router.post('/:id/members', groupController.addMembers);
router.delete('/:id/members/:userId', groupController.removeMember);
router.post('/:id/leave', groupController.leaveGroup);

module.exports = router;
