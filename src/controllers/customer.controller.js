const { query, queryOne } = require('../config/db');

exports.getCustomers = async (req, res) => {
    try {
        const { org_id } = req.query;

        if (!org_id) {
            return res.status(400).json({ error: "Organization ID is required" });
        }

        const customers = await query(
            "SELECT * FROM customers WHERE organization_id = ? ORDER BY name",
            [org_id]
        );

        res.json({ data: customers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createCustomer = async (req, res) => {
    try {
        const { org_id, nic, name, phone, email, address, city, country, photo } = req.body;

        if (!org_id || !name || !phone || !nic) {
            return res.status(400).json({ error: "NIC, Name and phone are required" });
        }

        const result = await query(
            `INSERT INTO customers 
             (organization_id, nic, name, phone, email, address, city, country, photo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [org_id, nic, name, phone, email, address, city, country, photo || null]
        );

        const newCustomer = await queryOne("SELECT * FROM customers WHERE id = ?", [result.insertId]);
        res.status(201).json({ data: newCustomer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const allowed = ['nic', 'name', 'phone', 'email', 'address', 'city', 'country', 'photo'];
        const updates = [];
        const values = [];

        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        });

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(id);
        const result = await query(
            `UPDATE customers SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Customer not found' });

        const updated = await queryOne('SELECT * FROM customers WHERE id = ?', [id]);
        res.json({ data: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
