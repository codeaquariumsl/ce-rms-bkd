const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory.controller');

// ── Search / sub-routes (MUST come before /:id) ──────────────────────────────

// GET /api/inventory/search?barcode=&sku=&org_id=
router.get('/search', inventoryController.searchInventory);

// GET /api/inventory/damaged?org_id=
// POST /api/inventory/damaged  (manually log damage)
router.get('/damaged',  inventoryController.getDamagedInventory);
router.post('/damaged', inventoryController.logDamage);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get('/',      inventoryController.getInventory);
router.post('/',     inventoryController.createInventoryItem);
router.get('/:id',   inventoryController.getInventoryItem);
router.patch('/:id', inventoryController.updateInventoryItem);
router.delete('/:id', inventoryController.deleteInventoryItem);

module.exports = router;
