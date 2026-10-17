const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const messageController = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validateCreateConversation, validateSendMessage } = require('../validators/chatValidators');

router.use(authMiddleware);

// Conversations
router.get('/', conversationController.getConversations);
router.post('/', validateCreateConversation, conversationController.createConversation);
router.get('/:id', conversationController.getConversationById);
router.patch('/:id', conversationController.updateConversation);
router.delete('/:id', conversationController.deleteConversation);

// Messages inside conversation
router.get('/:id/messages', messageController.getMessages);
router.post('/:id/messages', validateSendMessage, messageController.sendMessage);
router.post('/:id/read', messageController.markAsRead);

module.exports = router;
