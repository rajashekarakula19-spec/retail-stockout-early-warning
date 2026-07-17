from __future__ import annotations

import streamlit as st

from data_utils import build_data_profile, load_data_profile
from ui import apply_theme, hero, section


st.set_page_config(page_title="Retail Stockout Early-Warning", layout="wide")
apply_theme()

hero(
    "Retail Stockout Early-Warning",
    "A decision-support workspace for monitoring data coverage, interpreting model risk, and asking local Ollama for grounded explanations.",
)

profile = load_data_profile()
processed = profile.get("processed_modeling_table", {})

left, mid, right, fourth = st.columns(4)
left.metric("Raw Data Files", len(profile.get("raw_files", [])))
mid.metric("Modeling Rows", f"{processed.get('modeling_rows', 0):,}")
right.metric("Stores", f"{processed.get('stores', 0):,}")
fourth.metric("7-Day Risk Rate", f"{processed.get('target_rate', 0):.1%}")

section("Start Here")
cards = st.columns(3)
with cards[0]:
    st.markdown("### Data Stats")
    st.write("Inspect source-file scale, date coverage, sales trends, inventory position, and stockout patterns.")
    st.page_link("pages/1_Data_Stats.py", label="Open Data Stats")
with cards[1]:
    st.markdown("### Model Results")
    st.write("Analyze model quality, prediction drivers, risk distribution, and operational recommendations.")
    st.page_link("pages/2_Model_Results.py", label="Open Model Results")
with cards[2]:
    st.markdown("### RAG Explainer")
    st.write("Ask Ollama to explain present data and model outputs using local project context.")
    st.page_link("pages/3_RAG_Explainer.py", label="Open RAG Explainer")

if st.button("Refresh Data Profile"):
    build_data_profile()
    st.success("Data profile refreshed.")

st.markdown(
    '<span class="pill">Local files</span><span class="pill">XGBoost</span>'
    '<span class="pill">SHAP</span><span class="pill">Ollama RAG</span>',
    unsafe_allow_html=True,
)
