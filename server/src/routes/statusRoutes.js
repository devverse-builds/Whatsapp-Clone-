const express = require('express');
const router = express.Router();
const statusController = require('../controllers/statusController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/', statusController.createStatus);
router.get('/', statusController.getStatuses);
router.post('/:id/view', statusController.viewStatus);
router.delete('/:id', statusController.deleteStatus);

module.exports = router;
