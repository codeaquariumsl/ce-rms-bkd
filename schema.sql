-- ============================================================
-- Rental Management System (RMS) – MySQL Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS rms_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rms_db;

-- ─── Organizations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    slug       VARCHAR(100) NOT NULL UNIQUE,
    address    TEXT,
    phone      VARCHAR(30),
    email      VARCHAR(255),
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id INT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('admin','manager','staff') NOT NULL DEFAULT 'staff',
    phone           VARCHAR(30),
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- ─── Customers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id   INT UNSIGNED NOT NULL,
    name              VARCHAR(255) NOT NULL,
    email             VARCHAR(255),
    phone             VARCHAR(30)  NOT NULL,
    address           TEXT,
    city              VARCHAR(100),
    country           VARCHAR(100),
    registration_date DATE         NOT NULL DEFAULT (CURDATE()),
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- ─── Categories ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id INT UNSIGNED NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    color           VARCHAR(20)  DEFAULT '#3B82F6',
    icon            VARCHAR(50)  DEFAULT 'Package',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_org_category (organization_id, name)
);

-- ─── Inventory Items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id      INT UNSIGNED NOT NULL,
    category_id          INT UNSIGNED,
    name                 VARCHAR(255) NOT NULL,
    description          TEXT,
    sku                  VARCHAR(100) NOT NULL,
    barcode              VARCHAR(100) NOT NULL UNIQUE,
    category             VARCHAR(100),                      -- denormalised label
    rental_rate_per_day  DECIMAL(10,2) NOT NULL DEFAULT 0,
    rental_rate_per_week DECIMAL(10,2),
    rental_rate_per_month DECIMAL(10,2),
    status               ENUM('Available','Reserved','Delivered','Damaged') NOT NULL DEFAULT 'Available',
    quantity_total       INT UNSIGNED NOT NULL DEFAULT 1,
    quantity_available   INT UNSIGNED NOT NULL DEFAULT 1,
    quantity_reserved    INT UNSIGNED NOT NULL DEFAULT 0,
    quantity_delivered   INT UNSIGNED NOT NULL DEFAULT 0,
    quantity_damaged     INT UNSIGNED NOT NULL DEFAULT 0,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id)     REFERENCES categories(id)    ON DELETE SET NULL,
    INDEX idx_inv_org_status (organization_id, status),
    INDEX idx_inv_barcode    (barcode),
    INDEX idx_inv_sku        (sku)
);

-- ─── Bookings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id INT UNSIGNED NOT NULL,
    customer_id     INT UNSIGNED NOT NULL,
    created_by      INT UNSIGNED,
    booking_number  VARCHAR(50)  NOT NULL UNIQUE,
    status          ENUM('Reserved','Ready for Pickup','Delivered','Returned','Returned Damaged','Cancelled')
                    NOT NULL DEFAULT 'Reserved',
    delivery_date   DATE         NOT NULL,
    return_date     DATE         NOT NULL,
    total_amount    DECIMAL(12,2) DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id)     REFERENCES customers(id)     ON DELETE RESTRICT,
    FOREIGN KEY (created_by)      REFERENCES users(id)         ON DELETE SET NULL,
    INDEX idx_bk_org_status  (organization_id, status),
    INDEX idx_bk_delivery    (delivery_date),
    INDEX idx_bk_return      (return_date)
);

-- ─── Booking Items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_items (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id        INT UNSIGNED NOT NULL,
    inventory_item_id INT UNSIGNED NOT NULL,
    quantity          INT UNSIGNED NOT NULL DEFAULT 1,
    rental_rate_per_day DECIMAL(10,2) NOT NULL DEFAULT 0,
    subtotal          DECIMAL(12,2) DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id)        REFERENCES bookings(id)        ON DELETE CASCADE,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
);

-- ─── Deliveries ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliveries (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id        INT UNSIGNED NOT NULL UNIQUE,
    status            ENUM('Pending','Prepared','Delivered','Cancelled') NOT NULL DEFAULT 'Pending',
    prepared_by       INT UNSIGNED,
    prepared_at       TIMESTAMP    NULL,
    delivered_by      INT UNSIGNED,
    delivered_at      TIMESTAMP    NULL,
    barcode_scanned_at TIMESTAMP   NULL,
    notes             TEXT,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id)   REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (prepared_by)  REFERENCES users(id)    ON DELETE SET NULL,
    FOREIGN KEY (delivered_by) REFERENCES users(id)    ON DELETE SET NULL,
    INDEX idx_del_status (status)
);

-- ─── Returns ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS returns (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id         INT UNSIGNED NOT NULL,
    delivery_id        INT UNSIGNED,
    status             ENUM('Pending','Returned','Returned Damaged','Partial Return') NOT NULL DEFAULT 'Pending',
    item_condition     ENUM('Good','Minor Damage','Major Damage'),
    damage_notes       TEXT,
    returned_by        INT UNSIGNED,
    returned_at        TIMESTAMP    NULL,
    barcode_scanned_at TIMESTAMP    NULL,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id)  REFERENCES bookings(id)   ON DELETE CASCADE,
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL,
    FOREIGN KEY (returned_by) REFERENCES users(id)      ON DELETE SET NULL,
    INDEX idx_ret_status (status)
);

-- ─── Damaged Inventory Log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS damaged_inventory_log (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inventory_item_id   INT UNSIGNED NOT NULL,
    booking_id          INT UNSIGNED,
    return_id           INT UNSIGNED,
    damage_description  TEXT,
    severity            ENUM('Minor','Major','Total Loss'),
    reported_by         INT UNSIGNED,
    repair_status       ENUM('Pending','In Repair','Repaired','Written Off') NOT NULL DEFAULT 'Pending',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id)        REFERENCES bookings(id)        ON DELETE SET NULL,
    FOREIGN KEY (return_id)         REFERENCES returns(id)         ON DELETE SET NULL,
    FOREIGN KEY (reported_by)       REFERENCES users(id)           ON DELETE SET NULL,
    INDEX idx_dmg_repair (repair_status)
);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id INT UNSIGNED NOT NULL,
    type            ENUM('SMS','Email','Push','Dashboard') NOT NULL,
    recipient_type  ENUM('Customer','Staff','Admin'),
    recipient_id    INT UNSIGNED,
    recipient_phone VARCHAR(30),
    recipient_email VARCHAR(255),
    subject         VARCHAR(255),
    message         TEXT         NOT NULL,
    booking_id      INT UNSIGNED,
    status          ENUM('Pending','Sent','Failed','Cancelled') NOT NULL DEFAULT 'Pending',
    sent_at         TIMESTAMP    NULL,
    error_message   TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id)      REFERENCES bookings(id)      ON DELETE SET NULL,
    INDEX idx_notif_org_status (organization_id, status)
);

-- ─── Activity Log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_id INT UNSIGNED NOT NULL,
    user_id         INT UNSIGNED,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       INT UNSIGNED,
    old_values      JSON,
    new_values      JSON,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE SET NULL,
    INDEX idx_log_org    (organization_id),
    INDEX idx_log_entity (entity_type, entity_id)
);

-- ─── Seed: Default Organization ───────────────────────────────────────────────
INSERT IGNORE INTO organizations (id, name, slug, email)
VALUES (1, 'Default Organization', 'default', 'admin@rms.local');

-- ─── Seed: Admin User  (password: Admin@1234) ────────────────────────────────
-- bcrypt hash generated with saltRounds=10
INSERT IGNORE INTO users (id, organization_id, name, email, password_hash, role)
VALUES (
    1, 1, 'System Admin', 'admin@rms.local',
    '$2a$10$km/cmWSRxjUlML3OUPH./eNYLLjIdPvNphbxsB7zEkRsgDChsV6Gm',
    'admin'
);
