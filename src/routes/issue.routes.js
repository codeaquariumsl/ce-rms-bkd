const express = require('express');
const router = express.Router();
const issueController = require('../controllers/issue.controller');

router.get('/', issueController.getIssues);
router.get('/:id', issueController.getIssueDetails);
router.post('/', issueController.createIssue);
router.patch('/:id/status', issueController.updateIssueStatus);
router.patch('/:id/payment', issueController.updatePaymentStatus);

module.exports = router;
