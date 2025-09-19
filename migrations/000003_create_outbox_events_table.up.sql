-- Create outbox_events table for event sourcing and reliable messaging
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    correlation_id UUID,
    causation_id UUID,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT outbox_events_event_version_check CHECK (event_version > 0),
    CONSTRAINT outbox_events_retry_count_check CHECK (retry_count >= 0),
    CONSTRAINT outbox_events_max_retries_check CHECK (max_retries >= 0)
);

-- Create indexes for performance
CREATE INDEX idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX idx_outbox_events_processed ON outbox_events(processed);
CREATE INDEX idx_outbox_events_created_at ON outbox_events(created_at);
CREATE INDEX idx_outbox_events_correlation_id ON outbox_events(correlation_id);
CREATE INDEX idx_outbox_events_event_type ON outbox_events(event_type);

-- Partial index for unprocessed events
CREATE INDEX idx_outbox_events_unprocessed ON outbox_events(created_at) WHERE processed = FALSE;

-- Partial index for retry processing
CREATE INDEX idx_outbox_events_retry ON outbox_events(next_retry_at) 
    WHERE processed = FALSE AND next_retry_at IS NOT NULL;

-- Add trigger for updated_at timestamp
CREATE TRIGGER update_outbox_events_updated_at 
    BEFORE UPDATE ON outbox_events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
