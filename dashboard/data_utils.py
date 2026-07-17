from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "config" / "project.yaml"
DATA_PROFILE_PATH = PROJECT_ROOT / "reports" / "tables" / "data_profile.json"
RAW_DATA_DIR = PROJECT_ROOT.parent / "output globeant" / "csv"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
TABLES_DIR = PROJECT_ROOT / "reports" / "tables"
FIGURES_DIR = PROJECT_ROOT / "reports" / "figures"

CORE_FILES = {
    "Sales Transactions": RAW_DATA_DIR / "sales_transactions.csv",
    "Inventory Snapshots": RAW_DATA_DIR / "inventory_snapshots.csv",
    "Replenishment Logs": RAW_DATA_DIR / "replenishment_logs.csv",
    "Stockout Events": RAW_DATA_DIR / "stockout_events.csv",
    "Products": RAW_DATA_DIR / "products.csv",
    "Stores": RAW_DATA_DIR / "stores.csv",
    "Suppliers": RAW_DATA_DIR / "suppliers.csv",
}


def read_csv_head(path: Path, rows: int = 2000) -> pd.DataFrame:
    return pd.read_csv(path, nrows=rows)


def _count_rows(path: Path) -> int:
    with path.open("rb") as handle:
        return max(sum(1 for _ in handle) - 1, 0)


def _profile_file(label: str, path: Path) -> dict:
    sample = read_csv_head(path, rows=5000)
    date_cols = [c for c in sample.columns if "date" in c.lower()]
    numeric_cols = sample.select_dtypes(include="number").columns.tolist()
    profile = {
        "label": label,
        "path": str(path),
        "rows": _count_rows(path),
        "columns": len(sample.columns),
        "column_names": sample.columns.tolist(),
        "numeric_columns": numeric_cols,
        "date_columns": date_cols,
        "missing_values_sample": sample.isna().sum().sort_values(ascending=False).head(10).to_dict(),
    }
    for col in date_cols[:3]:
        dates = pd.to_datetime(sample[col], errors="coerce")
        profile[f"{col}_sample_min"] = str(dates.min().date()) if dates.notna().any() else None
        profile[f"{col}_sample_max"] = str(dates.max().date()) if dates.notna().any() else None
    if numeric_cols:
        profile["numeric_summary_sample"] = (
            sample[numeric_cols].describe().round(2).fillna("").to_dict()
        )
    return profile


def build_data_profile() -> dict:
    files = {label: path for label, path in CORE_FILES.items() if path.exists()}
    profiles = [_profile_file(label, path) for label, path in files.items()]

    modeling = pd.read_parquet(PROCESSED_DIR / "modeling_table.parquet") if (PROCESSED_DIR / "modeling_table.parquet").exists() else pd.DataFrame()
    processed = {}
    if not modeling.empty:
        processed = {
            "modeling_rows": int(len(modeling)),
            "stores": int(modeling["store_id"].nunique()),
            "skus": int(modeling["sku_id"].nunique()),
            "date_min": str(modeling["date"].min().date()),
            "date_max": str(modeling["date"].max().date()),
            "target_rate": float(modeling["stockout_next_7d"].mean()),
            "avg_units_on_hand": float(modeling["units_on_hand"].mean()),
            "avg_days_of_supply": float(modeling["computed_days_of_supply"].replace(999, pd.NA).dropna().mean()),
            "total_units_sold": float(modeling["units_sold"].sum()),
        }

    profile = {"raw_files": profiles, "processed_modeling_table": processed}
    DATA_PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PROFILE_PATH.write_text(json.dumps(profile, indent=2), encoding="utf-8")
    return profile


def load_data_profile() -> dict:
    if DATA_PROFILE_PATH.exists():
        return json.loads(DATA_PROFILE_PATH.read_text(encoding="utf-8"))
    return build_data_profile()


def load_metrics() -> pd.DataFrame:
    return pd.read_csv(TABLES_DIR / "evaluation_metrics.csv")


def load_confusion_matrix() -> pd.DataFrame:
    return pd.read_csv(TABLES_DIR / "confusion_matrix.csv", index_col=0)


def load_shap() -> pd.DataFrame:
    return pd.read_csv(TABLES_DIR / "shap_feature_importance.csv")


def load_recommendations() -> pd.DataFrame:
    return pd.read_csv(TABLES_DIR / "stockout_action_recommendations.csv")


def load_scored_rows() -> pd.DataFrame:
    return pd.read_parquet(PROCESSED_DIR / "scored_test_rows.parquet")


def load_modeling_table() -> pd.DataFrame:
    return pd.read_parquet(PROCESSED_DIR / "modeling_table.parquet")
