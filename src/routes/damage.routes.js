const express = require('express');
const router = express.Router();
const damageController = require('../controllers/damage.controller');

router.get('/', damageController.getDamagedItems);
router.patch('/:id', damageController.updateRepairStatus);

module.exports = router;
