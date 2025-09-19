-- Drop outbox_events table and related objects
DROP TRIGGER IF EXISTS update_outbox_events_updated_at ON outbox_events;
DROP INDEX IF EXISTS idx_outbox_events_retry;
DROP INDEX IF EXISTS idx_outbox_events_unprocessed;
DROP INDEX IF EXISTS idx_outbox_events_event_type;
DROP INDEX IF EXISTS idx_outbox_events_correlation_id;
DROP INDEX IF EXISTS idx_outbox_events_created_at;
DROP INDEX IF EXISTS idx_outbox_events_processed;
DROP INDEX IF EXISTS idx_outbox_events_aggregate;
DROP TABLE IF EXISTS outbox_events;
