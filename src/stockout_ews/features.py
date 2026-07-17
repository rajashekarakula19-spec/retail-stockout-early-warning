from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


KEYS = ["store_id", "sku_id"]


def _read_csv(data_dir: Path, filename: str, parse_dates: list[str] | None = None) -> pd.DataFrame:
    return pd.read_csv(data_dir / filename, parse_dates=parse_dates)


def _pair_key_frame(pairs: pd.DataFrame) -> pd.DataFrame:
    pairs = pairs[KEYS].drop_duplicates().copy()
    pairs["_pair_key"] = pairs["store_id"] + "|" + pairs["sku_id"]
    return pairs


def _sample_pairs_from_sales(
    data_dir: Path,
    filename: str,
    max_pairs: int | None,
    random_state: int,
    max_skus_per_store: int | None = None,
) -> pd.DataFrame:
    chunks = pd.read_csv(data_dir / filename, usecols=KEYS, chunksize=1_000_000)
    pairs = pd.concat((chunk.drop_duplicates() for chunk in chunks), ignore_index=True).drop_duplicates()
    if max_skus_per_store:
        pairs = pairs.sample(frac=1, random_state=random_state).groupby("store_id", as_index=False).head(max_skus_per_store)
    if max_pairs and len(pairs) > max_pairs:
        pairs = pairs.sample(max_pairs, random_state=random_state)
    return pairs[KEYS].reset_index(drop=True)


def _limit_to_pairs(df: pd.DataFrame, pairs: pd.DataFrame) -> pd.DataFrame:
    return df.merge(pairs, on=KEYS, how="inner")


def _read_filtered_csv(
    data_dir: Path,
    filename: str,
    pairs: pd.DataFrame,
    parse_dates: list[str] | None = None,
    chunksize: int = 1_000_000,
) -> pd.DataFrame:
    pair_keys = set(_pair_key_frame(pairs)["_pair_key"])
    frames = []
    for chunk in pd.read_csv(data_dir / filename, parse_dates=parse_dates, chunksize=chunksize):
        chunk_key = chunk["store_id"] + "|" + chunk["sku_id"]
        matched = chunk[chunk_key.isin(pair_keys)]
        if not matched.empty:
            frames.append(matched)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _build_calendar(sales: pd.DataFrame) -> pd.DataFrame:
    bounds = sales.groupby(KEYS)["date"].agg(["min", "max"]).reset_index()
    rows = []
    for row in bounds.itertuples(index=False):
        dates = pd.date_range(row.min, row.max, freq="D")
        rows.append(pd.DataFrame({"store_id": row.store_id, "sku_id": row.sku_id, "date": dates}))
    return pd.concat(rows, ignore_index=True)


def _add_sales_features(base: pd.DataFrame, sales: pd.DataFrame) -> pd.DataFrame:
    daily_sales = sales.groupby(KEYS + ["date"], as_index=False).agg(
        units_sold=("units_sold", "sum"),
        revenue=("revenue", "sum"),
        promoted_sales_days=("is_promoted", "sum"),
    )
    df = base.merge(daily_sales, on=KEYS + ["date"], how="left")
    df[["units_sold", "revenue", "promoted_sales_days"]] = df[
        ["units_sold", "revenue", "promoted_sales_days"]
    ].fillna(0)

    df = df.sort_values(KEYS + ["date"])
    group = df.groupby(KEYS, group_keys=False)
    shifted_units = group["units_sold"].shift(1)
    df["sales_last_7d"] = shifted_units.groupby([df["store_id"], df["sku_id"]]).rolling(7, min_periods=1).sum().reset_index(level=[0, 1], drop=True)
    df["sales_last_14d"] = shifted_units.groupby([df["store_id"], df["sku_id"]]).rolling(14, min_periods=1).sum().reset_index(level=[0, 1], drop=True)
    df["avg_daily_demand_7d"] = df["sales_last_7d"] / 7
    df["avg_daily_demand_14d"] = df["sales_last_14d"] / 14
    return df.fillna({"sales_last_7d": 0, "sales_last_14d": 0, "avg_daily_demand_7d": 0, "avg_daily_demand_14d": 0})


def _add_inventory_features(df: pd.DataFrame, inventory: pd.DataFrame) -> pd.DataFrame:
    inv = inventory.rename(columns={"snapshot_date": "date"}).sort_values(KEYS + ["date"])
    inv = inv[KEYS + ["date", "units_on_hand", "units_in_backroom", "days_of_supply"]]
    out = df.merge(inv, on=KEYS + ["date"], how="left").sort_values(KEYS + ["date"])
    out[["units_on_hand", "units_in_backroom", "days_of_supply"]] = (
        out.groupby(KEYS)[["units_on_hand", "units_in_backroom", "days_of_supply"]].ffill()
    )
    out[["units_on_hand", "units_in_backroom"]] = out[["units_on_hand", "units_in_backroom"]].fillna(0)
    out["days_of_supply"] = out["days_of_supply"].fillna(out["units_on_hand"] / out["avg_daily_demand_7d"].replace(0, np.nan))
    out["computed_days_of_supply"] = (
        (out["units_on_hand"] + out["units_in_backroom"]) / out["avg_daily_demand_7d"].replace(0, np.nan)
    ).replace([np.inf, -np.inf], np.nan).fillna(999)
    return out


def _add_replenishment_features(df: pd.DataFrame, replenishment: pd.DataFrame) -> pd.DataFrame:
    repl = replenishment.rename(columns={"replenishment_date": "date"}).sort_values(KEYS + ["date"])
    daily = repl.groupby(KEYS + ["date"], as_index=False).agg(
        recent_replenishment_qty=("units_received", "sum"),
        avg_supplier_lead_time=("lead_time_actual", "mean"),
    )
    out = df.merge(daily, on=KEYS + ["date"], how="left").sort_values(KEYS + ["date"])
    out["recent_replenishment_qty"] = out["recent_replenishment_qty"].fillna(0)
    out["last_replenishment_date"] = out["date"].where(out["recent_replenishment_qty"] > 0)
    out["last_replenishment_date"] = out.groupby(KEYS)["last_replenishment_date"].ffill()
    out["days_since_last_replenishment"] = (out["date"] - out["last_replenishment_date"]).dt.days.fillna(999)
    out["avg_supplier_lead_time"] = out.groupby(KEYS)["avg_supplier_lead_time"].ffill().fillna(0)
    return out.drop(columns=["last_replenishment_date"])


def _add_stockout_features_and_target(df: pd.DataFrame, stockouts: pd.DataFrame, horizon_days: int | list[int]) -> pd.DataFrame:
    starts = stockouts.rename(columns={"stockout_date": "date"})
    starts = starts[KEYS + ["date", "estimated_lost_units", "estimated_lost_revenue"]]
    starts["stockout_start_today"] = 1
    out = df.merge(starts, on=KEYS + ["date"], how="left")
    out[["stockout_start_today", "estimated_lost_units", "estimated_lost_revenue"]] = out[
        ["stockout_start_today", "estimated_lost_units", "estimated_lost_revenue"]
    ].fillna(0)

    out = out.sort_values(KEYS + ["date"])
    horizons = horizon_days if isinstance(horizon_days, list) else [horizon_days]
    if 7 not in horizons:
        horizons = [*horizons, 7]
    for horizon in sorted(set(horizons)):
        future = out.groupby(KEYS)["stockout_start_today"].transform(
            lambda s, h=horizon: s.shift(-1).iloc[::-1].rolling(h, min_periods=1).max().iloc[::-1]
        )
        out[f"stockout_next_{horizon}d"] = future.fillna(0).astype(int)
    out["historical_stockout_frequency"] = (
        out.groupby(KEYS)["stockout_start_today"].cumsum() - out["stockout_start_today"]
    )
    out["historical_stockout_frequency"] = out["historical_stockout_frequency"] / (
        out.groupby(KEYS).cumcount().replace(0, np.nan)
    )
    out["historical_stockout_frequency"] = out["historical_stockout_frequency"].fillna(0)
    return out


def _add_static_features(df: pd.DataFrame, products: pd.DataFrame | None, stores: pd.DataFrame | None) -> pd.DataFrame:
    out = df
    if products is not None:
        product_cols = [
            "sku_id",
            "product_name",
            "brand",
            "category",
            "subcategory",
            "unit_price",
            "unit_cost",
            "is_perishable",
            "supplier_id",
            "reorder_point",
            "safety_stock",
        ]
        out = out.merge(products[[c for c in product_cols if c in products.columns]], on="sku_id", how="left")
    if stores is not None:
        store_cols = ["store_id", "store_name", "region", "city", "state", "store_format", "foot_traffic_tier"]
        out = out.merge(stores[[c for c in store_cols if c in stores.columns]], on="store_id", how="left")
    return out


def build_modeling_table(config: dict) -> pd.DataFrame:
    data_dir = Path(config["data_dir"])
    files = config["files"]
    pairs = _sample_pairs_from_sales(
        data_dir,
        files["sales"],
        config.get("sample", {}).get("max_store_sku_pairs"),
        config.get("sample", {}).get("random_state", 42),
        config.get("sample", {}).get("max_skus_per_store"),
    )
    sales = _read_filtered_csv(data_dir, files["sales"], pairs, ["sale_date"]).rename(columns={"sale_date": "date"})
    sales["is_promoted"] = sales["is_promoted"].astype(str).str.lower().eq("true").astype(int)

    inventory = _read_filtered_csv(data_dir, files["inventory"], pairs, ["snapshot_date"])
    replenishment = _read_filtered_csv(data_dir, files["replenishment"], pairs, ["replenishment_date", "order_date", "receive_date"])
    stockouts = _read_filtered_csv(data_dir, files["stockouts"], pairs, ["stockout_date", "restock_date"])

    products = _read_csv(data_dir, files["products"]) if "products" in files else None
    stores = _read_csv(data_dir, files["stores"]) if "stores" in files else None

    df = _build_calendar(sales)
    df = _add_sales_features(df, sales)
    df = _add_inventory_features(df, inventory)
    df = _add_replenishment_features(df, replenishment)
    df = _add_stockout_features_and_target(df, stockouts, config["target"].get("horizons_days", config["target"]["horizon_days"]))
    df = _add_static_features(df, products, stores)
    return df
