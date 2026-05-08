const express = require('express');
const router = express.Router();
const serialController = require('../controllers/serial.controller');

router.get('/item/:itemId', serialController.getSerialsByItem);
router.post('/item/:itemId', serialController.saveItemSerials);

module.exports = router;
