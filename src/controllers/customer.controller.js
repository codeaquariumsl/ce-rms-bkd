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
