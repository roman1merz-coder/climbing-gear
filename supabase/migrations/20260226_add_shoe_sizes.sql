-- Add EU size column to shoe_prices for per-size availability tracking
-- NULL = size not specified by retailer (backwards compatible)
ALTER TABLE shoe_prices ADD COLUMN IF NOT EXISTS eur_size NUMERIC(3,1);

-- Index for efficient filtering by product + size
CREATE INDEX IF NOT EXISTS idx_shoe_prices_size ON shoe_prices (product_slug, eur_size);
