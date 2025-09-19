-- Drop order_items table and related objects
DROP TRIGGER IF EXISTS update_order_items_updated_at ON order_items;
DROP INDEX IF EXISTS idx_order_items_created_at;
DROP INDEX IF EXISTS idx_order_items_product_id;
DROP INDEX IF EXISTS idx_order_items_order_id;
DROP TABLE IF EXISTS order_items;
