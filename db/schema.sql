CREATE SCHEMA IF NOT EXISTS retail_raw;
CREATE SCHEMA IF NOT EXISTS retail_ml;

CREATE TABLE IF NOT EXISTS retail_raw.stores (
    store_id text PRIMARY KEY,
    store_name text NOT NULL,
    region text,
    city text,
    state text,
    store_format text,
    foot_traffic_tier text,
    num_aisles integer,
    open_date date,
    sq_footage integer
);

CREATE TABLE IF NOT EXISTS retail_raw.suppliers (
    supplier_id text PRIMARY KEY,
    supplier_name text NOT NULL,
    country text,
    lead_time_days_avg integer,
    lead_time_days_std numeric,
    reliability_score numeric,
    min_order_qty integer,
    contract_start date,
    payment_terms_days integer
);

CREATE TABLE IF NOT EXISTS retail_raw.products (
    sku_id text PRIMARY KEY,
    product_name text NOT NULL,
    brand text,
    category text,
    subcategory text,
    unit_price numeric,
    unit_cost numeric,
    unit_weight_g numeric,
    shelf_life_days integer,
    is_perishable boolean,
    supplier_id text,
    barcode text,
    pack_size integer,
    reorder_point integer,
    safety_stock integer
);

CREATE TABLE IF NOT EXISTS retail_raw.promotions (
    promotion_id text PRIMARY KEY,
    promotion_name text,
    promo_type text,
    start_date date,
    end_date date,
    discount_pct numeric,
    sku_id text,
    store_id text,
    demand_lift_factor numeric
);

CREATE TABLE IF NOT EXISTS retail_raw.store_layout (
    layout_id text PRIMARY KEY,
    store_id text,
    aisle_id text,
    aisle_name text,
    shelf_id text,
    slot_id text,
    capacity_units integer,
    assigned_sku_id text,
    facing_count integer
);

CREATE TABLE IF NOT EXISTS retail_raw.sales_transactions (
    transaction_id text PRIMARY KEY,
    store_id text NOT NULL,
    sku_id text NOT NULL,
    sale_date date NOT NULL,
    units_sold integer,
    unit_price_actual numeric,
    revenue numeric,
    is_promoted boolean,
    promotion_id text
);

CREATE TABLE IF NOT EXISTS retail_raw.inventory_snapshots (
    snapshot_id text PRIMARY KEY,
    store_id text NOT NULL,
    sku_id text NOT NULL,
    snapshot_date date NOT NULL,
    snapshot_time time,
    units_on_hand integer,
    units_in_backroom integer,
    days_of_supply numeric,
    expiry_nearest_date date
);

CREATE TABLE IF NOT EXISTS retail_raw.replenishment_logs (
    replenishment_id text PRIMARY KEY,
    store_id text NOT NULL,
    sku_id text NOT NULL,
    replenishment_date date NOT NULL,
    trigger_type text,
    units_ordered integer,
    units_received integer,
    order_date date,
    receive_date date,
    lead_time_actual integer,
    replenishment_cost numeric,
    associate_id text
);

CREATE TABLE IF NOT EXISTS retail_raw.stockout_events (
    stockout_id text PRIMARY KEY,
    store_id text NOT NULL,
    sku_id text NOT NULL,
    stockout_date date NOT NULL,
    restock_date date,
    duration_days integer,
    estimated_lost_units integer,
    estimated_lost_revenue numeric,
    root_cause text
);

CREATE TABLE IF NOT EXISTS retail_raw.demand_forecasts (
    forecast_id text PRIMARY KEY,
    store_id text NOT NULL,
    sku_id text NOT NULL,
    forecast_date date NOT NULL,
    forecast_units numeric,
    forecast_method text,
    created_at date,
    lower_bound_90 numeric,
    upper_bound_90 numeric
);

CREATE TABLE IF NOT EXISTS retail_ml.modeling_table (
    store_id text NOT NULL,
    sku_id text NOT NULL,
    date date NOT NULL,
    units_sold numeric,
    revenue numeric,
    promoted_sales_days numeric,
    sales_last_7d numeric,
    sales_last_14d numeric,
    avg_daily_demand_7d numeric,
    avg_daily_demand_14d numeric,
    units_on_hand numeric,
    units_in_backroom numeric,
    days_of_supply numeric,
    computed_days_of_supply numeric,
    recent_replenishment_qty numeric,
    avg_supplier_lead_time numeric,
    days_since_last_replenishment numeric,
    estimated_lost_units numeric,
    estimated_lost_revenue numeric,
    stockout_start_today numeric,
    stockout_next_3d integer,
    stockout_next_7d integer,
    stockout_next_14d integer,
    historical_stockout_frequency numeric,
    product_name text,
    brand text,
    category text,
    subcategory text,
    unit_price numeric,
    unit_cost numeric,
    is_perishable boolean,
    supplier_id text,
    reorder_point integer,
    safety_stock integer,
    store_name text,
    region text,
    city text,
    state text,
    store_format text,
    foot_traffic_tier text
);

CREATE TABLE IF NOT EXISTS retail_ml.scored_test_rows (
    store_id text NOT NULL,
    sku_id text NOT NULL,
    date date NOT NULL,
    product_name text,
    store_name text,
    units_sold numeric,
    revenue numeric,
    promoted_sales_days numeric,
    sales_last_7d numeric,
    sales_last_14d numeric,
    avg_daily_demand_7d numeric,
    avg_daily_demand_14d numeric,
    units_on_hand numeric,
    units_in_backroom numeric,
    days_of_supply numeric,
    computed_days_of_supply numeric,
    recent_replenishment_qty numeric,
    days_since_last_replenishment numeric,
    avg_supplier_lead_time numeric,
    historical_stockout_frequency numeric,
    unit_price numeric,
    unit_cost numeric,
    reorder_point integer,
    safety_stock integer,
    brand text,
    category text,
    subcategory text,
    is_perishable boolean,
    region text,
    store_format text,
    foot_traffic_tier text,
    stockout_next_3d integer,
    stockout_next_7d integer,
    stockout_next_14d integer,
    stockout_probability numeric,
    stockout_probability_3d numeric,
    stockout_probability_7d numeric,
    stockout_probability_14d numeric,
    alert_threshold numeric,
    risk_level text
);

CREATE TABLE IF NOT EXISTS retail_ml.stockout_action_recommendations (
    date date,
    store_id text,
    store_name text,
    sku_id text,
    product_name text,
    category text,
    stockout_probability numeric,
    alert_threshold numeric,
    risk_level text,
    computed_days_of_supply numeric,
    units_on_hand numeric,
    units_in_backroom numeric,
    avg_daily_demand_7d numeric,
    estimated_lost_sales numeric,
    recommended_quantity integer,
    recommended_action text
);

CREATE TABLE IF NOT EXISTS retail_ml.evaluation_metrics (
    model text,
    threshold numeric,
    recall numeric,
    precision numeric,
    f1 numeric,
    pr_auc numeric
);

CREATE TABLE IF NOT EXISTS retail_ml.shap_feature_importance (
    feature text,
    mean_abs_shap numeric
);

CREATE TABLE IF NOT EXISTS retail_ml.confusion_matrix (
    actual_label text,
    predicted_0 integer,
    predicted_1 integer
);

CREATE TABLE IF NOT EXISTS retail_ml.ingestion_state (
    state_key text PRIMARY KEY,
    last_fetched_end_date date,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE retail_ml.modeling_table
    ADD COLUMN IF NOT EXISTS stockout_next_3d integer,
    ADD COLUMN IF NOT EXISTS stockout_next_14d integer;

ALTER TABLE retail_ml.scored_test_rows
    ADD COLUMN IF NOT EXISTS stockout_next_3d integer,
    ADD COLUMN IF NOT EXISTS stockout_next_14d integer,
    ADD COLUMN IF NOT EXISTS stockout_probability_3d numeric,
    ADD COLUMN IF NOT EXISTS stockout_probability_7d numeric,
    ADD COLUMN IF NOT EXISTS stockout_probability_14d numeric,
    ADD COLUMN IF NOT EXISTS alert_threshold numeric,
    ADD COLUMN IF NOT EXISTS risk_level text;

ALTER TABLE retail_ml.stockout_action_recommendations
    ADD COLUMN IF NOT EXISTS alert_threshold numeric,
    ADD COLUMN IF NOT EXISTS risk_level text;

CREATE OR REPLACE VIEW retail_ml.current_high_risk_queue AS
SELECT
    date,
    store_id,
    store_name,
    sku_id,
    product_name,
    category,
    stockout_probability,
    computed_days_of_supply,
    estimated_lost_sales,
    recommended_action
FROM retail_ml.stockout_action_recommendations
WHERE stockout_probability >= 0.70
ORDER BY stockout_probability DESC, estimated_lost_sales DESC;

CREATE OR REPLACE VIEW retail_ml.daily_risk_trend AS
SELECT
    date,
    CASE
        WHEN coalesce(risk_level, '') <> '' THEN risk_level
        WHEN stockout_probability >= 0.90 THEN 'critical'
        WHEN stockout_probability >= 0.70 THEN 'high'
        WHEN stockout_probability >= coalesce(alert_threshold, 0.45) THEN 'medium'
        ELSE 'low'
    END AS risk_level,
    count(*) AS store_sku_count,
    avg(stockout_probability) AS avg_probability,
    sum(coalesce(stockout_next_7d, 0)) AS actual_next_7d_stockouts
FROM retail_ml.scored_test_rows
GROUP BY 1, 2;
