USE rms_db;

CREATE TABLE IF NOT EXISTS serial_numbers (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inventory_item_id INT UNSIGNED NOT NULL,
    serial_code       VARCHAR(100) NOT NULL,
    status            ENUM('Available','Reserved','Delivered', 'Damaged') NOT NULL DEFAULT 'Available',
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    UNIQUE KEY uq_serial_code (inventory_item_id, serial_code)
);
