from __future__ import annotations

import altair as alt
import pandas as pd
import streamlit as st

from data_utils import CORE_FILES, build_data_profile, load_data_profile, load_modeling_table, read_csv_head
from ui import PALETTE, apply_theme, bar_chart, hero, line_chart, section


st.set_page_config(page_title="Data Stats", layout="wide")
apply_theme()
hero(
    "Available Data Stats",
    "Explore the current retail operations data before modeling: scale, coverage, sales behavior, inventory position, and stockout patterns.",
)

if st.button("Rebuild Data Profile"):
    build_data_profile()
    st.success("Profile rebuilt from source files.")

profile = load_data_profile()
processed = profile.get("processed_modeling_table", {})
modeling = load_modeling_table()

c1, c2, c3, c4 = st.columns(4)
c1.metric("Modeling Rows", f"{processed.get('modeling_rows', 0):,}")
c2.metric("Stores in Sample", f"{processed.get('stores', 0):,}")
c3.metric("SKUs in Sample", f"{processed.get('skus', 0):,}")
c4.metric("Stockout Target Rate", f"{processed.get('target_rate', 0):.1%}")

section("Raw File Inventory", "Row counts come from the available source CSV files; previews are sampled for speed.")
raw_df = pd.DataFrame(profile.get("raw_files", []))
if not raw_df.empty:
    chart_df = raw_df[["label", "rows", "columns"]].sort_values("rows", ascending=True)
    left, right = st.columns([1.4, 1])
    with left:
        st.altair_chart(
            bar_chart(chart_df, "rows:Q", "label:N", color=PALETTE["teal"], tooltip=["label", "rows", "columns"]),
            width="stretch",
        )
    with right:
        st.dataframe(
            raw_df[["label", "rows", "columns", "date_columns"]].sort_values("rows", ascending=False),
            width="stretch",
            hide_index=True,
        )

section("Operational Trends", "Daily behavior from the current modeling table sample.")
daily = (
    modeling.groupby("date", as_index=False)
    .agg(
        units_sold=("units_sold", "sum"),
        revenue=("revenue", "sum"),
        stockout_risk_rate=("stockout_next_7d", "mean"),
        avg_days_supply=("computed_days_of_supply", lambda s: s.replace(999, pd.NA).dropna().mean()),
    )
)
daily["stockout_risk_rate"] = daily["stockout_risk_rate"] * 100

trend_left, trend_right = st.columns(2)
with trend_left:
    st.markdown("#### Units Sold Over Time")
    st.altair_chart(line_chart(daily, "date:T", "units_sold:Q", color=PALETTE["blue"]), width="stretch")
with trend_right:
    st.markdown("#### 7-Day Stockout Risk Rate")
    st.altair_chart(line_chart(daily, "date:T", "stockout_risk_rate:Q", color=PALETTE["coral"]), width="stretch")

section("Where Demand and Risk Concentrate")
break_left, break_right = st.columns(2)
category = (
    modeling.groupby("category", as_index=False)
    .agg(units_sold=("units_sold", "sum"), risk_rate=("stockout_next_7d", "mean"))
    .sort_values("units_sold", ascending=False)
    .head(12)
)
category["risk_rate"] = category["risk_rate"] * 100
with break_left:
    st.markdown("#### Units Sold by Category")
    st.altair_chart(
        bar_chart(category.sort_values("units_sold"), "units_sold:Q", "category:N", color=PALETTE["green"]),
        width="stretch",
    )

store_risk = (
    modeling.groupby(["store_id", "store_name"], as_index=False)
    .agg(risk_rate=("stockout_next_7d", "mean"), avg_supply=("computed_days_of_supply", "mean"))
    .sort_values("risk_rate", ascending=False)
    .head(15)
)
store_risk["risk_rate"] = store_risk["risk_rate"] * 100
with break_right:
    st.markdown("#### Highest-Risk Stores in Sample")
    st.altair_chart(
        bar_chart(store_risk.sort_values("risk_rate"), "risk_rate:Q", "store_name:N", color=PALETTE["gold"]),
        width="stretch",
    )

section("Inventory Health")
inventory_view = modeling.copy()
inventory_view["supply_band"] = pd.cut(
    inventory_view["computed_days_of_supply"].clip(upper=60),
    bins=[-0.1, 3, 7, 14, 30, 60],
    labels=["0-3 days", "4-7 days", "8-14 days", "15-30 days", "31-60 days"],
)
supply = inventory_view.groupby("supply_band", observed=False).size().reset_index(name="rows")
st.altair_chart(
    alt.Chart(supply)
    .mark_bar(cornerRadiusTopLeft=3, cornerRadiusTopRight=3, color=PALETTE["teal"])
    .encode(x=alt.X("supply_band:N", title=None), y=alt.Y("rows:Q", title="Rows"), tooltip=["supply_band", "rows"])
    .properties(height=280),
    width="stretch",
)

section("File Preview")
selected = st.selectbox("Preview file", list(CORE_FILES.keys()))
path = CORE_FILES[selected]
if path.exists():
    sample = read_csv_head(path, rows=1000)
    st.caption(f"`{path.name}` sample: {len(sample):,} rows loaded for preview")
    st.dataframe(sample.head(100), width="stretch")

    numeric = sample.select_dtypes(include="number")
    if not numeric.empty:
        st.markdown("#### Numeric Summary")
        st.dataframe(numeric.describe().round(2), width="stretch")
else:
    st.warning(f"Missing file: {path}")
