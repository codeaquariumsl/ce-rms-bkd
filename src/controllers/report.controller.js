const { query } = require('../config/db');

// GET /api/reports/inventory
exports.getInventoryReport = async (req, res) => {
    try {
        const { org_id } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        const report = await query(
            `SELECT 
                name, sku, category, status,
                quantity_total, quantity_available, quantity_reserved, quantity_delivered, quantity_damaged,
                rental_rate_per_day,
                ROUND(100.0 * quantity_available / NULLIF(quantity_total, 0), 2) as availability_percentage
             FROM inventory_items 
             WHERE organization_id = ?
             ORDER BY name ASC`,
            [org_id]
        );

        const summary = {
            total_items: report.length,
            total_available: report.reduce((s, i) => s + (i.quantity_available || 0), 0),
            total_reserved: report.reduce((s, i) => s + (i.quantity_reserved || 0), 0),
            total_delivered: report.reduce((s, i) => s + (i.quantity_delivered || 0), 0),
            total_damaged: report.reduce((s, i) => s + (i.quantity_damaged || 0), 0),
            average_availability: report.length > 0
                ? parseFloat((report.reduce((s, i) => s + (parseFloat(i.availability_percentage) || 0), 0) / report.length).toFixed(2))
                : 0,
        };

        res.json({ data: report, summary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/reports/delivery-schedule
exports.getDeliveryScheduleReport = async (req, res) => {
    try {
        const { org_id, days = '30' } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        const numDays = parseInt(days) || 30;

        const report = await query(
            `SELECT 
                b.booking_number, c.name as customer_name, c.phone, c.address,
                GROUP_CONCAT(ii.name SEPARATOR ', ') as items,
                b.delivery_date, b.return_date, b.total_amount,
                d.status as delivery_status, d.delivered_at
             FROM bookings b
             JOIN customers c ON b.customer_id = c.id
             JOIN booking_items bi ON b.id = bi.booking_id
             JOIN inventory_items ii ON bi.inventory_item_id = ii.id
             LEFT JOIN deliveries d ON b.id = d.booking_id
             WHERE b.organization_id = ?
             AND DATE(b.delivery_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
             GROUP BY b.id, c.id, d.id
             ORDER BY b.delivery_date ASC`,
            [org_id, numDays]
        );

        const summaryByDate = {};
        report.forEach(r => {
            const date = r.delivery_date instanceof Date
                ? r.delivery_date.toISOString().split('T')[0]
                : String(r.delivery_date).split('T')[0];
            summaryByDate[date] = (summaryByDate[date] || 0) + 1;
        });

        res.json({
            data: report,
            summary: {
                total_scheduled_deliveries: report.length,
                summary_by_date: summaryByDate,
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/reports/pending-returns
exports.getPendingReturnsReport = async (req, res) => {
    try {
        const { org_id } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        const report = await query(
            `SELECT 
                b.booking_number, c.name as customer_name, c.phone,
                ii.name as item_name, bi.quantity,
                b.delivery_date, b.return_date, b.total_amount,
                DATEDIFF(CURDATE(), b.return_date) as days_overdue,
                CASE WHEN DATE(b.return_date) < CURDATE() THEN 'Overdue' ELSE 'On Time' END as status
             FROM bookings b
             JOIN customers c ON b.customer_id = c.id
             JOIN booking_items bi ON b.id = bi.booking_id
             JOIN inventory_items ii ON bi.inventory_item_id = ii.id
             WHERE b.organization_id = ?
             AND b.status = 'Delivered'
             AND NOT EXISTS (
                 SELECT 1 FROM returns r 
                 WHERE r.booking_id = b.id AND r.status IN ('Returned', 'Returned Damaged')
             )
             ORDER BY b.return_date ASC`,
            [org_id]
        );

        const uniqueBookings = new Set(report.map(r => r.booking_number)).size;
        const overdueCount = report.filter(r => r.status === 'Overdue').length;

        // Sum total_amount uniquely per booking
        const bookingAmounts = new Map();
        report.forEach(r => bookingAmounts.set(r.booking_number, parseFloat(r.total_amount || 0)));
        const totalValuePending = [...bookingAmounts.values()].reduce((s, v) => s + v, 0);

        res.json({
            data: report,
            summary: {
                total_pending: uniqueBookings,
                overdue_count: overdueCount,
                total_value_pending: parseFloat(totalValuePending.toFixed(2)),
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/reports/rental-history
exports.getRentalHistoryReport = async (req, res) => {
    try {
        const { org_id, customer_id, from_date, to_date } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        let queryStr = `
            SELECT 
                b.booking_number, b.status as booking_status,
                c.name as customer_name, c.phone,
                GROUP_CONCAT(ii.name SEPARATOR ', ') as items,
                b.delivery_date, b.return_date, b.total_amount,
                b.created_at
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            JOIN booking_items bi ON b.id = bi.booking_id
            JOIN inventory_items ii ON bi.inventory_item_id = ii.id
            WHERE b.organization_id = ?
        `;
        const values = [org_id];

        if (customer_id) {
            queryStr += ' AND b.customer_id = ?';
            values.push(customer_id);
        }
        if (from_date) {
            queryStr += ' AND DATE(b.delivery_date) >= ?';
            values.push(from_date);
        }
        if (to_date) {
            queryStr += ' AND DATE(b.delivery_date) <= ?';
            values.push(to_date);
        }

        queryStr += ' GROUP BY b.id, c.id ORDER BY b.created_at DESC';

        const report = await query(queryStr, values);

        const totalRevenue = report
            .filter(r => ['Returned', 'Returned Damaged'].includes(r.booking_status))
            .reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);

        res.json({
            data: report,
            summary: {
                total_bookings: report.length,
                completed: report.filter(r => ['Returned', 'Returned Damaged'].includes(r.booking_status)).length,
                active: report.filter(r => r.booking_status === 'Delivered').length,
                cancelled: report.filter(r => r.booking_status === 'Cancelled').length,
                total_revenue: parseFloat(totalRevenue.toFixed(2)),
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
