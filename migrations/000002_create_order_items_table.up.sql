-- Create order_items table
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0),
    CONSTRAINT order_items_total_price_check CHECK (total_price >= 0),
    
    -- Foreign key relationship
    CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE INDEX idx_order_items_created_at ON order_items(created_at);

-- Add trigger for updated_at timestamp
CREATE TRIGGER update_order_items_updated_at 
    BEFORE UPDATE ON order_items 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
