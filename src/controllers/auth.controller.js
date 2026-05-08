const { queryOne, query } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    try {
        const { org_id, name, email, password, role } = req.body;

        if (!org_id || !name || !email || !password) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Check if user exists
        const userExists = await queryOne("SELECT id FROM users WHERE email = ?", [email]);
        if (userExists) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const result = await query(
            "INSERT INTO users (organization_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
            [org_id, name, email, hashedPassword, role || 'staff']
        );

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // Get user
        const user = await queryOne("SELECT * FROM users WHERE email = ?", [email]);
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Create token
        const token = jwt.sign(
            { id: user.id, org_id: user.organization_id, role: user.role },
            process.env.JWT_SECRET || 'ca@26',
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                org_id: user.organization_id
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
