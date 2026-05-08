const { query, queryOne, pool } = require('../config/db');

// GET /api/deliveries
exports.getDeliveries = async (req, res) => {
    try {
        const { org_id, status, date } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        let queryStr = `
            SELECT d.*, b.booking_number, b.customer_id, b.delivery_date, b.total_amount,
                   c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
                   (SELECT COUNT(*) FROM booking_items WHERE booking_id = b.id) as item_count
            FROM deliveries d
            JOIN bookings b ON d.booking_id = b.id
            JOIN customers c ON b.customer_id = c.id
            WHERE b.organization_id = ?
        `;
        const values = [org_id];

        if (status) {
            queryStr += ' AND d.status = ?';
            values.push(status);
        }

        if (date === 'today') {
            queryStr += ' AND DATE(b.delivery_date) = CURDATE()';
        } else if (date === 'tomorrow') {
            queryStr += ' AND DATE(b.delivery_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)';
        } else if (date === 'upcoming') {
            queryStr += ' AND DATE(b.delivery_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)';
        }

        queryStr += ' ORDER BY b.delivery_date ASC';

        const deliveries = await query(queryStr, values);
        res.json({ data: deliveries });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/deliveries/:id
exports.getDeliveryById = async (req, res) => {
    try {
        const { id } = req.params;

        const delivery = await queryOne(
            `SELECT d.*, b.booking_number, b.customer_id, b.delivery_date, b.total_amount,
                    c.name as customer_name, c.phone as customer_phone, c.address,
                    u1.name as prepared_by_name, u2.name as delivered_by_name
             FROM deliveries d
             JOIN bookings b ON d.booking_id = b.id
             JOIN customers c ON b.customer_id = c.id
             LEFT JOIN users u1 ON d.prepared_by = u1.id
             LEFT JOIN users u2 ON d.delivered_by = u2.id
             WHERE d.id = ?`,
            [id]
        );

        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

        const items = await query(
            `SELECT bi.*, ii.name, ii.barcode, ii.sku
             FROM booking_items bi
             JOIN inventory_items ii ON bi.inventory_item_id = ii.id
             WHERE bi.booking_id = ?`,
            [delivery.booking_id]
        );

        res.json({ data: { ...delivery, items } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PATCH /api/deliveries/:id
exports.updateDeliveryStatus = async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const { id } = req.params;
        const { status, prepared_by, delivered_by, notes } = req.body;

        const updates = [];
        const values = [];

        if (status) {
            updates.push('status = ?');
            values.push(status);

            if (status === 'Prepared' && prepared_by) {
                updates.push('prepared_by = ?', 'prepared_at = CURRENT_TIMESTAMP');
                values.push(prepared_by);
            }

            if (status === 'Delivered' && delivered_by) {
                updates.push('delivered_by = ?', 'delivered_at = CURRENT_TIMESTAMP', 'barcode_scanned_at = CURRENT_TIMESTAMP');
                values.push(delivered_by);
            }
        }

        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const [result] = await connection.execute(
            `UPDATE deliveries SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Delivery not found' });
        }

        // On Delivered: update booking + move qty reserved → delivered
        if (status === 'Delivered') {
            const [deliveryRows] = await connection.execute(
                'SELECT booking_id FROM deliveries WHERE id = ?', [id]
            );
            const bookingId = deliveryRows[0].booking_id;

            await connection.execute(
                "UPDATE bookings SET status = 'Delivered', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [bookingId]
            );

            const [items] = await connection.execute(
                'SELECT inventory_item_id, quantity FROM booking_items WHERE booking_id = ?',
                [bookingId]
            );

            for (const item of items) {
                await connection.execute(
                    `UPDATE inventory_items 
                     SET quantity_reserved = GREATEST(quantity_reserved - ?, 0),
                         quantity_delivered = quantity_delivered + ?,
                         status = 'Delivered'
                     WHERE id = ?`,
                    [item.quantity, item.quantity, item.inventory_item_id]
                );
            }
        }

        await connection.commit();
        const updated = await queryOne('SELECT * FROM deliveries WHERE id = ?', [id]);
        res.json({ data: updated });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};
