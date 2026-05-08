const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');

router.get('/', notificationController.getNotifications);
router.post('/', notificationController.createNotification);
router.patch('/:id/send', notificationController.markAsSent);

module.exports = router;
