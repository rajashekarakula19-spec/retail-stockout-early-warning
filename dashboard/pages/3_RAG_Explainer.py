from __future__ import annotations

import streamlit as st

from rag import ask_ollama, build_context
from ui import apply_theme, hero, section


st.set_page_config(page_title="RAG Explainer", layout="wide")
apply_theme()
hero(
    "RAG Explainer",
    "Ask Ollama to explain current data coverage, model performance, prediction drivers, and recommended stockout actions using local project context.",
)

with st.sidebar:
    model = st.text_input("Ollama model", value="llama3.2")
    host = st.text_input("Ollama host", value="http://localhost:11434")
    show_context = st.checkbox("Show retrieved context", value=False)

section("Suggested Analyst Questions")
q1, q2, q3 = st.columns(3)
with q1:
    if st.button("Summarize present data"):
        st.session_state["rag_question"] = "Summarize the present source data coverage, row counts, and modeling table sample."
with q2:
    if st.button("Explain model quality"):
        st.session_state["rag_question"] = "Explain the model results, focusing on recall, precision, PR-AUC, and confusion matrix tradeoffs."
with q3:
    if st.button("Recommend actions"):
        st.session_state["rag_question"] = "Explain which stockout actions the business should prioritize and why."

default_question = st.session_state.get(
    "rag_question",
    "Explain the current data coverage and what the model results say about stockout risk.",
)

section("Ask")
question = st.text_area(
    "Question",
    value=default_question,
    height=110,
)

if st.button("Ask Ollama"):
    with st.spinner("Retrieving local project context and asking Ollama..."):
        answer = ask_ollama(question, model=model, host=host)
    st.subheader("Answer")
    st.write(answer)

if show_context:
    st.subheader("Retrieved Context")
    st.text(build_context(question))
