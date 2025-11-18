-- Token Creator Bot Database Schema
-- MySQL 8.0+

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS token_creator_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE token_creator_bot;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255) NULL,
    first_name VARCHAR(255) NULL,
    last_name VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_telegram_id (telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens table
CREATE TABLE IF NOT EXISTS tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_name VARCHAR(255) NOT NULL,
    token_symbol VARCHAR(50) NOT NULL,
    initial_supply VARCHAR(100) NOT NULL,
    tax_percent INT NOT NULL DEFAULT 0,
    tax_wallet VARCHAR(42) NULL,
    token_address VARCHAR(42) NOT NULL,
    owner_wallet VARCHAR(42) NOT NULL,
    factory_address VARCHAR(42) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    network VARCHAR(50) NOT NULL DEFAULT 'alvey',
    deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_token_address (token_address),
    INDEX idx_owner_wallet (owner_wallet)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NEW: Add columns for reflection and burn features
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS reflection_percent TINYINT DEFAULT 0 COMMENT 'Reflection percentage (0-100)';
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS burn_percent TINYINT DEFAULT 0 COMMENT 'Burn percentage (0-100)';
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS has_reflection BOOLEAN DEFAULT FALSE COMMENT 'Reflection feature enabled';
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS has_burn BOOLEAN DEFAULT FALSE COMMENT 'Burn feature enabled';
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS total_fees_percent TINYINT GENERATED ALWAYS AS 
    (COALESCE(tax_percent, 0) + COALESCE(reflection_percent, 0) + COALESCE(burn_percent, 0)) 
    STORED COMMENT 'Total of all fees combined';

-- NEW: Add chain_id column if not exists
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS chain_id INT COMMENT 'Network chain ID';

-- NEW: Create index for feature searches
CREATE INDEX IF NOT EXISTS idx_features ON tokens(has_reflection, has_burn);
CREATE INDEX IF NOT EXISTS idx_total_fees ON tokens(total_fees_percent);
CREATE INDEX IF NOT EXISTS idx_network ON tokens(network);

-- NEW: Add verification columns
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE COMMENT 'Contract verified on explorer';
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL COMMENT 'When contract was verified';
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS verification_status ENUM('pending', 'verified', 'failed') DEFAULT 'pending' COMMENT 'Verification status';

-- Index for querying verified tokens
CREATE INDEX IF NOT EXISTS idx_verified ON tokens(is_verified, verification_status);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_id INT NULL,
    payment_id VARCHAR(100) UNIQUE NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USDT',
    payer_wallet VARCHAR(42) NOT NULL,
    tx_hash VARCHAR(66) NULL,
    status ENUM('pending', 'confirmed', 'expired', 'failed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE SET NULL,
    INDEX idx_payment_id (payment_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_tx_hash (tx_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    session_data JSON NOT NULL,
    step VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    INDEX idx_telegram_id (telegram_id),
    INDEX idx_step (step),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

