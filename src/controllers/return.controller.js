const { query, queryOne, pool } = require('../config/db');


// GET /api/returns
exports.getReturns = async (req, res) => {
    try {
        const { org_id } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        // Query active issues in 'Issued' status (Pending & Overdue returns)
        let queryStr = `
            SELECT 
                i.id,
                i.issue_number as booking_number,
                i.issue_date,
                i.return_date as returnDate,
                i.total_amount,
                i.payment_status,
                i.notes,
                'Pending' as status,
                'Good' as \`condition\`,
                'N/A' as repairStatus,
                c.name as customer_name,
                c.phone as customer_phone,
                GROUP_CONCAT(CONCAT(inv.name, ' (x', ii.quantity, ')') SEPARATOR ', ') as itemName
            FROM issues i
            JOIN customers c ON i.customer_id = c.id
            LEFT JOIN issue_items ii ON i.id = ii.issue_id
            LEFT JOIN inventory_items inv ON ii.inventory_item_id = inv.id
            WHERE i.organization_id = ? AND i.status = 'Issued'
            GROUP BY i.id
            ORDER BY i.return_date ASC
        `;
        const values = [org_id];

        const returns = await query(queryStr, values);
        
        // Map backend customer_name to customerName so the frontend renders it correctly
        const mappedReturns = returns.map(item => ({
            ...item,
            customerName: item.customer_name,
            customerPhone: item.customer_phone,
            id: String(item.id)
        }));

        res.json({ data: mappedReturns });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/returns/:id
exports.getReturnById = async (req, res) => {
    try {
        const { id } = req.params;

        const issue = await queryOne(
            `SELECT i.id, i.issue_number as booking_number, i.customer_id, i.return_date, i.total_amount, i.payment_status, i.notes, i.issue_date,
                    c.name as customer_name, c.phone as customer_phone
             FROM issues i
             JOIN customers c ON i.customer_id = c.id
             WHERE i.id = ?`,
            [id]
        );

        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        const items = await query(
            `SELECT ii.*, inv.name, inv.sku, inv.status as item_status
             FROM issue_items ii
             JOIN inventory_items inv ON ii.inventory_item_id = inv.id
             WHERE ii.issue_id = ?`,
            [id]
        );

        res.json({ 
            data: { 
                ...issue, 
                items, 
                bookingId: issue.booking_number, 
                customerName: issue.customer_name, 
                itemName: items.map(it => `${it.name} (x${it.quantity})`).join(', '), 
                returnDate: issue.return_date 
            } 
        });
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
