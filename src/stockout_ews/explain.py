from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str((Path.cwd() / ".matplotlib-cache").resolve()))
os.environ.setdefault("MPLBACKEND", "Agg")

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import shap


def explain_xgboost(result: dict, config: dict, max_rows: int = 2000) -> None:
    output_dir = Path(config["output_dir"])
    tables_dir = output_dir / "reports" / "tables"
    figures_dir = output_dir / "reports" / "figures"
    tables_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    xgb = result["xgb"]
    features = result["features"]
    sample = result["test"][features].sample(
        min(max_rows, len(result["test"])),
        random_state=config.get("sample", {}).get("random_state", 42),
    )
    transformed = xgb.named_steps["prep"].transform(sample)
    if hasattr(transformed, "toarray"):
        transformed = transformed.toarray()
    feature_names = xgb.named_steps["prep"].get_feature_names_out()

    explainer = shap.TreeExplainer(xgb.named_steps["model"])
    shap_values = explainer.shap_values(transformed)
    if isinstance(shap_values, list):
        shap_values = shap_values[1] if len(shap_values) > 1 else shap_values[0]
    if getattr(shap_values, "ndim", 0) == 3:
        shap_values = shap_values[:, :, 1]

    importance = pd.DataFrame(
        {
            "feature": feature_names,
            "mean_abs_shap": abs(shap_values).mean(axis=0),
        }
    ).sort_values("mean_abs_shap", ascending=False)
    importance.to_csv(tables_dir / "shap_feature_importance.csv", index=False)

    shap.summary_plot(shap_values, transformed, feature_names=feature_names, show=False, max_display=20)
    plt.tight_layout()
    plt.savefig(figures_dir / "shap_summary.png", dpi=160)
    plt.close()
