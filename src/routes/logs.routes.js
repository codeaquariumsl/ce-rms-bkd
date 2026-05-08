/**
 * src/routes/logs.routes.js
 */

const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logs.controller');

router.get('/:orgId', logsController.getActivityLogs);

module.exports = router;
