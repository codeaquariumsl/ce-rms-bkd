const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');

router.get('/', customerController.getCustomers);
router.post('/', customerController.createCustomer);

module.exports = router;
