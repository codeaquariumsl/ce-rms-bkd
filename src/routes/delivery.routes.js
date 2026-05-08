const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/delivery.controller');

router.get('/',     deliveryController.getDeliveries);
router.get('/:id',  deliveryController.getDeliveryById);
router.patch('/:id', deliveryController.updateDeliveryStatus);

module.exports = router;
