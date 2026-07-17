from __future__ import annotations

import pandas as pd

from stockout_ews.db import read_sql
from stockout_ews.features import (
    KEYS,
    _add_inventory_features,
    _add_replenishment_features,
    _add_sales_features,
    _add_static_features,
    _add_stockout_features_and_target,
    _build_calendar,
)


def _sample_pairs_from_db(config: dict) -> pd.DataFrame:
    sample = config.get("sample", {})
    max_skus = sample.get("max_skus_per_store")
    max_pairs = sample.get("max_store_sku_pairs")
    query = """
        WITH pairs AS (
            SELECT DISTINCT store_id, sku_id
            FROM retail_raw.sales_transactions
        ),
        ranked AS (
            SELECT
                store_id,
                sku_id,
                row_number() OVER (PARTITION BY store_id ORDER BY md5(store_id || ':' || sku_id)) AS sku_rank
            FROM pairs
        )
        SELECT store_id, sku_id
        FROM ranked
        WHERE (%(max_skus)s IS NULL OR sku_rank <= %(max_skus)s)
        ORDER BY store_id, sku_id
        LIMIT COALESCE(%(max_pairs)s, 2147483647)
    """
    return read_sql(query, config, {"max_skus": max_skus, "max_pairs": max_pairs})


def _values_clause(pairs: pd.DataFrame) -> str:
    return ",".join(
        f"('{row.store_id.replace(chr(39), chr(39) + chr(39))}', '{row.sku_id.replace(chr(39), chr(39) + chr(39))}')"
        for row in pairs.itertuples(index=False)
    )


def _read_pair_table(config: dict, table_sql: str, pairs: pd.DataFrame) -> pd.DataFrame:
    values = _values_clause(pairs)
    return read_sql(
        f"""
        WITH selected_pairs(store_id, sku_id) AS (VALUES {values})
        {table_sql}
        """,
        config,
    )


def build_modeling_table_from_db(config: dict) -> pd.DataFrame:
    pairs = _sample_pairs_from_db(config)

    sales = _read_pair_table(
        config,
        """
        SELECT s.store_id, s.sku_id, s.sale_date AS date, s.units_sold, s.revenue, s.is_promoted
        FROM retail_raw.sales_transactions s
        JOIN selected_pairs p USING (store_id, sku_id)
        """,
        pairs,
    )
    sales["date"] = pd.to_datetime(sales["date"])
    sales["is_promoted"] = sales["is_promoted"].astype(int)

    inventory = _read_pair_table(
        config,
        """
        SELECT i.store_id, i.sku_id, i.snapshot_date, i.units_on_hand, i.units_in_backroom, i.days_of_supply
        FROM retail_raw.inventory_snapshots i
        JOIN selected_pairs p USING (store_id, sku_id)
        """,
        pairs,
    )
    inventory["snapshot_date"] = pd.to_datetime(inventory["snapshot_date"])

    replenishment = _read_pair_table(
        config,
        """
        SELECT r.store_id, r.sku_id, r.replenishment_date, r.units_received, r.lead_time_actual
        FROM retail_raw.replenishment_logs r
        JOIN selected_pairs p USING (store_id, sku_id)
        """,
        pairs,
    )
    replenishment["replenishment_date"] = pd.to_datetime(replenishment["replenishment_date"])

    stockouts = _read_pair_table(
        config,
        """
        SELECT so.store_id, so.sku_id, so.stockout_date, so.estimated_lost_units, so.estimated_lost_revenue
        FROM retail_raw.stockout_events so
        JOIN selected_pairs p USING (store_id, sku_id)
        """,
        pairs,
    )
    stockouts["stockout_date"] = pd.to_datetime(stockouts["stockout_date"])

    products = read_sql(
        """
        SELECT sku_id, product_name, brand, category, subcategory, unit_price, unit_cost, is_perishable,
               supplier_id, reorder_point, safety_stock
        FROM retail_raw.products
        """,
        config,
    )
    stores = read_sql(
        """
        SELECT store_id, store_name, region, city, state, store_format, foot_traffic_tier
        FROM retail_raw.stores
        """,
        config,
    )

    df = _build_calendar(sales)
    df = _add_sales_features(df, sales)
    df = _add_inventory_features(df, inventory)
    df = _add_replenishment_features(df, replenishment)
    df = _add_stockout_features_and_target(df, stockouts, config["target"].get("horizons_days", config["target"]["horizon_days"]))
    df = _add_static_features(df, products, stores)
    return df
