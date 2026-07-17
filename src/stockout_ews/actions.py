from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from stockout_ews.modeling import dynamic_alert_threshold, risk_level_from_probability


def build_action_recommendations(result: dict, config: dict) -> pd.DataFrame:
    output_dir = Path(config["output_dir"])
    tables_dir = output_dir / "reports" / "tables"
    tables_dir.mkdir(parents=True, exist_ok=True)

    scored = result["test"].copy()
    scored["stockout_probability"] = result["scores"]
    scored["alert_threshold"] = scored.apply(lambda row: dynamic_alert_threshold(row, config), axis=1)
    scored["risk_level"] = [
        risk_level_from_probability(float(probability), float(threshold))
        for probability, threshold in zip(scored["stockout_probability"], scored["alert_threshold"])
    ]

    scored["estimated_lost_sales"] = (
        scored["avg_daily_demand_7d"].clip(lower=0)
        * scored["unit_price"].fillna(scored.get("unit_price", 0)).fillna(0)
        * config["target"]["horizon_days"]
        * scored["stockout_probability"]
    )
    reorder_gap = scored["reorder_point"].fillna(0) + scored["safety_stock"].fillna(0) - (
        scored["units_on_hand"].fillna(0) + scored["units_in_backroom"].fillna(0)
    )
    scored["recommended_quantity"] = np.ceil(reorder_gap.clip(lower=0)).astype(int)

    scored["recommended_action"] = np.select(
        [
            (scored["stockout_probability"] >= scored["alert_threshold"]) & (scored["computed_days_of_supply"] <= 3),
            (scored["stockout_probability"] >= scored["alert_threshold"]) & (scored["units_in_backroom"] > 0),
            scored["stockout_probability"] >= scored["alert_threshold"],
        ],
        [
            "Reorder immediately",
            "Move backroom inventory to shelf",
            "Review transfer or expedited replenishment",
        ],
        default="Monitor normal replenishment",
    )

    cols = [
        "date",
        "store_id",
        "store_name",
        "sku_id",
        "product_name",
        "category",
        "stockout_probability",
        "alert_threshold",
        "risk_level",
        "computed_days_of_supply",
        "units_on_hand",
        "units_in_backroom",
        "avg_daily_demand_7d",
        "estimated_lost_sales",
        "recommended_quantity",
        "recommended_action",
    ]
    available = [c for c in cols if c in scored.columns]
    recommendations = scored.sort_values("stockout_probability", ascending=False)[available].head(500)
    recommendations.to_csv(tables_dir / "stockout_action_recommendations.csv", index=False)
    return recommendations
