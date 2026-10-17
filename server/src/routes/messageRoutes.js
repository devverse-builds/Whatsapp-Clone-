const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.patch('/:id', messageController.editMessage);
router.delete('/:id', messageController.deleteMessage);

module.exports = router;
