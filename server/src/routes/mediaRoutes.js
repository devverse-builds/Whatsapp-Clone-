const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const { authMiddleware } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiter');

router.use(authMiddleware);

router.post('/upload', uploadLimiter, upload.single('file'), mediaController.uploadMedia);

module.exports = router;
