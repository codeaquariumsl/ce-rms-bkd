const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const logger = require('./middleware/logger.middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(morgan('dev'));
// app.use(logger);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// ─── Routes (v1) ───────────────────────────────────────────────────────────────
const v1Router = express.Router();

v1Router.use('/auth', require('./routes/auth.routes'));
v1Router.use('/inventory', require('./routes/inventory.routes'));
v1Router.use('/bookings', require('./routes/bookings.routes'));
v1Router.use('/customers', require('./routes/customer.routes'));
v1Router.use('/deliveries', require('./routes/delivery.routes'));
v1Router.use('/returns', require('./routes/return.routes'));
v1Router.use('/dashboard', require('./routes/dashboard.routes'));
v1Router.use('/categories', require('./routes/category.routes'));
v1Router.use('/damaged-items', require('./routes/damage.routes'));
v1Router.use('/notifications', require('./routes/notification.routes'));
v1Router.use('/report', require('./routes/report.routes'));
v1Router.use('/reports', require('./routes/report.routes'));
v1Router.use('/barcode', require('./routes/barcode.routes'));
v1Router.use('/logs', require('./routes/logs.routes'));
v1Router.use('/serials', require('./routes/serial.routes'));
v1Router.use('/issues', require('./routes/issue.routes'));


// Mount v1 router under both /api and /api/v1 for maximum compatibility
app.use('/api/v1', v1Router);
app.use('/api', v1Router);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 RMS Backend running on http://localhost:${PORT}`);
});
