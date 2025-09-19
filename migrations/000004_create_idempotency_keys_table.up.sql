-- Create idempotency_keys table for request deduplication
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    request_hash VARCHAR(64) NOT NULL,
    response_status_code INTEGER,
    response_body JSONB,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT idempotency_keys_status_code_check CHECK (response_status_code >= 100 AND response_status_code < 600)
);

-- Create indexes for performance
CREATE UNIQUE INDEX idx_idempotency_keys_key ON idempotency_keys(idempotency_key);
CREATE INDEX idx_idempotency_keys_resource ON idempotency_keys(resource_type, resource_id);
CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);
CREATE INDEX idx_idempotency_keys_created_at ON idempotency_keys(created_at);

-- Partial index for active keys (not expired)
CREATE INDEX idx_idempotency_keys_active ON idempotency_keys(idempotency_key) 
    WHERE expires_at > CURRENT_TIMESTAMP;

-- Add trigger for updated_at timestamp
CREATE TRIGGER update_idempotency_keys_updated_at 
    BEFORE UPDATE ON idempotency_keys 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
