const { query, queryOne } = require('../config/db');

// GET all damaged items log
exports.getDamagedItems = async (req, res) => {
    try {
        const { org_id, repair_status } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        let queryStr = `
            SELECT dil.*, ii.name, ii.sku, ii.barcode, ii.status as item_status,
                   u.name as reported_by_name
            FROM damaged_inventory_log dil
            JOIN inventory_items ii ON dil.inventory_item_id = ii.id
            LEFT JOIN users u ON dil.reported_by = u.id
            WHERE ii.organization_id = ?
        `;
        const values = [org_id];

        if (repair_status) {
            queryStr += ' AND dil.repair_status = ?';
            values.push(repair_status);
        }

        queryStr += ' ORDER BY dil.created_at DESC';

        const damageLog = await query(queryStr, values);
        res.json({ data: damageLog });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PATCH update repair status
exports.updateRepairStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { repair_status } = req.body;

        if (!repair_status) {
            return res.status(400).json({ error: 'repair_status is required' });
        }

        const result = await query(
            'UPDATE damaged_inventory_log SET repair_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [repair_status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Damage record not found' });
        }

        // If repaired, restore inventory item to Available
        if (repair_status === 'Repaired') {
            const damageRecord = await queryOne(
                'SELECT inventory_item_id, booking_id FROM damaged_inventory_log WHERE id = ?',
                [id]
            );
            if (damageRecord) {
                // Restore the quantity: damaged -> available
                await query(
                    `UPDATE inventory_items 
                     SET status = 'Available', 
                         quantity_damaged = GREATEST(quantity_damaged - 1, 0),
                         quantity_available = quantity_available + 1
                     WHERE id = ?`,
                    [damageRecord.inventory_item_id]
                );
            }
        }

        const updated = await queryOne('SELECT * FROM damaged_inventory_log WHERE id = ?', [id]);
        res.json({ data: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
