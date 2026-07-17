from __future__ import annotations

import altair as alt
import streamlit as st

from data_utils import FIGURES_DIR, load_confusion_matrix, load_metrics, load_recommendations, load_scored_rows, load_shap
from ui import PALETTE, apply_theme, bar_chart, format_feature_name, hero, section


st.set_page_config(page_title="Model Results", layout="wide")
apply_theme()
hero(
    "Model Results Dashboard",
    "Analyze predictive performance, understand risk drivers, and turn stockout probabilities into prioritized store-SKU actions.",
)

metrics = load_metrics()
recommendations = load_recommendations()
shap = load_shap()
confusion = load_confusion_matrix()
scored = load_scored_rows()

best = metrics.sort_values("f1", ascending=False).iloc[0]
c1, c2, c3, c4 = st.columns(4)
c1.metric("Best Model", best["model"])
c2.metric("Recall", f"{best['recall']:.3f}")
c3.metric("Precision", f"{best['precision']:.3f}")
c4.metric("PR-AUC", f"{best['pr_auc']:.3f}")

section("Model Comparison", "Recall is the priority because missed stockouts are costly, but precision keeps the alert queue manageable.")
metric_long = metrics.melt(id_vars=["model", "threshold"], value_vars=["recall", "precision", "f1", "pr_auc"], var_name="metric", value_name="score")
left, right = st.columns([1.4, 1])
with left:
    st.altair_chart(
        alt.Chart(metric_long)
        .mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3)
        .encode(
            x=alt.X("metric:N", title=None),
            y=alt.Y("score:Q", title="Score", scale=alt.Scale(domain=[0, 1])),
            color=alt.Color("model:N", scale=alt.Scale(range=[PALETTE["teal"], PALETTE["coral"]])),
            xOffset="model:N",
            tooltip=["model", "metric", alt.Tooltip("score:Q", format=".3f")],
        )
        .properties(height=330),
        width="stretch",
    )
with right:
    st.markdown("#### Confusion Matrix")
    st.dataframe(confusion, width="stretch")
    st.markdown("#### Metrics Table")
    st.dataframe(metrics, width="stretch", hide_index=True)

section("Prediction Drivers")
shap_view = shap.head(15).copy()
shap_view["driver"] = shap_view["feature"].map(format_feature_name)
st.altair_chart(
    bar_chart(
        shap_view.sort_values("mean_abs_shap"),
        "mean_abs_shap:Q",
        "driver:N",
        color=PALETTE["teal"],
        tooltip=["driver", alt.Tooltip("mean_abs_shap:Q", format=".3f")],
    ),
    width="stretch",
)

section("Risk Distribution and Inventory Pressure")
risk_left, risk_right = st.columns(2)
with risk_left:
    st.markdown("#### Stockout Probability Distribution")
    st.altair_chart(
        alt.Chart(scored)
        .mark_bar(color=PALETTE["blue"])
        .encode(
            x=alt.X("stockout_probability:Q", bin=alt.Bin(maxbins=30), title="Stockout Probability"),
            y=alt.Y("count():Q", title="Rows"),
            tooltip=[alt.Tooltip("count():Q", title="Rows")],
        )
        .properties(height=300),
        width="stretch",
    )
with risk_right:
    st.markdown("#### Days of Supply vs Risk")
    plot_df = scored.sample(min(5000, len(scored)), random_state=42).copy()
    plot_df["computed_days_of_supply"] = plot_df["computed_days_of_supply"].clip(upper=60)
    st.altair_chart(
        alt.Chart(plot_df)
        .mark_circle(size=42, opacity=0.45, color=PALETTE["coral"])
        .encode(
            x=alt.X("computed_days_of_supply:Q", title="Days of Supply, capped at 60"),
            y=alt.Y("stockout_probability:Q", title="Stockout Probability"),
            tooltip=["store_id", "sku_id", "product_name", "stockout_probability", "computed_days_of_supply"],
        )
        .properties(height=300),
        width="stretch",
    )

section("High-Risk Stockout Recommendations")
min_probability = st.slider("Minimum stockout probability", 0.0, 1.0, 0.75, 0.05)
filtered = recommendations[recommendations["stockout_probability"] >= min_probability]

action_left, action_right = st.columns(2)
action_counts = filtered["recommended_action"].value_counts().reset_index()
action_counts.columns = ["recommended_action", "rows"]
with action_left:
    st.markdown("#### Recommended Action Mix")
    if not action_counts.empty:
        st.altair_chart(
            bar_chart(action_counts.sort_values("rows"), "rows:Q", "recommended_action:N", color=PALETTE["green"]),
            width="stretch",
        )
with action_right:
    st.markdown("#### Risk by Category")
    category_risk = (
        filtered.groupby("category", as_index=False)
        .agg(avg_probability=("stockout_probability", "mean"), estimated_lost_sales=("estimated_lost_sales", "sum"))
        .sort_values("estimated_lost_sales", ascending=False)
        .head(12)
    )
    if not category_risk.empty:
        st.altair_chart(
            bar_chart(
                category_risk.sort_values("estimated_lost_sales"),
                "estimated_lost_sales:Q",
                "category:N",
                color=PALETTE["gold"],
                tooltip=["category", "avg_probability", "estimated_lost_sales"],
            ),
            width="stretch",
        )

st.markdown("#### Prioritized Worklist")
visible_cols = [
    "date",
    "store_name",
    "product_name",
    "category",
    "stockout_probability",
    "computed_days_of_supply",
    "units_on_hand",
    "units_in_backroom",
    "estimated_lost_sales",
    "recommended_quantity",
    "recommended_action",
]
st.dataframe(filtered[[c for c in visible_cols if c in filtered.columns]].head(150), width="stretch", hide_index=True)

section("Model Figures")
fig1 = FIGURES_DIR / "precision_recall_curve.png"
fig2 = FIGURES_DIR / "shap_summary.png"
cols = st.columns(2)
if fig1.exists():
    cols[0].image(str(fig1), caption="Precision-Recall Curve")
if fig2.exists():
    cols[1].image(str(fig2), caption="SHAP Summary")
