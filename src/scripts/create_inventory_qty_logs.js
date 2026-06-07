const { query } = require('../config/db');

async function run() {
    try {
        console.log("Running migration to create inventory_qty_logs table...");
        
        await query(`
            CREATE TABLE IF NOT EXISTS inventory_qty_logs (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                inventory_item_id INT UNSIGNED NOT NULL,
                qty INT NOT NULL,
                in_out ENUM('in', 'out') NOT NULL,
                datetime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
            );
        `);
        
        console.log("Successfully created 'inventory_qty_logs' table!");
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

run();
