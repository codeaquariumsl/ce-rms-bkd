const express = require('express');
const router = express.Router();
const returnController = require('../controllers/return.controller');

router.get('/',      returnController.getReturns);
router.post('/',     returnController.processReturn);
router.get('/:id',   returnController.getReturnById);
router.patch('/:id', returnController.updateReturn);

module.exports = router;
