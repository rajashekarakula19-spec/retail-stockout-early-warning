from __future__ import annotations

import argparse
from pathlib import Path

from stockout_ews.actions import build_action_recommendations
from stockout_ews.config import load_config
from stockout_ews.db_features import build_modeling_table_from_db
from stockout_ews.explain import explain_xgboost
from stockout_ews.features import build_modeling_table
from stockout_ews.modeling import train_and_evaluate


def run(config_path: str) -> None:
    config = load_config(config_path)
    output_dir = Path(config["output_dir"])
    processed_dir = output_dir / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    if config.get("data_source") == "postgres":
        modeling_table = build_modeling_table_from_db(config)
    else:
        modeling_table = build_modeling_table(config)
    modeling_table.to_parquet(processed_dir / "modeling_table.parquet", index=False)

    result = train_and_evaluate(modeling_table, config)
    explain_xgboost(result, config)
    build_action_recommendations(result, config)

    metrics_path = output_dir / "reports" / "tables" / "evaluation_metrics.csv"
    recommendations_path = output_dir / "reports" / "tables" / "stockout_action_recommendations.csv"
    print(f"Pipeline complete. Metrics: {metrics_path}")
    print(f"Recommendations: {recommendations_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the retail stockout early-warning pipeline.")
    parser.add_argument("--config", default="config/project.yaml", help="Path to project YAML config.")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()
