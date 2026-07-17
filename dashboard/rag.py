from __future__ import annotations

import json
from urllib import error, request

import pandas as pd

from data_utils import load_confusion_matrix, load_data_profile, load_metrics, load_recommendations, load_shap


def _table_to_context(name: str, df: pd.DataFrame, rows: int = 12) -> str:
    if df.empty:
        return f"{name}: no rows available."
    return f"{name}:\n{df.head(rows).to_csv(index=False)}"


def build_context(question: str) -> str:
    profile = load_data_profile()
    metrics = load_metrics()
    confusion = load_confusion_matrix()
    shap = load_shap()
    recommendations = load_recommendations()

    raw_summary = []
    for item in profile.get("raw_files", []):
        raw_summary.append(
            f"{item['label']}: {item['rows']:,} rows, {item['columns']} columns, "
            f"columns={', '.join(item['column_names'][:12])}"
        )
    processed = profile.get("processed_modeling_table", {})
    processed_summary = json.dumps(processed, indent=2)

    context_blocks = [
        "Present source data summary:\n" + "\n".join(raw_summary),
        "Processed modeling table summary:\n" + processed_summary,
        _table_to_context("Model evaluation metrics", metrics),
        _table_to_context("Confusion matrix", confusion.reset_index()),
        _table_to_context("Top SHAP drivers", shap.head(15)),
        _table_to_context("Top action recommendations", recommendations.head(15)),
    ]
    return "\n\n".join(context_blocks)


def ask_ollama(question: str, model: str = "llama3.2", host: str = "http://localhost:11434") -> str:
    context = build_context(question)
    prompt = f"""You are explaining a retail stockout early-warning project.

Use only the context below. Explain both present data and model results when relevant.
Be concise, business-friendly, and mention uncertainty when the sample/dashboard data is limited.

Context:
{context}

Question:
{question}

Answer:
"""
    payload = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8")
    req = request.Request(
        f"{host.rstrip('/')}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data.get("response", "Ollama returned no response.")
    except error.URLError as exc:
        return (
            "Could not reach Ollama. Start it with `ollama serve`, make sure the model is "
            f"available, then retry. Details: {exc}"
        )
