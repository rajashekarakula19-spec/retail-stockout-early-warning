CREATE INDEX IF NOT EXISTS idx_sales_store_sku_date
    ON retail_raw.sales_transactions (store_id, sku_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_inventory_store_sku_date
    ON retail_raw.inventory_snapshots (store_id, sku_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_replenishment_store_sku_date
    ON retail_raw.replenishment_logs (store_id, sku_id, replenishment_date);

CREATE INDEX IF NOT EXISTS idx_stockouts_store_sku_date
    ON retail_raw.stockout_events (store_id, sku_id, stockout_date);

CREATE INDEX IF NOT EXISTS idx_forecasts_store_sku_date
    ON retail_raw.demand_forecasts (store_id, sku_id, forecast_date);

CREATE INDEX IF NOT EXISTS idx_products_category
    ON retail_raw.products (category, subcategory);

CREATE INDEX IF NOT EXISTS idx_stores_region
    ON retail_raw.stores (region, state, city);

CREATE INDEX IF NOT EXISTS idx_ml_modeling_store_sku_date
    ON retail_ml.modeling_table (store_id, sku_id, date);

CREATE INDEX IF NOT EXISTS idx_ml_scored_probability
    ON retail_ml.scored_test_rows (stockout_probability DESC);

CREATE INDEX IF NOT EXISTS idx_ml_scored_store_sku_date
    ON retail_ml.scored_test_rows (store_id, sku_id, date);

CREATE INDEX IF NOT EXISTS idx_ml_recommendations_probability
    ON retail_ml.stockout_action_recommendations (stockout_probability DESC, estimated_lost_sales DESC);

ANALYZE retail_raw.stores;
ANALYZE retail_raw.suppliers;
ANALYZE retail_raw.products;
ANALYZE retail_raw.promotions;
ANALYZE retail_raw.store_layout;
ANALYZE retail_raw.sales_transactions;
ANALYZE retail_raw.inventory_snapshots;
ANALYZE retail_raw.replenishment_logs;
ANALYZE retail_raw.stockout_events;
ANALYZE retail_raw.demand_forecasts;
ANALYZE retail_ml.modeling_table;
ANALYZE retail_ml.scored_test_rows;
ANALYZE retail_ml.stockout_action_recommendations;
