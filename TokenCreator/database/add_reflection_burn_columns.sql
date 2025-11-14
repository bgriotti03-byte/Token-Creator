-- Add reflection and burn columns to tokens table
-- Execute this in phpMyAdmin SQL tab after selecting the token_creator_bot database

USE token_creator_bot;

-- Add columns for reflection and burn features
ALTER TABLE tokens ADD COLUMN reflection_percent TINYINT DEFAULT 0 COMMENT 'Reflection percentage (0-100)';
ALTER TABLE tokens ADD COLUMN burn_percent TINYINT DEFAULT 0 COMMENT 'Burn percentage (0-100)';
ALTER TABLE tokens ADD COLUMN has_reflection BOOLEAN DEFAULT FALSE COMMENT 'Reflection feature enabled';
ALTER TABLE tokens ADD COLUMN has_burn BOOLEAN DEFAULT FALSE COMMENT 'Burn feature enabled';
ALTER TABLE tokens ADD COLUMN total_fees_percent TINYINT GENERATED ALWAYS AS 
    (COALESCE(tax_percent, 0) + COALESCE(reflection_percent, 0) + COALESCE(burn_percent, 0)) 
    STORED COMMENT 'Total of all fees combined';

-- Create index for feature searches
CREATE INDEX idx_features ON tokens(has_reflection, has_burn);
CREATE INDEX idx_total_fees ON tokens(total_fees_percent);

