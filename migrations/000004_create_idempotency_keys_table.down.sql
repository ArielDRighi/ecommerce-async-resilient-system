-- Drop idempotency_keys table and related objects
DROP TRIGGER IF EXISTS update_idempotency_keys_updated_at ON idempotency_keys;
DROP INDEX IF EXISTS idx_idempotency_keys_active;
DROP INDEX IF EXISTS idx_idempotency_keys_created_at;
DROP INDEX IF EXISTS idx_idempotency_keys_expires_at;
DROP INDEX IF EXISTS idx_idempotency_keys_resource;
DROP INDEX IF EXISTS idx_idempotency_keys_key;
DROP TABLE IF EXISTS idempotency_keys;
