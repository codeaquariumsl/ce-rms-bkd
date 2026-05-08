/**
 * src/controllers/logs.controller.js
 * Controller for retrieving activity and endpoint logs.
 */

const pool = require('../config/db');

/**
 * Get activity logs for an organization
 */
exports.getActivityLogs = async (req, res) => {
    try {
        const { orgId } = req.params;
        const [rows] = await pool.execute(
            `SELECT al.*, u.name as user_name 
             FROM activity_logs al 
             LEFT JOIN users u ON al.user_id = u.id 
             WHERE al.organization_id = ? 
             ORDER BY al.created_at DESC 
             LIMIT 100`,
            [orgId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Failed to get logs:', error);
        res.status(500).json({ error: 'Failed to retrieve logs' });
    }
};

/**
 * Log an activity (usually called internally or via middleware)
 */
exports.logActivity = async (orgId, userId, action, entityType, entityId, oldVal, newVal, ip) => {
    try {
        await pool.execute(
            `INSERT INTO activity_logs 
             (organization_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [orgId, userId, action, entityType, entityId, JSON.stringify(oldVal), JSON.stringify(newVal), ip]
        );
    } catch (error) {
        console.error('Failed to write activity log:', error);
    }
};
