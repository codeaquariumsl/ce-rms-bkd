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

exports.getIssues = async (req, res) => {
    try {
        const { org_id } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        const issues = await query(
            `SELECT i.*, c.name as customer_name, c.phone as customer_phone
             FROM issues i
             JOIN customers c ON i.customer_id = c.id
             WHERE i.organization_id = ?
             ORDER BY i.issue_date DESC`,
            [org_id]
        );
        res.json({ data: issues });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getIssueDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const issue = await queryOne(
            `SELECT i.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email, c.address as customer_address, c.nic as customer_nic
             FROM issues i
             JOIN customers c ON i.customer_id = c.id
             WHERE i.id = ?`,
            [id]
        );
        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        const items = await query(
            `SELECT ii.*, inv.name, inv.sku, inv.barcode,
                (SELECT JSON_ARRAYAGG(sn.serial_code)
                 FROM issue_item_serials iis
                 JOIN serial_numbers sn ON iis.serial_number_id = sn.id
                 WHERE iis.issue_item_id = ii.id) as serial_codes
             FROM issue_items ii
             JOIN inventory_items inv ON ii.inventory_item_id = inv.id
             WHERE ii.issue_id = ?`,
            [id]
        );

        res.json({ data: { ...issue, items } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createIssue = async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const {
            org_id,
            customer_id,
            items,
            issue_date,
            return_date,
            payment_status,
            notes,
            booking_id,
            created_by
        } = req.body;

        if (!org_id || !customer_id || !items?.length || !issue_date || !return_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const issueDateObj = new Date(issue_date);
        const returnDateObj = new Date(return_date);

        // 1. Availability Check (Date-aware)
        const days = getDaysArray(issueDateObj, returnDateObj);
        for (const item of items) {
            const inventoryItem = await queryOne(
                'SELECT quantity_total FROM inventory_items WHERE id = ?',
                [item.inventory_item_id]
            );

            // Check overlapping Bookings
            const overlappingBookings = await query(
                `SELECT b.delivery_date, b.return_date, bi.quantity
                 FROM booking_items bi
                 JOIN bookings b ON bi.booking_id = b.id
                 WHERE bi.inventory_item_id = ?
                   AND b.status IN ('Reserved', 'Ready for Pickup', 'Delivered')
                   AND b.delivery_date <= ?
                   AND b.return_date >= ?`,
                [item.inventory_item_id, return_date, issue_date]
            );

            // Check overlapping Issues
            const overlappingIssues = await query(
                `SELECT i.issue_date, i.return_date, ii.quantity
                 FROM issue_items ii
                 JOIN issues i ON ii.issue_id = i.id
                 WHERE ii.inventory_item_id = ?
                   AND i.status = 'Issued'
                   AND i.issue_date <= ?
                   AND i.return_date >= ?`,
                [item.inventory_item_id, return_date, issue_date]
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

        // 2. Create Issue
        const [lastIssues] = await connection.execute(
            `SELECT issue_number FROM issues 
             WHERE issue_number LIKE 'CE26%' 
             ORDER BY id DESC LIMIT 1`
        );

        let nextNum = 1;
        if (lastIssues && lastIssues.length > 0) {
            const lastIssueNumber = lastIssues[0].issue_number;
            const numPart = lastIssueNumber.replace('CE26', '');
            const parsedNum = parseInt(numPart, 10);
            if (!isNaN(parsedNum)) {
                nextNum = parsedNum + 1;
            }
        }
        const issueNumber = `CE26${String(nextNum).padStart(4, '0')}`;
        const [issueResult] = await connection.execute(
            `INSERT INTO issues
             (organization_id, customer_id, issue_number, booking_id, status, issue_date, return_date, payment_status, notes, created_by)
             VALUES (?, ?, ?, ?, 'Issued', ?, ?, ?, ?, ?)`,
            [org_id, customer_id, issueNumber, booking_id || null, issue_date, return_date, payment_status || 'unpaid', notes || null, created_by || null]
        );
        const issueId = issueResult.insertId;

        let totalAmount = 0;
        const rentalDays = Math.max(Math.ceil((returnDateObj - issueDateObj) / (1000 * 60 * 60 * 24)), 1);

        // 3. Process Items
        for (const item of items) {
            const [detail] = await connection.execute(
                'SELECT rental_rate_per_day FROM inventory_items WHERE id = ?',
                [item.inventory_item_id]
            );
            const price = item.price || detail[0]?.rental_rate_per_day || 0;
            const subtotal = price * item.quantity * rentalDays;
            totalAmount += subtotal;

            const [iiResult] = await connection.execute(
                `INSERT INTO issue_items (issue_id, inventory_item_id, quantity, price, condition_at_issue)
                 VALUES (?, ?, ?, ?, ?)`,
                [issueId, item.inventory_item_id, item.quantity, price, item.condition || 'Good']
            );
            const issueItemId = iiResult.insertId;

            // Link Serials
            if (item.serial_codes && item.serial_codes.length > 0) {
                for (const code of item.serial_codes) {
                    const serial = await queryOne(
                        "SELECT id FROM serial_numbers WHERE serial_code = ? AND inventory_item_id = ?",
                        [code, item.inventory_item_id]
                    );
                    if (serial) {
                        await connection.execute(
                            "INSERT INTO issue_item_serials (issue_item_id, serial_number_id) VALUES (?, ?)",
                            [issueItemId, serial.id]
                        );
                        // Update serial status to Reserved
                        await connection.execute(
                            "UPDATE serial_numbers SET status = 'Reserved' WHERE id = ?",
                            [serial.id]
                        );
                    }
                }
            }

            // Update inventory_item totals (Issues are immediate deliveries)
            await connection.execute(
                `UPDATE inventory_items
                 SET quantity_available = GREATEST(quantity_available - ?, 0),
                     quantity_delivered = quantity_delivered + ?,
                     status = 'Reserved'
                 WHERE id = ?`,
                [item.quantity, item.quantity, item.inventory_item_id]
            );
        }

        // 4. Update total amount
        await connection.execute('UPDATE issues SET total_amount = ? WHERE id = ?', [totalAmount, issueId]);

        await connection.commit();
        res.status(201).json({ data: { id: issueId, issue_number: issueNumber } });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

exports.updateIssueStatus = async (req, res) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const { id } = req.params;
        const { status, return_date, payment_status, damage_notes } = req.body;

        if (!status) return res.status(400).json({ error: 'Status is required' });

        const issue = await queryOne('SELECT * FROM issues WHERE id = ?', [id]);
        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        const isReturnedStatus = status === 'Returned' || status === 'Returned Damaged';
        const wasReturnedStatus = issue.status === 'Returned' || issue.status === 'Returned Damaged';

        // If transitioning to a returned status, restore inventory / log damage
        if (isReturnedStatus && !wasReturnedStatus) {
            const items = await query('SELECT * FROM issue_items WHERE issue_id = ?', [id]);

            for (const item of items) {
                // 1. Restore serial numbers
                const serials = await query(
                    `SELECT serial_number_id FROM issue_item_serials WHERE issue_item_id = ?`,
                    [item.id]
                );
                if (serials.length > 0) {
                    const serialIds = serials.map(s => s.serial_number_id);
                    await connection.execute(
                        `UPDATE serial_numbers SET status = 'Available' WHERE id IN (${serialIds.join(',')})`
                    );
                }

                if (status === 'Returned Damaged') {
                    // 2a. Log damage in damaged_inventory_log
                    await connection.execute(
                        `INSERT INTO damaged_inventory_log 
                         (inventory_item_id, issue_id, damage_description, severity, repair_status)
                         VALUES (?, ?, ?, 'Minor', 'Pending')`,
                        [
                            item.inventory_item_id,
                            id,
                            damage_notes || 'Returned Damaged via complete return.'
                        ]
                    );

                    // 2b. Add to quantity_damaged instead of quantity_available
                    await connection.execute(
                        `UPDATE inventory_items 
                         SET quantity_damaged = quantity_damaged + ?,
                             quantity_delivered = GREATEST(quantity_delivered - ?, 0),
                             status = 'Damaged'
                         WHERE id = ?`,
                        [item.quantity, item.quantity, item.inventory_item_id]
                    );
                } else {
                    // 2c. Restore inventory item totals (Good condition return)
                    await connection.execute(
                        `UPDATE inventory_items 
                         SET quantity_available = quantity_available + ?,
                             quantity_delivered = GREATEST(quantity_delivered - ?, 0),
                             status = 'Available'
                         WHERE id = ?`,
                        [item.quantity, item.quantity, item.inventory_item_id]
                    );
                }
            }
        }

        let returnDateToUpdate = issue.return_date;
        let totalAmountToUpdate = issue.total_amount;
        let paymentStatusToUpdate = payment_status || issue.payment_status;

        // If returning, we update dates and recalculate price
        if (isReturnedStatus && return_date) {
            returnDateToUpdate = return_date;
            
            const d1 = new Date(issue.issue_date);
            const d2 = new Date(return_date);
            const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
            const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
            const rentalDays = Math.max(Math.ceil((utc2 - utc1) / (1000 * 60 * 60 * 24)), 1);

            const items = await query('SELECT * FROM issue_items WHERE issue_id = ?', [id]);
            let calculatedTotal = 0;
            for (const item of items) {
                calculatedTotal += Number(item.price) * item.quantity * rentalDays;
            }
            totalAmountToUpdate = calculatedTotal;
        }

        await connection.execute(
            'UPDATE issues SET status = ?, return_date = ?, total_amount = ?, payment_status = ? WHERE id = ?',
            [status, returnDateToUpdate, totalAmountToUpdate, paymentStatusToUpdate, id]
        );

        await connection.commit();
        res.json({ 
            message: 'Issue status updated successfully',
            data: {
                id,
                status,
                return_date: returnDateToUpdate,
                total_amount: totalAmountToUpdate,
                payment_status: paymentStatusToUpdate
            }
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

exports.updatePaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_status } = req.body;

        if (!payment_status) return res.status(400).json({ error: 'Payment status is required' });

        await query('UPDATE issues SET payment_status = ? WHERE id = ?', [payment_status, id]);
        res.json({ message: 'Payment status updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
