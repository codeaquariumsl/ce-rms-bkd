const { query, queryOne } = require('../config/db');

// GET all categories for an org
exports.getCategories = async (req, res) => {
    try {
        const { org_id } = req.query;
        if (!org_id) return res.status(400).json({ error: 'Organization ID is required' });

        const categories = await query(
            'SELECT * FROM categories WHERE organization_id = ? ORDER BY name ASC',
            [org_id]
        );
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET single category
exports.getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await queryOne('SELECT * FROM categories WHERE id = ?', [id]);
        if (!category) return res.status(404).json({ error: 'Category not found' });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST create category
exports.createCategory = async (req, res) => {
    try {
        const { org_id, name, description, color, icon } = req.body;

        const organizationId = parseInt(org_id);
        if (isNaN(organizationId) || !name || !String(name).trim()) {
            return res.status(400).json({ error: 'Organization ID and category name are required' });
        }

        const trimmedName = String(name).trim();

        // Duplicate check
        const existing = await queryOne(
            'SELECT id FROM categories WHERE organization_id = ? AND name = ?',
            [organizationId, trimmedName]
        );
        if (existing) return res.status(409).json({ error: 'Category already exists' });

        const result = await query(
            `INSERT INTO categories (organization_id, name, description, color, icon, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [organizationId, trimmedName, description || null, color || '#3B82F6', icon || 'Package']
        );

        const newCategory = await queryOne('SELECT * FROM categories WHERE id = ?', [result.insertId]);
        res.status(201).json(newCategory);
    } catch (error) {
        res.status(500).json({ error: error.message, details: error.message });
    }
};

// PATCH update category
exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, color, icon } = req.body;

        const updates = [];
        const values = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (color !== undefined) { updates.push('color = ?'); values.push(color); }
        if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        values.push(id);
        const result = await query(
            `UPDATE categories SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });

        const updated = await queryOne('SELECT * FROM categories WHERE id = ?', [id]);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// DELETE category
exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('DELETE FROM categories WHERE id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
