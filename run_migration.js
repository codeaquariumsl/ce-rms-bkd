const { query } = require('./src/config/db');

const sql = `
-- ─── Issues ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id INT UNSIGNED NOT NULL,
    customer_id     INT UNSIGNED NOT NULL,
    issue_number    VARCHAR(50)  NOT NULL UNIQUE,
    booking_id      INT UNSIGNED, -- Optional link to a booking
    status          ENUM('Issued', 'Returned', 'Returned Damaged', 'Cancelled') NOT NULL DEFAULT 'Issued',
    issue_date      DATE         NOT NULL,
    return_date     DATE         NOT NULL,
    total_amount    DECIMAL(12,2) DEFAULT 0,
    payment_status  ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
    payment_type    VARCHAR(50)  DEFAULT NULL,
    notes           TEXT,
    issue_address   TEXT,
    created_by      INT UNSIGNED,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id)     REFERENCES customers(id)     ON DELETE RESTRICT,
    FOREIGN KEY (booking_id)      REFERENCES bookings(id)      ON DELETE SET NULL,
    FOREIGN KEY (created_by)      REFERENCES users(id)         ON DELETE SET NULL,
    INDEX idx_issue_org_status (organization_id, status),
    INDEX idx_issue_date       (issue_date)
);

-- ─── Issue Items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issue_items (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    issue_id          INT UNSIGNED NOT NULL,
    inventory_item_id INT UNSIGNED NOT NULL,
    quantity          INT UNSIGNED NOT NULL DEFAULT 1,
    price             DECIMAL(10,2) NOT NULL DEFAULT 0,
    condition_at_issue VARCHAR(100),
    FOREIGN KEY (issue_id)          REFERENCES issues(id)          ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
);

-- ─── Issue Item Serials ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issue_item_serials (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    issue_item_id INT UNSIGNED NOT NULL,
    serial_number_id INT UNSIGNED NOT NULL,
    FOREIGN KEY (issue_item_id)    REFERENCES issue_items(id)    ON DELETE CASCADE,
    FOREIGN KEY (serial_number_id) REFERENCES serial_numbers(id) ON DELETE CASCADE
);
`;

async function migrate() {
    try {
        const statements = sql.split(';').filter(s => s.trim());
        for (const s of statements) {
            await query(s);
            console.log("Executed statement");
        }
        console.log("Migration completed");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

migrate();
