const { queryOne } = require('../config/db');

exports.getStats = async (req, res) => {
    try {
        const { org_id } = req.query;

        if (!org_id) {
            return res.status(400).json({ error: "Organization ID is required" });
        }

        const stats = await queryOne(
            `
            SELECT
              (SELECT COUNT(*) FROM inventory_items WHERE organization_id = ?) as total_inventory,
              (SELECT COUNT(*) FROM inventory_items WHERE organization_id = ? AND status = 'Available') as available_items,
              (SELECT COUNT(*) FROM inventory_items WHERE organization_id = ? AND status = 'Reserved') as reserved_items,
              (SELECT COUNT(*) FROM inventory_items WHERE organization_id = ? AND status = 'Delivered') as delivered_items,
              (SELECT COUNT(*) FROM inventory_items WHERE organization_id = ? AND status = 'Damaged') as damaged_items,
              (SELECT COUNT(*) FROM bookings WHERE organization_id = ? AND DATE(delivery_date) = CURDATE() AND status IN ('Reserved', 'Ready for Pickup')) as today_deliveries,
              (SELECT COUNT(*) FROM bookings WHERE organization_id = ? AND DATE(delivery_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND status IN ('Reserved', 'Ready for Pickup')) as tomorrow_deliveries,
              (SELECT COUNT(*) FROM returns WHERE booking_id IN (SELECT id FROM bookings WHERE organization_id = ?) AND status = 'Pending') as pending_returns,
              (SELECT COUNT(*) FROM bookings WHERE organization_id = ? AND DATE(return_date) < CURDATE() AND status IN ('Delivered', 'Returned')) as overdue_returns
            `,
            [org_id, org_id, org_id, org_id, org_id, org_id, org_id, org_id, org_id]
        );

        res.json({ data: stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
