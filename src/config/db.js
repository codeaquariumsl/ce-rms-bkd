const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'rms_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/**
 * Executes a SQL query and returns the results.
 * Handles placeholder conversion from $n to ? if necessary,
 * although we will use ? directly in our new code.
 */
async function query(sql, params) {
    try {
        // Convert PostgreSQL style placeholders ($1, $2...) to MySQL style (?) if needed
        const mysqlSql = sql.replace(/\$\d+/g, '?');
        
        // Ensure undefined values are converted to null for MySQL
        const sanitizedParams = Array.isArray(params) 
            ? params.map(p => p === undefined ? null : p) 
            : params;

        const [results] = await pool.execute(mysqlSql, sanitizedParams);
        return results;
    } catch (error) {
        console.error('Database Error:', error);
        throw error;
    }
}

/**
 * Returns a single row from a query
 */
async function queryOne(sql, params) {
    const results = await query(sql, params);
    return results.length > 0 ? results[0] : null;
}

module.exports = {
    pool,
    query,
    queryOne
};
