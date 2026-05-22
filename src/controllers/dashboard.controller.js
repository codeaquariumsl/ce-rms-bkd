const { query, queryOne } = require('../config/db');

exports.getStats = async (req, res) => {
    try {
        const { org_id } = req.query;

        if (!org_id) {
            return res.status(400).json({ error: "Organization ID is required" });
        }

        // 1. Query physical inventory sums
        const inventorySummary = await queryOne(
            `
            SELECT
              COALESCE(SUM(quantity_total), 0) as total,
              COALESCE(SUM(quantity_available), 0) as available,
              COALESCE(SUM(quantity_reserved), 0) as reserved,
              COALESCE(SUM(quantity_delivered), 0) as delivered,
              COALESCE(SUM(quantity_damaged), 0) as damaged
            FROM inventory_items
            WHERE organization_id = ?
            `,
            [org_id]
        );

        // 2. Query today's active issues (issued today)
        const todayDeliveries = await query(
            `
            SELECT 
              i.id,
              i.issue_number as booking_number,
              c.name as customer_name,
              i.status
            FROM issues i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.organization_id = ? 
              AND i.status = 'Issued'
              AND DATE(i.issue_date) = CURDATE()
            ORDER BY i.created_at DESC
            `,
            [org_id]
        );

        // 3. Query all pending/active returns (Outstanding rentals)
        const pendingReturns = await query(
            `
            SELECT 
              i.id,
              i.issue_number as booking_number,
              c.name as customer_name,
              i.return_date,
              i.status
            FROM issues i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.organization_id = ? 
              AND i.status = 'Issued'
            ORDER BY i.return_date ASC
            `,
            [org_id]
        );

        // 4. Query weekly activity statistics (last 7 days of issues and returns)
        const issuesHistory = await query(
            `
            SELECT DATE(issue_date) as date, COUNT(*) as count
            FROM issues
            WHERE organization_id = ?
              AND issue_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(issue_date)
            `,
            [org_id]
        );

        const returnsHistory = await query(
            `
            SELECT DATE(return_date) as date, COUNT(*) as count
            FROM issues
            WHERE organization_id = ?
              AND status IN ('Returned', 'Returned Damaged')
              AND return_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(return_date)
            `,
            [org_id]
        );

        // Map weekly stats
        const weekOverview = [];
        const issueMap = new Map(issuesHistory.map(row => [row.date ? new Date(row.date).toISOString().split('T')[0] : '', row.count]));
        const returnMap = new Map(returnsHistory.map(row => [row.date ? new Date(row.date).toISOString().split('T')[0] : '', row.count]));

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

            weekOverview.push({
                name: dayName,
                Deliveries: issueMap.get(dateStr) || 0,
                Returns: returnMap.get(dateStr) || 0
            });
        }

        res.json({
            data: {
                inventorySummary: {
                    total: Number(inventorySummary.total),
                    available: Number(inventorySummary.available),
                    reserved: Number(inventorySummary.reserved),
                    delivered: Number(inventorySummary.delivered),
                    damaged: Number(inventorySummary.damaged)
                },
                todayDeliveries,
                pendingReturns,
                weekOverview
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

