const { query, queryOne } = require('../config/db');

/**
 * POST /api/barcode/scan
 * Identify an item by barcode and return current booking status
 */
exports.scanBarcode = async (req, res) => {
    try {
        const { barcode, action } = req.body; // action: 'delivery' | 'return' | 'inventory'

        if (!barcode) {
            return res.status(400).json({ error: 'Barcode is required' });
        }

        // Look up item by barcode
        const item = await queryOne(
            'SELECT * FROM inventory_items WHERE barcode = ?',
            [barcode]
        );

        if (!item) {
            return res.status(404).json({ error: 'Invalid barcode – item not found', data: null });
        }

        // Get active bookings linked to this item
        const bookings = await query(
            `SELECT b.*, bi.quantity, c.name as customer_name
             FROM bookings b
             JOIN booking_items bi ON b.id = bi.booking_id
             JOIN customers c ON b.customer_id = c.id
             WHERE bi.inventory_item_id = ?
               AND b.status IN ('Reserved', 'Ready for Pickup', 'Delivered')
             ORDER BY b.delivery_date ASC
             LIMIT 5`,
            [item.id]
        );

        res.json({
            data: {
                item,
                action: action || 'inventory',
                current_bookings: bookings,
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * GET /api/barcode/search?barcode=&sku=&org_id=
 * Search inventory by barcode or SKU
 */
exports.searchInventory = async (req, res) => {
    try {
        const { barcode, sku, org_id } = req.query;

        if (!org_id) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }

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
