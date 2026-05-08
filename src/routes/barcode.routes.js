const express = require('express');
const router = express.Router();
const barcodeController = require('../controllers/barcode.controller');

// POST /api/barcode/scan
router.post('/scan',   barcodeController.scanBarcode);
// GET  /api/barcode/search?barcode=&sku=&org_id=
router.get('/search',  barcodeController.searchInventory);

module.exports = router;
