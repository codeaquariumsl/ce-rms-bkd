/**
 * scripts/seed-admin.js
 * Script to initialize the database and seed the admin user.
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const seed = async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true // Crucial for running the whole schema
    });

    try {
        console.log('🚀 Starting Database Initialization...');

        // 1. Read the schema file
        const schemaPath = path.join(__dirname, '../schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // 2. Execute the schema (creates DB and tables)
        console.log('📝 Executing schema.sql...');
        await connection.query(schema);
        console.log('✅ Schema executed successfully.');

        // 3. Ensure the admin password is correct (in case schema had old hash)
        // Password: Admin@1234
        const adminEmail = 'admin@rms.local';
        const adminHash = '$2a$10$ylM5Z8E2zqsC6P7NqWRSKuq.4QK4gyM/a5NkCqj8T4v2HM9oEjnCm';
        
        await connection.query('USE rms_db');
        await connection.execute(
            'UPDATE users SET password_hash = ? WHERE email = ?',
            [adminHash, adminEmail]
        );
        console.log('✅ Admin password hash verified.');

        console.log('✨ System initialized and ready.');
    } catch (error) {
        console.error('❌ Initialization failed:', error);
    } finally {
        await connection.end();
    }
};

seed();
