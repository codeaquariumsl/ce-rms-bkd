const { query, queryOne } = require('../config/db');

// GET /api/inventory?org_id=&status=
exports.getInventory = async (req, res) => {
    try {
        const { org_id, status } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        let queryStr = `
            SELECT ii.*, 
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', sn.id, 'serial_code', sn.serial_code, 'status', sn.status))
                    FROM serial_numbers sn 
                    WHERE sn.inventory_item_id = ii.id) as serial_numbers
            FROM inventory_items ii 
            WHERE organization_id = ?
        `;
        const values = [org_id];

        if (status) { queryStr += ' AND status = ?'; values.push(status); }
        queryStr += ' ORDER BY created_at DESC';

        const items = await query(queryStr, values);
        res.json({ data: items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/inventory/:id
exports.getInventoryItem = async (req, res) => {
    try {
        const item = await queryOne(`
            SELECT ii.*, 
                   (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', sn.id, 'serial_code', sn.serial_code, 'status', sn.status))
                    FROM serial_numbers sn 
                    WHERE sn.inventory_item_id = ii.id) as serial_numbers
            FROM inventory_items ii 
            WHERE id = ?
        `, [req.params.id]);
        if (!item) return res.status(404).json({ error: 'Inventory item not found' });
        res.json({ data: item });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/inventory/search?barcode=&sku=&org_id=
exports.searchInventory = async (req, res) => {
    try {
        const { barcode, sku, org_id } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        if (barcode) {
            const item = await queryOne(
                'SELECT * FROM inventory_items WHERE barcode = ? AND organization_id = ?',
                [barcode, org_id]
            );
            return res.json({ data: item || null });
        }

        if (sku) {
            const item = await queryOne(
                'SELECT * FROM inventory_items WHERE sku = ? AND organization_id = ?',
                [sku, org_id]
            );
            return res.json({ data: item || null });
        }

        res.status(400).json({ error: 'barcode or sku query parameter is required' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/inventory/damaged?org_id=
exports.getDamagedInventory = async (req, res) => {
    try {
        const { org_id } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        const items = await query(
            `SELECT ii.*, dil.damage_description, dil.severity, dil.repair_status
             FROM inventory_items ii
             LEFT JOIN damaged_inventory_log dil ON ii.id = dil.inventory_item_id
             WHERE ii.organization_id = ? AND ii.status = 'Damaged'
             ORDER BY dil.created_at DESC`,
            [org_id]
        );
        res.json({ data: items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/inventory/damaged  – manually log damage on an item
exports.logDamage = async (req, res) => {
    try {
        const { inventory_item_id, booking_id, damage_description, severity, reported_by } = req.body;

        if (!inventory_item_id) {
            return res.status(400).json({ error: 'inventory_item_id is required' });
        }

        // Mark item as Damaged
        await query(
            "UPDATE inventory_items SET status = 'Damaged', quantity_damaged = quantity_damaged + 1, quantity_available = GREATEST(quantity_available - 1, 0) WHERE id = ?",
            [inventory_item_id]
        );

        // Log entry
        const result = await query(
            `INSERT INTO damaged_inventory_log
             (inventory_item_id, booking_id, damage_description, severity, reported_by, repair_status)
             VALUES (?, ?, ?, ?, ?, 'Pending')`,
            [inventory_item_id, booking_id || null, damage_description, severity, reported_by || null]
        );

        const newLog = await queryOne('SELECT * FROM damaged_inventory_log WHERE id = ?', [result.insertId]);
        res.status(201).json({ data: newLog });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/inventory
exports.createInventoryItem = async (req, res) => {
    try {
        const { 
            org_id, name, sku, barcode, category, category_id, 
            rental_rate_per_day, rental_rate_per_week, rental_rate_per_month, 
            description, is_have_serial, quantity_total
        } = req.body;

        if (!org_id || !name || !sku || !barcode || !rental_rate_per_day) {
            return res.status(400).json({ error: 'Missing required fields: org_id, name, sku, barcode, rental_rate_per_day' });
        }

        const isHaveSerialVal = is_have_serial ? 1 : 0;
        const totalQty = quantity_total !== undefined ? parseInt(quantity_total, 10) : 1;

        const result = await query(
            `INSERT INTO inventory_items
             (organization_id, name, sku, barcode, category_id, category, 
              rental_rate_per_day, rental_rate_per_week, rental_rate_per_month, description,
              status, quantity_total, quantity_available, quantity_reserved, quantity_delivered, quantity_damaged, is_have_serial)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, 0, 0, 0, ?)`,
            [
                org_id, name, sku, barcode, category_id || null, category || null, 
                rental_rate_per_day, rental_rate_per_week || null, rental_rate_per_month || null, 
                description || null, totalQty, totalQty, isHaveSerialVal
            ]
        );

        const newItem = await queryOne('SELECT * FROM inventory_items WHERE id = ?', [result.insertId]);
        res.status(201).json({ data: newItem });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PATCH /api/inventory/:id
exports.updateInventoryItem = async (req, res) => {
    try {
        const { id } = req.params;
        const allowed = [
            'name', 'description', 'category_id', 'category', 'sku', 'rental_rate_per_day',
            'rental_rate_per_week', 'rental_rate_per_month', 'status', 'quantity_total',
            'quantity_available', 'is_have_serial'
        ];

        const updates = [];
        const values = [];

        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = ?`);
                // convert boolean to tinyint for DB
                if (field === 'is_have_serial') {
                    values.push(req.body[field] ? 1 : 0);
                } else {
                    values.push(req.body[field]);
                }
            }
        });

        if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

        values.push(id);
        const result = await query(
            `UPDATE inventory_items SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Inventory item not found' });

        const updated = await queryOne('SELECT * FROM inventory_items WHERE id = ?', [id]);
        res.json({ data: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// DELETE /api/inventory/:id
exports.deleteInventoryItem = async (req, res) => {
    try {
        const result = await query('DELETE FROM inventory_items WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Inventory item not found' });
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
