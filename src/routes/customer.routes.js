const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');

router.get('/', customerController.getCustomers);
router.post('/', customerController.createCustomer);
router.patch('/:id', customerController.updateCustomer);

module.exports = router;
