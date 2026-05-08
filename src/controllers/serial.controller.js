const { query, pool } = require('../config/db');

exports.getSerialsByItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const serials = await query(
            "SELECT * FROM serial_numbers WHERE inventory_item_id = ? ORDER BY created_at DESC",
            [itemId]
        );
        res.json({ data: serials });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.saveItemSerials = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { itemId } = req.params;
        const { serials } = req.body; // Array of { serial_code, status }

        if (!Array.isArray(serials)) {
            return res.status(400).json({ error: "Serials must be an array" });
        }

        await connection.beginTransaction();

        // 1. Delete existing serials for this item
        // Note: In a production app, you might want to reconcile instead of delete-all
        // but for a simple "Save" from a modal, this is often what's expected.
        await connection.query("DELETE FROM serial_numbers WHERE inventory_item_id = ?", [itemId]);

        // 2. Insert new serials
        if (serials.length > 0) {
            const values = serials.map(s => [itemId, s.serial_code, s.status || 'Available']);
            await connection.query(
                "INSERT INTO serial_numbers (inventory_item_id, serial_code, status) VALUES ?",
                [values]
            );
        }

        // 3. Update inventory_item totals
        const total = serials.length;
        const available = serials.filter(s => s.status === 'Available' || !s.status).length;
        const reserved = serials.filter(s => s.status === 'Reserved').length;
        const delivered = serials.filter(s => s.status === 'Delivered').length;
        const damaged = serials.filter(s => s.status === 'Damaged').length;

        await connection.query(
            `UPDATE inventory_items 
             SET quantity_total = ?, 
                 quantity_available = ?, 
                 quantity_reserved = ?, 
                 quantity_delivered = ?, 
                 quantity_damaged = ? 
             WHERE id = ?`,
            [total, available, reserved, delivered, damaged, itemId]
        );

        await connection.commit();
        res.json({ message: "Serials saved successfully", total, available });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};
