const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');

// ── Sub-routes (before /:id) ─────────────────────────────────────────────────

// POST /api/bookings/availability
router.post('/availability', bookingController.checkAvailability);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get('/',       bookingController.getBookings);
router.post('/',      bookingController.createBooking);
router.get('/:id',    bookingController.getBookingDetails);
router.patch('/:id',  bookingController.updateBooking);
router.delete('/:id', bookingController.cancelBooking);

// GET /api/bookings/:id/ticket
router.get('/:id/ticket', bookingController.getBookingTicket);

module.exports = router;
