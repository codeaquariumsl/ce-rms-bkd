const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');

router.get('/', bookingController.getBookings);
router.post('/', bookingController.createBooking);
router.get('/:id', bookingController.getBookingDetails);
router.patch('/:id', bookingController.updateBooking);
router.delete('/:id', bookingController.cancelBooking);

module.exports = router;
