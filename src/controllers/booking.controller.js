const { query, queryOne, pool } = require('../config/db');

/**
 * Helper to get array of dates between start and end
 */
function getDaysArray(start, end) {
    const arr = [];
    const dt = new Date(start);
    const endDt = new Date(end);
    while (dt <= endDt) {
        arr.push(new Date(dt).toISOString().split('T')[0]);
        dt.setDate(dt.getDate() + 1);
    }
    return arr;
}


// ─── GET /api/bookings ────────────────────────────────────────────────────────
exports.getBookings = async (req, res) => {
    try {
        const { org_id, status } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        let queryStr = `
            SELECT b.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
            FROM bookings b
            JOIN customers c ON b.customer_id = c.id
            WHERE b.organization_id = ?
        `;
        const values = [org_id];

        if (status) { queryStr += ' AND b.status = ?'; values.push(status); }
        queryStr += ' ORDER BY b.delivery_date ASC';

        const bookings = await query(queryStr, values);
        res.json({ data: bookings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── GET /api/bookings/:id ────────────────────────────────────────────────────
exports.getBookingDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await queryOne(
            `SELECT b.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
             FROM bookings b
             JOIN customers c ON b.customer_id = c.id
             WHERE b.id = ?`,
            [id]
        );
        if (!booking) return res.status(404).json({ error: 'Booking not found' });

        const items = await query(
            `SELECT bi.*, ii.name, ii.sku, ii.barcode
             FROM booking_items bi
             JOIN inventory_items ii ON bi.inventory_item_id = ii.id
             WHERE bi.booking_id = ?`,
            [id]
        );

        res.json({ data: { ...booking, items } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── GET /api/bookings/:id/ticket ─────────────────────────────────────────────
exports.getBookingTicket = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await queryOne(
            `SELECT b.*, c.name as customer_name, c.phone as customer_phone,
                    c.email as customer_email, c.address, c.city
             FROM bookings b
             JOIN customers c ON b.customer_id = c.id
             WHERE b.id = ?`,
            [id]
        );
        if (!booking) return res.status(404).json({ error: 'Booking not found' });

        const items = await query(
            `SELECT bi.*, ii.name, ii.sku, ii.barcode
             FROM booking_items bi
             JOIN inventory_items ii ON bi.inventory_item_id = ii.id
             WHERE bi.booking_id = ?`,
            [id]
        );

        const qrData = {
            bookingNumber: booking.booking_number,
            bookingId: booking.id,
            customerId: booking.customer_id,
            deliveryDate: booking.delivery_date,
            returnDate: booking.return_date,
            totalAmount: booking.total_amount,
        };

        const ticket = {
            booking: {
                id: booking.id,
                number: booking.booking_number,
                status: booking.status,
                created_at: booking.created_at,
                notes: booking.notes,
            },
            customer: {
                name: booking.customer_name,
                phone: booking.customer_phone,
                email: booking.customer_email,
                address: booking.address,
                city: booking.city,
            },
            items,
            dates: {
                delivery_date: booking.delivery_date,
                return_date: booking.return_date,
            },
            total_amount: booking.total_amount,
            qr_code_data: JSON.stringify(qrData),
        };

        res.json({ data: ticket });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── POST /api/bookings/availability ─────────────────────────────────────────
exports.checkAvailability = async (req, res) => {
    try {
        const { org_id, items, delivery_date, return_date } = req.body;
        if (!org_id || !items || !delivery_date || !return_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const startDate = new Date(delivery_date);
        const endDate = new Date(return_date);
        const days = getDaysArray(startDate, endDate);

        const availability = await Promise.all(
            items.map(async (item) => {
                const inventoryItem = await queryOne(
                    `SELECT id, name, quantity_total
                     FROM inventory_items
                     WHERE id = ? AND organization_id = ?`,
                    [item.inventory_item_id, org_id]
                );

                if (!inventoryItem) {
                    return { 
                        inventory_item_id: item.inventory_item_id, 
                        available: false, 
                        error: 'Item not found' 
                    };
                }

                // Find all active bookings and issues that overlap with this date range
                const overlappingBookings = await query(
                    `SELECT b.delivery_date, b.return_date, bi.quantity
                     FROM booking_items bi
                     JOIN bookings b ON bi.booking_id = b.id
                     WHERE bi.inventory_item_id = ?
                       AND b.status IN ('Reserved', 'Ready for Pickup', 'Delivered')
                       AND b.delivery_date <= ?
                       AND b.return_date >= ?`,
                    [item.inventory_item_id, return_date, delivery_date]
                );

                const overlappingIssues = await query(
                    `SELECT i.issue_date, i.return_date, ii.quantity
                     FROM issue_items ii
                     JOIN issues i ON ii.issue_id = i.id
                     WHERE ii.inventory_item_id = ?
                       AND i.status = 'Issued'
                       AND i.issue_date <= ?
                       AND i.return_date >= ?`,
                    [item.inventory_item_id, return_date, delivery_date]
                );

                // Calculate max in-use for each day in the requested range
                let maxInUse = 0;
                for (const day of days) {
                    let dayInUse = 0;
                    overlappingBookings.forEach(b => {
                        const bStart = new Date(b.delivery_date).toISOString().split('T')[0];
                        const bEnd = new Date(b.return_date).toISOString().split('T')[0];
                        if (bStart <= day && bEnd >= day) dayInUse += b.quantity;
                    });
                    overlappingIssues.forEach(i => {
                        const iStart = new Date(i.issue_date).toISOString().split('T')[0];
                        const iEnd = new Date(i.return_date).toISOString().split('T')[0];
                        if (iStart <= day && iEnd >= day) dayInUse += i.quantity;
                    });
                    if (dayInUse > maxInUse) maxInUse = dayInUse;
                }

                const availableQty = inventoryItem.quantity_total - maxInUse;

                return {
                    inventory_item_id: item.inventory_item_id,
                    name: inventoryItem.name,
                    requested_quantity: item.quantity,
                    available_quantity: availableQty,
                    available: availableQty >= item.quantity,
                    total_quantity: inventoryItem.quantity_total,
                    peak_reserved: maxInUse
                };
            })
        );

        res.json({
            available: availability.every(a => a.available),
            items: availability,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── POST /api/bookings ───────────────────────────────────────────────────────
exports.createBooking = async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const { org_id, customer_id, items, delivery_date, return_date, created_by, notes } = req.body;

        if (!org_id || !customer_id || !items?.length || !delivery_date || !return_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const deliveryDate = new Date(delivery_date);
        const returnDate   = new Date(return_date);

        if (returnDate <= deliveryDate) {
            return res.status(400).json({ error: 'Return date must be after delivery date' });
        }

        // Availability check (Date-aware)
        const days = getDaysArray(deliveryDate, returnDate);
        for (const item of items) {
            const inventoryItem = await queryOne(
                'SELECT quantity_total FROM inventory_items WHERE id = ?',
                [item.inventory_item_id]
            );
            
            const overlappingBookings = await query(
                `SELECT b.delivery_date, b.return_date, bi.quantity
                 FROM booking_items bi
                 JOIN bookings b ON bi.booking_id = b.id
                 WHERE bi.inventory_item_id = ?
                   AND b.status IN ('Reserved', 'Ready for Pickup', 'Delivered')
                   AND b.delivery_date <= ?
                   AND b.return_date >= ?`,
                [item.inventory_item_id, return_date, delivery_date]
            );

            const overlappingIssues = await query(
                `SELECT i.issue_date, i.return_date, ii.quantity
                 FROM issue_items ii
                 JOIN issues i ON ii.issue_id = i.id
                 WHERE ii.inventory_item_id = ?
                   AND i.status = 'Issued'
                   AND i.issue_date <= ?
                   AND i.return_date >= ?`,
                [item.inventory_item_id, return_date, delivery_date]
            );

            let maxInUse = 0;
            for (const day of days) {
                let dayInUse = 0;
                overlappingBookings.forEach(b => {
                    const bStart = new Date(b.delivery_date).toISOString().split('T')[0];
                    const bEnd = new Date(b.return_date).toISOString().split('T')[0];
                    if (bStart <= day && bEnd >= day) dayInUse += b.quantity;
                });
                overlappingIssues.forEach(i => {
                    const iStart = new Date(i.issue_date).toISOString().split('T')[0];
                    const iEnd = new Date(i.return_date).toISOString().split('T')[0];
                    if (iStart <= day && iEnd >= day) dayInUse += i.quantity;
                });
                if (dayInUse > maxInUse) maxInUse = dayInUse;
            }

            if (!inventoryItem || (inventoryItem.quantity_total - maxInUse < item.quantity)) {
                await connection.rollback();
                return res.status(409).json({
                    error: `Item ${item.inventory_item_id} does not have enough availability for this period`
                });
            }
        }

        // Generate booking number
        const bookingNumber = `BK-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const rentalDays = Math.max(
            Math.ceil((returnDate - deliveryDate) / (1000 * 60 * 60 * 24)),
            1
        );

        // Create booking
        const [bookingResult] = await connection.execute(
            `INSERT INTO bookings
             (organization_id, customer_id, booking_number, status, delivery_date, return_date, created_by, notes)
             VALUES (?, ?, ?, 'Reserved', ?, ?, ?, ?)`,
            [org_id, customer_id, bookingNumber, delivery_date, return_date, created_by || null, notes || null]
        );
        const bookingId = bookingResult.insertId;

        let totalAmount = 0;

        for (const item of items) {
            const [detail] = await connection.execute(
                'SELECT rental_rate_per_day FROM inventory_items WHERE id = ?',
                [item.inventory_item_id]
            );
            if (!detail.length) throw new Error(`Item ${item.inventory_item_id} not found`);

            const subtotal = detail[0].rental_rate_per_day * item.quantity * rentalDays;
            totalAmount += subtotal;

            await connection.execute(
                `INSERT INTO booking_items (booking_id, inventory_item_id, quantity, rental_rate_per_day, subtotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [bookingId, item.inventory_item_id, item.quantity, detail[0].rental_rate_per_day, subtotal]
            );

            await connection.execute(
                `UPDATE inventory_items
                 SET quantity_reserved  = quantity_reserved + ?,
                     quantity_available = GREATEST(quantity_available - ?, 0),
                     status = 'Reserved'
                 WHERE id = ?`,
                [item.quantity, item.quantity, item.inventory_item_id]
            );
        }

        // Update total
        await connection.execute('UPDATE bookings SET total_amount = ? WHERE id = ?', [totalAmount, bookingId]);

        // Create delivery record
        await connection.execute(
            "INSERT INTO deliveries (booking_id, status) VALUES (?, 'Pending')",
            [bookingId]
        );

        await connection.commit();

        const newBooking = await queryOne('SELECT * FROM bookings WHERE id = ?', [bookingId]);
        res.status(201).json({ data: { ...newBooking, item_count: items.length } });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// ─── PATCH /api/bookings/:id ──────────────────────────────────────────────────
exports.updateBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        const updates = [];
        const values  = [];

        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (notes  !== undefined) { updates.push('notes = ?');  values.push(notes); }
        if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

        values.push(id);
        const result = await query(
            `UPDATE bookings SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Booking not found' });

        const updated = await queryOne('SELECT * FROM bookings WHERE id = ?', [id]);
        res.json({ data: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ─── DELETE /api/bookings/:id ─────────────────────────────────────────────────
exports.cancelBooking = async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const { id } = req.params;

        // Revert inventory for Reserved items
        const [bookingItems] = await connection.execute(
            'SELECT inventory_item_id, quantity FROM booking_items WHERE booking_id = ?',
            [id]
        );

        for (const item of bookingItems) {
            await connection.execute(
                `UPDATE inventory_items
                 SET quantity_reserved  = GREATEST(quantity_reserved - ?, 0),
                     quantity_available = quantity_available + ?,
                     status = CASE WHEN quantity_reserved - ? <= 0 THEN 'Available' ELSE status END
                 WHERE id = ?`,
                [item.quantity, item.quantity, item.quantity, item.inventory_item_id]
            );
        }

        await connection.execute(
            "UPDATE bookings SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [id]
        );
        await connection.execute(
            "UPDATE deliveries SET status = 'Cancelled' WHERE booking_id = ?",
            [id]
        );

        await connection.commit();
        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};
