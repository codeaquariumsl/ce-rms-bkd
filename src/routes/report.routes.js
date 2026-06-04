const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');

router.get('/inventory', reportController.getInventoryReport);
router.get('/delivery-schedule', reportController.getDeliveryScheduleReport);
router.get('/pending-returns', reportController.getPendingReturnsReport);
router.get('/rental-history', reportController.getRentalHistoryReport);
router.get('/customer-issues', reportController.getCustomerIssuesReport);
router.get('/daily-issues', reportController.getDailyIssueSummary);
router.get('/daily-returns', reportController.getDailyReturnSummary);
router.get('/daily-payments', reportController.getDailyPaymentSummary);
router.get('/monthly-collections', reportController.getMonthlyCollectionReport);
router.get('/current-stock', reportController.getCurrentStockReport);

module.exports = router;
