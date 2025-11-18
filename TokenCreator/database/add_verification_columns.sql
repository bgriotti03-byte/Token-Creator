-- Add verification-related columns to tokens table
-- Run this migration to enable dynamic flattener features

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS compiler_version VARCHAR(50) DEFAULT 'v0.8.28+commit.7893614a',
ADD COLUMN IF NOT EXISTS evm_version VARCHAR(20) DEFAULT 'paris',
ADD COLUMN IF NOT EXISTS optimization_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS optimization_runs INT DEFAULT 200,
ADD COLUMN IF NOT EXISTS constructor_arguments JSON;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_token_address ON tokens(token_address);
