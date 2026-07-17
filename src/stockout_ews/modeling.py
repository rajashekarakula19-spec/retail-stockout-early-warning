from __future__ import annotations

import os
from pathlib import Path

import joblib

os.environ.setdefault("MPLCONFIGDIR", str((Path.cwd() / ".matplotlib-cache").resolve()))
os.environ.setdefault("MPLBACKEND", "Agg")

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    PrecisionRecallDisplay,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

try:
    from xgboost import XGBClassifier
except Exception:
    XGBClassifier = None


TARGET = "stockout_next_7d"
ID_COLS = ["store_id", "sku_id", "date", "product_name", "store_name"]
NUMERIC_FEATURES = [
    "units_sold",
    "revenue",
    "promoted_sales_days",
    "sales_last_7d",
    "sales_last_14d",
    "avg_daily_demand_7d",
    "avg_daily_demand_14d",
    "units_on_hand",
    "units_in_backroom",
    "days_of_supply",
    "computed_days_of_supply",
    "recent_replenishment_qty",
    "days_since_last_replenishment",
    "avg_supplier_lead_time",
    "historical_stockout_frequency",
    "unit_price",
    "unit_cost",
    "reorder_point",
    "safety_stock",
]
CATEGORICAL_FEATURES = [
    "brand",
    "category",
    "subcategory",
    "is_perishable",
    "region",
    "store_format",
    "foot_traffic_tier",
]


def _feature_columns(df: pd.DataFrame) -> tuple[list[str], list[str]]:
    numeric = [c for c in NUMERIC_FEATURES if c in df.columns]
    categorical = [c for c in CATEGORICAL_FEATURES if c in df.columns]
    return numeric, categorical


def _preprocessor(numeric: list[str], categorical: list[str]) -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), numeric),
            ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), categorical),
        ],
        sparse_threshold=0,
    )


def split_by_date(df: pd.DataFrame, test_start_date: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    test_start = pd.Timestamp(test_start_date)
    train = df[df["date"] < test_start].copy()
    test = df[df["date"] >= test_start].copy()
    return train, test


def _evaluate(name: str, y_true: pd.Series, scores: np.ndarray, threshold: float) -> dict:
    preds = (scores >= threshold).astype(int)
    return {
        "model": name,
        "threshold": threshold,
        "recall": recall_score(y_true, preds, zero_division=0),
        "precision": precision_score(y_true, preds, zero_division=0),
        "f1": f1_score(y_true, preds, zero_division=0),
        "pr_auc": average_precision_score(y_true, scores),
    }


def _main_classifier(y_train: pd.Series, config: dict):
    if XGBClassifier is None:
        return "random_forest_fallback", RandomForestClassifier(
            n_estimators=250,
            min_samples_leaf=10,
            class_weight="balanced_subsample",
            n_jobs=-1,
            random_state=config.get("sample", {}).get("random_state", 42),
        )
    xgb_params = config["model"]["xgboost"]
    return "xgboost", XGBClassifier(
        **xgb_params,
        objective="binary:logistic",
        tree_method="hist",
        random_state=config.get("sample", {}).get("random_state", 42),
        scale_pos_weight=max((y_train == 0).sum() / max((y_train == 1).sum(), 1), 1),
    )


def dynamic_alert_threshold(row: pd.Series, config: dict) -> float:
    settings = config.get("model", {}).get("dynamic_thresholds", {})
    threshold = float(settings.get("base", config["model"]["high_risk_threshold"]))
    days_supply = float(row.get("computed_days_of_supply", 999) or 999)
    lead_time = float(row.get("avg_supplier_lead_time", 0) or 0)
    demand = float(row.get("avg_daily_demand_7d", 0) or 0)
    stockout_frequency = float(row.get("historical_stockout_frequency", 0) or 0)
    unit_price = float(row.get("unit_price", 0) or 0)

    if days_supply <= 3:
        threshold -= 0.15
    elif days_supply <= 7:
        threshold -= 0.08
    if lead_time >= 10:
        threshold -= 0.08
    elif lead_time >= 5:
        threshold -= 0.04
    if demand >= 20:
        threshold -= 0.05
    if stockout_frequency >= 0.08:
        threshold -= 0.06
    if unit_price >= 20:
        threshold -= 0.03

    threshold = max(float(settings.get("min", 0.25)), min(float(settings.get("max", 0.70)), threshold))
    return threshold


def risk_level_from_probability(probability: float, threshold: float) -> str:
    if probability >= min(0.90, threshold + 0.35):
        return "critical"
    if probability >= min(0.70, threshold + 0.18):
        return "high"
    if probability >= threshold:
        return "medium"
    return "low"


def train_and_evaluate(df: pd.DataFrame, config: dict) -> dict:
    output_dir = Path(config["output_dir"])
    models_dir = output_dir / "models"
    tables_dir = output_dir / "reports" / "tables"
    figures_dir = output_dir / "reports" / "figures"
    models_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    train, test = split_by_date(df, config["split"]["test_start_date"])
    numeric, categorical = _feature_columns(df)
    features = numeric + categorical
    threshold = config["model"]["high_risk_threshold"]

    X_train, y_train = train[features], train[TARGET]
    X_test, y_test = test[features], test[TARGET]

    logistic = Pipeline(
        [
            ("prep", _preprocessor(numeric, categorical)),
            ("model", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )
    logistic.fit(X_train, y_train)
    logistic_scores = logistic.predict_proba(X_test)[:, 1]

    main_model_name, main_model = _main_classifier(y_train, config)

    xgb = Pipeline(
        [
            ("prep", _preprocessor(numeric, categorical)),
            ("model", main_model),
        ]
    )
    xgb.fit(X_train, y_train)
    xgb_scores = xgb.predict_proba(X_test)[:, 1]

    metrics = pd.DataFrame(
        [
            _evaluate("logistic_regression", y_test, logistic_scores, threshold),
            _evaluate(main_model_name, y_test, xgb_scores, threshold),
        ]
    )
    metrics.to_csv(tables_dir / "evaluation_metrics.csv", index=False)

    cm = confusion_matrix(y_test, (xgb_scores >= threshold).astype(int), labels=[0, 1])
    pd.DataFrame(cm, index=["actual_0", "actual_1"], columns=["predicted_0", "predicted_1"]).to_csv(
        tables_dir / "confusion_matrix.csv"
    )

    PrecisionRecallDisplay.from_predictions(y_test, xgb_scores)
    plt.title(f"{main_model_name} Precision-Recall Curve")
    plt.tight_layout()
    plt.savefig(figures_dir / "precision_recall_curve.png", dpi=160)
    plt.close()

    joblib.dump(logistic, models_dir / "logistic_regression.joblib")
    joblib.dump(xgb, models_dir / "xgboost_stockout.joblib")

    scored = test[ID_COLS + features + [TARGET]].copy()
    scored["stockout_probability"] = xgb_scores
    scored["stockout_probability_7d"] = xgb_scores
    for horizon in config.get("target", {}).get("horizons_days", [3, 7, 14]):
        target_col = f"stockout_next_{horizon}d"
        probability_col = f"stockout_probability_{horizon}d"
        if target_col in test.columns and target_col not in scored.columns:
            scored[target_col] = test[target_col].values
        if horizon == 7:
            continue
        if target_col in train.columns and train[target_col].nunique() > 1:
            _, horizon_model = _main_classifier(train[target_col], config)
            horizon_pipeline = Pipeline(
                [
                    ("prep", _preprocessor(numeric, categorical)),
                    ("model", horizon_model),
                ]
            )
            horizon_pipeline.fit(X_train, train[target_col])
            scored[probability_col] = horizon_pipeline.predict_proba(X_test)[:, 1]
            joblib.dump(horizon_pipeline, models_dir / f"xgboost_stockout_{horizon}d.joblib")
        else:
            scored[probability_col] = xgb_scores
    scored["alert_threshold"] = scored.apply(lambda row: dynamic_alert_threshold(row, config), axis=1)
    scored["risk_level"] = [
        risk_level_from_probability(float(probability), float(threshold))
        for probability, threshold in zip(scored["stockout_probability"], scored["alert_threshold"])
    ]
    target_cols = [f"stockout_next_{horizon}d" for horizon in [3, 7, 14] if f"stockout_next_{horizon}d" in scored.columns]
    probability_cols = [
        col
        for col in ["stockout_probability", "stockout_probability_3d", "stockout_probability_7d", "stockout_probability_14d"]
        if col in scored.columns
    ]
    ordered_cols = ID_COLS + features + target_cols + probability_cols + ["alert_threshold", "risk_level"]
    scored = scored[[col for col in ordered_cols if col in scored.columns]]
    scored.to_parquet(output_dir / "data" / "processed" / "scored_test_rows.parquet", index=False)

    return {
        "logistic": logistic,
        "xgb": xgb,
        "features": features,
        "numeric": numeric,
        "categorical": categorical,
        "train": train,
        "test": test,
        "scores": xgb_scores,
        "metrics": metrics,
    }
