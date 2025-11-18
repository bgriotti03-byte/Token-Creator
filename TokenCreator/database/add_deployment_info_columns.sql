-- Add deployment info columns to tokens table
-- Run this migration to enable comprehensive deployment tracking

ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS deployment_info JSON COMMENT 'Complete deployment information including all parameters',
ADD COLUMN IF NOT EXISTS verification_notes TEXT COMMENT 'Notes about verification status and method',
ADD COLUMN IF NOT EXISTS verification_instructions TEXT COMMENT 'Instructions for manual verification';

-- Update verification_status to allow 'deployment_validated'
ALTER TABLE tokens 
MODIFY COLUMN verification_status VARCHAR(50) DEFAULT 'deployment_validated';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_deployment_info ON tokens(token_address, verification_status);

