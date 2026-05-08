const { query, queryOne, pool } = require('../config/db');

// GET /api/returns
exports.getReturns = async (req, res) => {
    try {
        const { org_id, status, overdue } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        let queryStr = `
            SELECT r.*, b.booking_number, b.return_date, b.total_amount,
                   c.name as customer_name, c.phone as customer_phone,
                   d.id as delivery_id, d.delivered_at,
                   (SELECT COUNT(*) FROM booking_items WHERE booking_id = b.id) as item_count
            FROM returns r
            JOIN bookings b ON r.booking_id = b.id
            JOIN customers c ON b.customer_id = c.id
            LEFT JOIN deliveries d ON r.delivery_id = d.id
            WHERE b.organization_id = ?
        `;
        const values = [org_id];

        if (status) {
            queryStr += ' AND r.status = ?';
            values.push(status);
        }

        if (overdue === 'true') {
            queryStr += " AND DATE(b.return_date) < CURDATE() AND r.status != 'Returned'";
        }

        queryStr += ' ORDER BY b.return_date ASC';

        const returns = await query(queryStr, values);
        res.json({ data: returns });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/returns/:id
exports.getReturnById = async (req, res) => {
    try {
        const { id } = req.params;

        const returnRecord = await queryOne(
            `SELECT r.*, b.booking_number, b.customer_id, b.return_date, b.total_amount,
                    c.name as customer_name, c.phone as customer_phone,
                    u.name as returned_by_name
             FROM returns r
             JOIN bookings b ON r.booking_id = b.id
             JOIN customers c ON b.customer_id = c.id
             LEFT JOIN users u ON r.returned_by = u.id
             WHERE r.id = ?`,
            [id]
        );

        if (!returnRecord) return res.status(404).json({ error: 'Return not found' });

        const items = await query(
            `SELECT bi.*, ii.name, ii.sku, ii.status as item_status,
                    dil.damage_description, dil.severity, dil.repair_status
             FROM booking_items bi
             JOIN inventory_items ii ON bi.inventory_item_id = ii.id
             LEFT JOIN damaged_inventory_log dil 
                   ON ii.id = dil.inventory_item_id AND dil.booking_id = ?
             WHERE bi.booking_id = ?`,
            [returnRecord.booking_id, returnRecord.booking_id]
        );

        res.json({ data: { ...returnRecord, items } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/returns  (process a new return)
exports.processReturn = async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const { booking_id, delivery_id, item_condition, damage_notes, returned_by } = req.body;
        if (!booking_id) return res.status(400).json({ error: 'Booking ID is required' });

        // Insert return record
        const [result] = await connection.execute(
            `INSERT INTO returns 
             (booking_id, delivery_id, status, item_condition, damage_notes, returned_by, returned_at, barcode_scanned_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
                booking_id,
                delivery_id || null,
                item_condition === 'Good' ? 'Returned' : 'Returned Damaged',
                item_condition,
                damage_notes || null,
                returned_by || null
            ]
        );
        const returnId = result.insertId;

        // Fetch booking items
        const [bookingItems] = await connection.execute(
            'SELECT inventory_item_id, quantity FROM booking_items WHERE booking_id = ?',
            [booking_id]
        );

        if (item_condition !== 'Good') {
            // Log damage and mark items Damaged
            for (const item of bookingItems) {
                await connection.execute(
                    `INSERT INTO damaged_inventory_log 
                     (inventory_item_id, booking_id, return_id, damage_description, severity, reported_by, repair_status)
                     VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
                    [
                        item.inventory_item_id,
                        booking_id,
                        returnId,
                        damage_notes || null,
                        item_condition === 'Major Damage' ? 'Major' : 'Minor',
                        returned_by || null
                    ]
                );

                await connection.execute(
                    `UPDATE inventory_items 
                     SET status = 'Damaged',
                         quantity_delivered = GREATEST(quantity_delivered - ?, 0),
                         quantity_damaged = quantity_damaged + ?
                     WHERE id = ?`,
                    [item.quantity, item.quantity, item.inventory_item_id]
                );
            }
        } else {
            // Restore items to Available
            for (const item of bookingItems) {
                await connection.execute(
                    `UPDATE inventory_items 
                     SET status = 'Available',
                         quantity_available = quantity_available + ?,
                         quantity_delivered = GREATEST(quantity_delivered - ?, 0)
                     WHERE id = ?`,
                    [item.quantity, item.quantity, item.inventory_item_id]
                );
            }
        }

        // Update booking status
        await connection.execute(
            'UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [item_condition === 'Good' ? 'Returned' : 'Returned Damaged', booking_id]
        );

        await connection.commit();
        const returnRecord = await queryOne('SELECT * FROM returns WHERE id = ?', [returnId]);
        res.status(201).json({ data: returnRecord });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// PATCH /api/returns/:id
exports.updateReturn = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, damage_notes } = req.body;

        const updates = [];
        const values = [];

        if (status !== undefined) { updates.push('status = ?'); values.push(status); }
        if (damage_notes !== undefined) { updates.push('damage_notes = ?'); values.push(damage_notes); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const result = await query(
            `UPDATE returns SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Return not found' });

        const updated = await queryOne('SELECT * FROM returns WHERE id = ?', [id]);
        res.json({ data: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
