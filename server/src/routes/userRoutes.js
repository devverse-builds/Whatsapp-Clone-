const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(authMiddleware);

router.get('/search', apiLimiter, userController.searchUsers);
router.get('/me/blocked', userController.getBlockedUsers);
router.patch('/me', userController.updateProfile);
router.get('/:userId', userController.getUserById);
router.post('/:userId/block', userController.blockUser);
router.delete('/:userId/block', userController.unblockUser);

module.exports = router;
