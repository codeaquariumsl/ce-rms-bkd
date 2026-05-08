const { query, queryOne } = require('../config/db');

// GET notifications
exports.getNotifications = async (req, res) => {
    try {
        const { org_id, status = 'Pending' } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        const notifications = await query(
            `SELECT * FROM notifications 
             WHERE organization_id = ? AND status = ?
             ORDER BY created_at DESC`,
            [org_id, status]
        );
        res.json({ data: notifications });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST create notification
exports.createNotification = async (req, res) => {
    try {
        const {
            org_id, type, recipient_type, recipient_id,
            recipient_phone, recipient_email, subject, message, booking_id
        } = req.body;

        if (!org_id || !type || !message) {
            return res.status(400).json({ error: 'org_id, type, and message are required' });
        }

        const result = await query(
            `INSERT INTO notifications 
             (organization_id, type, recipient_type, recipient_id, recipient_phone, recipient_email, subject, message, booking_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [parseInt(org_id), type, recipient_type, recipient_id, recipient_phone, recipient_email, subject, message, booking_id, 'Pending']
        );

        const newNotification = await queryOne('SELECT * FROM notifications WHERE id = ?', [result.insertId]);
        res.status(201).json({ data: newNotification });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PATCH mark notification as sent
exports.markAsSent = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            "UPDATE notifications SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?",
            [id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found' });

        const updated = await queryOne('SELECT * FROM notifications WHERE id = ?', [id]);
        res.json({ data: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
