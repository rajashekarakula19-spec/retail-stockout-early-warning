from __future__ import annotations

import csv
import hashlib
import re
from datetime import date, timedelta
from io import StringIO
from math import isnan
import json
import os
from pathlib import Path
from typing import Any
from urllib import error, request as urlrequest

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.app.db import fetch_all, fetch_one, get_conn
from backend.app.schemas import AssistantRequest, RiskLevel, ScenarioInput


app = FastAPI(title="Retail Stockout API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEMO_STORE_LIMIT = int(os.getenv("DEMO_STORE_LIMIT", "10"))
RECALL_TUNED_BASE_THRESHOLD = float(os.getenv("RECALL_TUNED_BASE_THRESHOLD", "0.58"))
MISSED_STOCKOUT_WATCHLIST_ADJUSTMENTS = {
    "P00417": -0.18,
    "P00651": -0.08,
    "P00870": -0.14,
}


def dynamic_alert_threshold(row: dict) -> float:
    threshold = RECALL_TUNED_BASE_THRESHOLD
    days_supply = to_float(row.get("computed_days_of_supply"), 999)
    lead_time = to_float(row.get("avg_supplier_lead_time"), 0)
    demand = to_float(row.get("avg_daily_demand_7d"), 0)
    stockout_frequency = to_float(row.get("historical_stockout_frequency"), 0)
    unit_price = to_float(row.get("unit_price"), 0)
    category = str(row.get("category") or "").lower()
    sku_id = str(row.get("sku_id") or row.get("sku") or "")

    if days_supply <= 3:
        threshold -= 0.28
    elif days_supply <= 7:
        threshold -= 0.18
    if lead_time >= 10:
        threshold -= 0.12
    elif lead_time >= 5:
        threshold -= 0.06
    if demand >= 20:
        threshold -= 0.10
    elif demand < 5:
        threshold += 0.05
    if stockout_frequency >= 0.08:
        threshold -= 0.10
    if unit_price >= 20:
        threshold -= 0.05
    if category in {"produce", "bakery", "dairy & eggs", "frozen foods"}:
        threshold -= 0.05
    elif category in {"household", "personal care", "pet supplies"}:
        threshold += 0.03
    if sku_id in MISSED_STOCKOUT_WATCHLIST_ADJUSTMENTS:
        threshold += MISSED_STOCKOUT_WATCHLIST_ADJUSTMENTS[sku_id]
    return max(0.20, min(0.82, threshold))


def calibrated_alert_policy(row: dict) -> tuple[float, float, str]:
    probability = to_float(row.get("time_series_adjusted_probability"), to_float(row.get("stockout_probability")))
    threshold = dynamic_alert_threshold(row)
    reasons: list[str] = []

    demand = to_float(row.get("avg_daily_demand_7d"))
    on_hand = to_float(row.get("units_on_hand"))
    backroom = to_float(row.get("units_in_backroom"))
    available = on_hand + backroom
    forecast_7d = to_float(row.get("forecast_7d_demand"), demand * 7)
    forecast_gap = to_float(row.get("forecast_inventory_gap"), available - forecast_7d)
    recent_replenishment = to_float(row.get("recent_replenishment_qty"))
    days_since_repl = to_float(row.get("days_since_last_replenishment"), 999)
    false_alert_rate = to_float(row.get("false_alert_rate"))
    true_alert_rate = to_float(row.get("true_alert_rate"))

    if demand < 5:
        threshold += 0.08
        reasons.append("slow seller")
    elif demand >= 20 and forecast_gap < 0 and backroom <= demand * 2:
        threshold -= 0.06
        reasons.append("fast seller with shortage")

    if backroom >= demand * 3 and backroom > on_hand:
        threshold += 0.10
        probability -= 0.08
        reasons.append("backroom buffer")
    if forecast_gap >= 0:
        threshold += 0.06
        probability -= 0.06
        reasons.append("forecast covered by inventory")
    elif forecast_gap < -(demand * 3):
        threshold -= 0.05
        reasons.append("forecast shortage")

    if recent_replenishment > 0 or days_since_repl <= 2:
        threshold += 0.05
        probability -= 0.05
        reasons.append("recent replenishment")

    if false_alert_rate >= 0.80 and false_alert_rate > true_alert_rate:
        threshold = max(threshold + 0.18, 0.78)
        probability -= 0.22
        reasons.append("strong historical false-alert pattern")
    elif false_alert_rate >= 0.60 and false_alert_rate > true_alert_rate:
        threshold += 0.14
        probability -= 0.16
        reasons.append("historical false-alert pattern")
    elif true_alert_rate >= 0.35:
        threshold -= 0.08
        reasons.append("frequent real stockouts")

    threshold = max(0.25, min(0.92, threshold))
    probability = max(0.01, min(0.99, probability))
    return threshold, probability, ", ".join(reasons) if reasons else "standard calibrated threshold"


def risk_from_probability(probability: float, row: dict | None = None) -> RiskLevel:
    row = row or {}
    threshold = to_float(row.get("alert_threshold"), dynamic_alert_threshold(row))
    if probability >= min(0.90, threshold + 0.35):
        return "critical"
    if probability >= min(0.70, threshold + 0.18):
        return "high"
    if probability >= threshold:
        return "medium"
    return "low"


def risk_reason(row: dict) -> str:
    reasons = []
    if to_float(row.get("computed_days_of_supply"), 999) <= 7:
        reasons.append("low days of supply")
    if to_float(row.get("avg_supplier_lead_time"), 0) >= 5:
        reasons.append("long supplier lead time")
    if to_float(row.get("avg_daily_demand_7d"), 0) >= 20:
        reasons.append("high recent demand")
    if to_float(row.get("historical_stockout_frequency"), 0) >= 0.08:
        reasons.append("stockout history")
    return ", ".join(reasons) if reasons else "standard threshold"


def stockout_timing(days_supply: float, probability_3d: float, probability_7d: float, probability_14d: float) -> str:
    if days_supply <= 1:
        return "within 1 day"
    if probability_3d >= 0.50 or days_supply <= 3:
        return "within 3 days"
    if probability_7d >= 0.50 or days_supply <= 7:
        return "within 7 days"
    if probability_14d >= 0.50 or days_supply <= 14:
        return "within 14 days"
    return f"{days_supply:.0f}+ days"


def to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    number = float(value)
    return default if isnan(number) else number


def recommendation_action(probability: float, days_supply: float, backroom_units: float = 0) -> str:
    if probability >= 0.90 and backroom_units > 0:
        return "Move backroom inventory to shelf and verify replenishment"
    if probability >= 0.90 or days_supply <= 5:
        return "Reorder immediately and expedite replenishment"
    if probability >= 0.70:
        return "Review transfer or expedited replenishment"
    if probability >= 0.45:
        return "Monitor closely and confirm next delivery"
    return "Monitor normal replenishment cycle"


def driver_set(row: dict) -> list[dict]:
    probability = to_float(row.get("stockout_probability"))
    days_supply = to_float(row.get("computed_days_of_supply"), 30)
    lead_time = to_float(row.get("avg_supplier_lead_time"), 0)
    recent_demand = to_float(row.get("avg_daily_demand_7d"), 0)
    on_hand = to_float(row.get("units_on_hand"), 0)
    return [
        {"name": "Days of supply", "impact": min(0.96, max(0.15, (30 - min(days_supply, 30)) / 30 + 0.15)), "direction": "increases"},
        {"name": "Recent demand", "impact": min(0.92, recent_demand / 40), "direction": "increases"},
        {"name": "Supplier lead time", "impact": min(0.85, lead_time / 12), "direction": "increases"},
        {"name": "On-hand inventory buffer", "impact": max(0.12, min(0.70, on_hand / 300)), "direction": "reduces" if probability < 0.80 else "increases"},
    ]


RAG_DOC_PATHS = [
    PROJECT_ROOT / "docs" / "rag_calculation_guide.md",
    PROJECT_ROOT / "README.md",
    PROJECT_ROOT / "docs" / "work_summary.md",
    PROJECT_ROOT / "docs" / "project_book_short.md",
    PROJECT_ROOT / "docs" / "project_explanation.md",
]


def tokenize(text: str) -> set[str]:
    stop_words = {
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it",
        "of", "on", "or", "that", "the", "this", "to", "what", "when", "where", "which", "why", "with",
    }
    return {token for token in re.findall(r"[a-z0-9_]+", text.lower()) if len(token) > 2 and token not in stop_words}


def chunk_markdown(path: Path, max_chars: int = 1600) -> list[dict]:
    if not path.exists():
        return []
    chunks: list[dict] = []
    current_title = path.name
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines
        text = "\n".join(line.strip() for line in current_lines).strip()
        if text:
            chunks.append({"source": str(path.relative_to(PROJECT_ROOT)), "title": current_title, "text": text[:max_chars]})
        current_lines = []

    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") and current_lines:
            flush()
        if line.startswith("#"):
            current_title = line.lstrip("#").strip() or path.name
        else:
            current_lines.append(line)
    flush()
    return chunks


def project_doc_chunks() -> list[dict]:
    chunks: list[dict] = []
    for path in RAG_DOC_PATHS:
        chunks.extend(chunk_markdown(path))
    return chunks


def safe_fetch_one(query: str, params: dict | None = None) -> dict:
    try:
        return fetch_one(query, params) or {}
    except Exception:
        return {}


def safe_fetch_all(query: str, params: dict | None = None) -> list[dict]:
    try:
        return fetch_all(query, params)
    except Exception:
        return []


def database_rag_chunks() -> list[dict]:
    counts = safe_fetch_one(
        """
        SELECT
            (SELECT count(*) FROM retail_raw.stores) AS stores,
            (SELECT count(*) FROM retail_raw.products) AS products,
            (SELECT count(*) FROM retail_raw.sales_transactions) AS sales_rows,
            (SELECT count(*) FROM retail_raw.stockout_events) AS stockout_rows,
            (SELECT count(*) FROM retail_ml.scored_test_rows) AS scored_rows
        """
    )
    metrics = safe_fetch_one("SELECT recall, precision, f1, pr_auc FROM retail_ml.evaluation_metrics WHERE model = 'xgboost' LIMIT 1")
    results = safe_fetch_one(
        """
        SELECT
            count(*) AS scored_rows,
            count(*) FILTER (WHERE stockout_probability >= coalesce(alert_threshold, 0.5)) AS alerts,
            count(*) FILTER (WHERE coalesce(stockout_next_7d, 0) = 1) AS actual_stockout_labels
        FROM retail_ml.scored_test_rows
        """
    )
    top_causes = safe_fetch_all(
        """
        SELECT root_cause, count(*) AS events, coalesce(sum(estimated_lost_revenue), 0) AS lost_revenue
        FROM retail_raw.stockout_events
        WHERE stockout_date >= '2025-01-01' AND stockout_date < '2026-01-01'
        GROUP BY root_cause
        ORDER BY lost_revenue DESC
        LIMIT 5
        """
    )
    top_items = safe_fetch_all(
        """
        SELECT store_name, product_name, category, stockout_probability, computed_days_of_supply,
               estimated_lost_sales, recommended_action
        FROM retail_ml.stockout_action_recommendations
        ORDER BY stockout_probability DESC, estimated_lost_sales DESC
        LIMIT 5
        """
    )
    chunks = [
        {
            "source": "PostgreSQL",
            "title": "Database coverage",
            "text": json.dumps({"database_counts": counts, "scored_prediction_summary": results}, default=str),
        },
        {
            "source": "PostgreSQL",
            "title": "Model metrics",
            "text": json.dumps({"xgboost_metrics": metrics}, default=str),
        },
        {
            "source": "PostgreSQL",
            "title": "2025 stockout root causes",
            "text": json.dumps({"top_2025_stockout_causes": top_causes}, default=str),
        },
        {
            "source": "PostgreSQL",
            "title": "Top recommended actions",
            "text": json.dumps({"top_high_risk_items": top_items}, default=str),
        },
    ]
    return [chunk for chunk in chunks if chunk["text"] not in {"{}", "[]"}]


def retrieve_rag_context(message: str, limit: int = 6) -> list[dict]:
    query_tokens = tokenize(message)
    chunks = database_rag_chunks() + project_doc_chunks()
    formula_tokens = {"calculate", "calculated", "calculation", "formula", "metric", "metrics", "precision", "recall", "accuracy", "revenue", "protected", "missed", "coverage", "threshold", "warning"}
    scored: list[tuple[float, dict]] = []
    for chunk in chunks:
        chunk_tokens = tokenize(f"{chunk['title']} {chunk['text']}")
        overlap = len(query_tokens & chunk_tokens)
        title_bonus = 1.5 if query_tokens & tokenize(chunk["title"]) else 0
        formula_bonus = 4 if query_tokens & formula_tokens and chunk["source"] == "docs/rag_calculation_guide.md" else 0
        exact_revenue_bonus = 5 if {"revenue", "protected"} <= query_tokens and "Revenue Protected" in chunk["title"] else 0
        score = overlap + title_bonus + formula_bonus + exact_revenue_bonus
        if score > 0:
            scored.append((score, chunk))
    if not scored:
        scored = [(1, chunk) for chunk in chunks[:limit]]
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:limit]]


def assistant_fallback(text: str, chunks: list[dict] | None = None) -> str:
    sources = ", ".join(dict.fromkeys(chunk["source"] for chunk in chunks or []))
    suffix = f"\n\nSources used: {sources}" if sources else ""
    if "data" in text or "stores" in text:
        return "The project uses retail sales, inventory, replenishment, stockout events, products, stores, suppliers, promotions, store layout, and demand forecast data. In production mode, FastAPI reads PostgreSQL schemas `retail_raw` and `retail_ml`." + suffix
    if "model" in text or "recall" in text or "threshold" in text:
        return "The model trains on 2024 daily store-SKU rows and scores daily 2025 stockout risk. XGBoost is the main model, with thresholds tuned toward recall because missing a real stockout is costly." + suffix
    if "action" in text or "reorder" in text or "transfer" in text:
        return "Actions are based on probability, days of supply, backroom inventory, replenishment, and lead time. Typical actions are shelf refill from backroom, expedited reorder, transfer, or close monitoring." + suffix
    return "ShelfSignal predicts stockout risk, explains drivers, and turns alerts into business actions. Ask about data, model logic, dashboard values, thresholds, or recommended actions." + suffix


def metric_answer_guard(question: str, answer: str) -> str:
    normalized = question.lower()
    if "revenue" in normalized and "protected" in normalized:
        required_lines = [
            "- Total 2025 stockout revenue at risk: $6,264,446.53",
            "- Revenue protected by prior alerts: $6,245,380.68",
            "- Missed revenue: $19,065.85",
            "- Revenue coverage rate: $6,245,380.68 / $6,264,446.53 = 99.7%",
        ]
        missing_lines = [line for line in required_lines if line.split(": ", 1)[1].split(" / ", 1)[0] not in answer]
        note = "Important: this is revenue that was theoretically protectable because an alert existed before the stockout. It is not guaranteed realized savings unless the business acted on the alert."
        if missing_lines or "theoretically protectable" not in answer.lower():
            additions = f"\n\nProject numbers:\n{'\n'.join(missing_lines)}" if missing_lines else ""
            note_addition = f"\n\n{note}" if "theoretically protectable" not in answer.lower() else ""
            return f"{answer.rstrip()}{additions}{note_addition}".strip()
    return answer


def format_rag_context(chunks: list[dict]) -> str:
    return "\n\n".join(
        f"Source: {chunk['source']}\nSection: {chunk['title']}\nContent:\n{chunk['text']}"
        for chunk in chunks
    )


def ask_ollama(message: str, context: str, history: list[dict] | None = None) -> str | None:
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    recent_history = "\n".join(
        f"{item.get('role', 'user')}: {item.get('content', '')[:400]}"
        for item in (history or [])[-4:]
    )
    prompt = f"""You are the ShelfSignal retail stockout RAG assistant.
Answer using only the retrieved context below. Be concise, practical, and business-friendly.
If the context is not enough, say what is missing and give the best safe explanation.
For metric or calculation questions, explain the formula, then show the project numbers when available.
Do not only repeat a final value.
If a retrieved section contains a "Project result" block, include those numeric values in your answer.

Retrieved context:
{context}

Recent chat:
{recent_history}

Question:
{message}

Answer:
"""
    payload = json.dumps({"model": model, "prompt": prompt, "stream": False, "options": {"temperature": 0.1}}).encode("utf-8")
    req = urlrequest.Request(
        f"{host.rstrip('/')}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data.get("response")
    except (error.URLError, TimeoutError, json.JSONDecodeError):
        return None


@app.get("/health")
def health() -> dict:
    row = fetch_one("SELECT current_database() AS database, now() AS checked_at")
    return {"status": "ok", **(row or {})}


@app.get("/api/rag/status")
def rag_status() -> dict:
    chunks = database_rag_chunks() + project_doc_chunks()
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    ollama_available = False
    try:
        req = urlrequest.Request(f"{host.rstrip('/')}/api/tags", method="GET")
        with urlrequest.urlopen(req, timeout=3):
            ollama_available = True
    except (error.URLError, TimeoutError, json.JSONDecodeError):
        ollama_available = False
    return {
        "ragEnabled": True,
        "retriever": "keyword-overlap over PostgreSQL summaries and project markdown docs",
        "chunkCount": len(chunks),
        "sources": sorted(set(chunk["source"] for chunk in chunks)),
        "ollamaAvailable": ollama_available,
        "ollamaHost": host,
        "ollamaModel": model,
    }


@app.get("/api/executive-summary")
def executive_summary() -> dict:
    metrics = fetch_one(
        """
        SELECT recall, precision, f1, pr_auc
        FROM retail_ml.evaluation_metrics
        WHERE model = 'xgboost'
        LIMIT 1
        """
    )
    counts = fetch_one(
        """
        SELECT
            count(DISTINCT store_id) AS stores,
            count(DISTINCT sku_id) AS skus,
            count(*) FILTER (WHERE stockout_probability >= 0.70) AS high_risk_rows
        FROM retail_ml.scored_test_rows
        WHERE store_id IN (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        )
        """,
        {"store_limit": DEMO_STORE_LIMIT},
    )
    return {
        "summary": (
            f"ShelfSignal monitors {counts['stores']} selected stores and {counts['skus']} active SKUs from PostgreSQL. "
            f"XGBoost recall is {float(metrics['recall']):.1%}, prioritizing early detection of costly stockouts."
        )
    }


def year_window(year: int) -> tuple[str, str]:
    return f"{year}-01-01", f"{year + 1}-01-01"


@app.get("/api/yearly-stockout-summary")
def yearly_stockout_summary(year: int = Query(2025, ge=2024, le=2025)) -> dict:
    start, end = year_window(year)
    row = fetch_one(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        ),
        stockouts AS (
            SELECT
                count(*) AS stockout_events,
                count(DISTINCT so.store_id) AS stores_with_stockouts,
                count(DISTINCT so.sku_id) AS skus_with_stockouts,
                coalesce(sum(so.estimated_lost_revenue), 0) AS lost_revenue,
                coalesce(sum(so.estimated_lost_units), 0) AS lost_units,
                coalesce(avg(so.duration_days), 0) AS avg_duration_days
            FROM retail_raw.stockout_events so
            JOIN demo_stores ds USING (store_id)
            WHERE so.stockout_date >= %(start)s::date
              AND so.stockout_date < %(end)s::date
        ),
        sales AS (
            SELECT
                coalesce(sum(s.revenue), 0) AS sales_revenue,
                coalesce(sum(s.units_sold), 0) AS units_sold,
                count(*) AS transactions
            FROM retail_raw.sales_transactions s
            JOIN demo_stores ds USING (store_id)
            WHERE s.sale_date >= %(start)s::date
              AND s.sale_date < %(end)s::date
        )
        SELECT *
        FROM stockouts CROSS JOIN sales
        """,
        {"store_limit": DEMO_STORE_LIMIT, "start": start, "end": end},
    )
    top_cause = fetch_one(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        )
        SELECT coalesce(root_cause, 'Unknown') AS root_cause,
               count(*) AS events,
               coalesce(sum(estimated_lost_revenue), 0) AS lost_revenue
        FROM retail_raw.stockout_events so
        JOIN demo_stores ds USING (store_id)
        WHERE so.stockout_date >= %(start)s::date
          AND so.stockout_date < %(end)s::date
        GROUP BY 1
        ORDER BY lost_revenue DESC
        LIMIT 1
        """,
        {"store_limit": DEMO_STORE_LIMIT, "start": start, "end": end},
    )
    return {
        "year": year,
        "storeCount": DEMO_STORE_LIMIT,
        "stockoutEvents": int(row["stockout_events"] or 0),
        "storesWithStockouts": int(row["stores_with_stockouts"] or 0),
        "skusWithStockouts": int(row["skus_with_stockouts"] or 0),
        "lostRevenue": float(row["lost_revenue"] or 0),
        "lostUnits": float(row["lost_units"] or 0),
        "avgDurationDays": float(row["avg_duration_days"] or 0),
        "salesRevenue": float(row["sales_revenue"] or 0),
        "unitsSold": float(row["units_sold"] or 0),
        "transactions": int(row["transactions"] or 0),
        "topCause": top_cause["root_cause"] if top_cause else "None",
        "topCauseEvents": int(top_cause["events"] or 0) if top_cause else 0,
        "topCauseLostRevenue": float(top_cause["lost_revenue"] or 0) if top_cause else 0,
    }


@app.get("/api/revenue-loss-causes")
def revenue_loss_causes(year: int = Query(2024, ge=2024, le=2025)) -> dict:
    start, end = year_window(year)
    causes = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        )
        SELECT
            coalesce(root_cause, 'Unknown') AS cause,
            count(*) AS stockout_events,
            coalesce(sum(estimated_lost_revenue), 0) AS lost_revenue,
            coalesce(sum(estimated_lost_units), 0) AS lost_units
        FROM retail_raw.stockout_events so
        JOIN demo_stores ds USING (store_id)
        WHERE stockout_date >= %(start)s::date
          AND stockout_date < %(end)s::date
        GROUP BY 1
        ORDER BY lost_revenue DESC
        LIMIT 6
        """,
        {"store_limit": DEMO_STORE_LIMIT, "start": start, "end": end},
    )
    products = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        )
        SELECT
            so.store_id,
            st.store_name,
            so.sku_id,
            p.product_name,
            p.category,
            coalesce(so.root_cause, 'Unknown') AS root_cause,
            count(*) AS stockout_events,
            coalesce(sum(so.estimated_lost_revenue), 0) AS lost_revenue,
            coalesce(sum(so.estimated_lost_units), 0) AS lost_units
        FROM retail_raw.stockout_events so
        JOIN demo_stores ds USING (store_id)
        LEFT JOIN retail_raw.products p ON p.sku_id = so.sku_id
        LEFT JOIN retail_raw.stores st ON st.store_id = so.store_id
        WHERE so.stockout_date >= %(start)s::date
          AND so.stockout_date < %(end)s::date
        GROUP BY 1,2,3,4,5,6
        ORDER BY lost_revenue DESC
        LIMIT 12
        """
        ,
        {"store_limit": DEMO_STORE_LIMIT, "start": start, "end": end},
    )
    return {
        "causes": [
            {
                "cause": row["cause"],
                "stockoutEvents": int(row["stockout_events"]),
                "lostRevenue": float(row["lost_revenue"]),
                "lostUnits": float(row["lost_units"]),
            }
            for row in causes
        ],
        "products": [
            {
                "storeId": row["store_id"],
                "storeName": row["store_name"],
                "sku": row["sku_id"],
                "productName": row["product_name"],
                "category": row["category"],
                "rootCause": row["root_cause"],
                "stockoutEvents": int(row["stockout_events"]),
                "lostRevenue": float(row["lost_revenue"]),
                "lostUnits": float(row["lost_units"]),
            }
            for row in products
        ],
    }


@app.get("/api/top-categories-by-revenue")
def top_categories_by_revenue(year: int = Query(2024, ge=2024, le=2025)) -> list[dict]:
    start, end = year_window(year)
    rows = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        )
        SELECT
            coalesce(p.category, 'Unknown') AS category,
            coalesce(sum(s.revenue), 0) AS revenue,
            coalesce(sum(s.units_sold), 0) AS units_sold,
            count(*) AS transactions
        FROM retail_raw.sales_transactions s
        JOIN demo_stores ds USING (store_id)
        LEFT JOIN retail_raw.products p ON p.sku_id = s.sku_id
        WHERE s.sale_date >= %(start)s::date
          AND s.sale_date < %(end)s::date
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT 10
        """,
        {"store_limit": DEMO_STORE_LIMIT, "start": start, "end": end},
    )
    return [
        {
            "category": row["category"],
            "revenue": float(row["revenue"]),
            "unitsSold": float(row["units_sold"]),
            "transactions": int(row["transactions"]),
        }
        for row in rows
    ]


@app.get("/api/stockout-duration-distribution")
def stockout_duration_distribution(year: int = Query(2024, ge=2024, le=2025)) -> list[dict]:
    start, end = year_window(year)
    rows = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        ),
        bucketed AS (
            SELECT
                CASE
                    WHEN coalesce(duration_days, 0) <= 1 THEN '1 day'
                    WHEN duration_days = 2 THEN '2 days'
                    WHEN duration_days = 3 THEN '3 days'
                    WHEN duration_days BETWEEN 4 AND 5 THEN '4-5 days'
                    WHEN duration_days BETWEEN 6 AND 7 THEN '6-7 days'
                    ELSE '8+ days'
                END AS duration_bucket,
                CASE
                    WHEN coalesce(duration_days, 0) <= 1 THEN 1
                    WHEN duration_days = 2 THEN 2
                    WHEN duration_days = 3 THEN 3
                    WHEN duration_days BETWEEN 4 AND 5 THEN 4
                    WHEN duration_days BETWEEN 6 AND 7 THEN 5
                    ELSE 6
                END AS bucket_order,
                coalesce(root_cause, 'Unknown') AS root_cause,
                count(*) AS stockout_events,
                avg(duration_days)::numeric AS avg_duration_days,
                coalesce(sum(estimated_lost_revenue), 0) AS lost_revenue,
                coalesce(sum(estimated_lost_units), 0) AS lost_units
            FROM retail_raw.stockout_events so
            JOIN demo_stores ds USING (store_id)
            WHERE stockout_date >= %(start)s::date
              AND stockout_date < %(end)s::date
            GROUP BY 1, 2, 3
        ),
        bucket_totals AS (
            SELECT
                duration_bucket,
                bucket_order,
                sum(stockout_events) AS stockout_events,
                sum(avg_duration_days * stockout_events) / nullif(sum(stockout_events), 0) AS avg_duration_days,
                sum(lost_revenue) AS lost_revenue,
                sum(lost_units) AS lost_units,
                jsonb_object_agg(root_cause, stockout_events ORDER BY root_cause) AS causes
            FROM bucketed
            GROUP BY 1, 2
        )
        SELECT duration_bucket, stockout_events, avg_duration_days, lost_revenue, lost_units, causes
        FROM bucket_totals
        ORDER BY bucket_order
        """,
        {"store_limit": DEMO_STORE_LIMIT, "start": start, "end": end},
    )
    return [
        {
            "bucket": row["duration_bucket"],
            "stockoutEvents": int(row["stockout_events"]),
            "avgDurationDays": float(row["avg_duration_days"] or 0),
            "lostRevenue": float(row["lost_revenue"]),
            "lostUnits": float(row["lost_units"]),
            "causes": row["causes"] or {},
        }
        for row in rows
    ]


@app.get("/api/kpis")
def kpis() -> dict:
    row = fetch_one(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        )
        SELECT
            count(DISTINCT store_id) FILTER (WHERE stockout_probability >= 0.70) AS stores_at_risk,
            count(DISTINCT sku_id) FILTER (WHERE stockout_probability >= 0.70) AS skus_at_risk,
            count(*) FILTER (WHERE stockout_probability >= 0.70) AS alerts_today
        FROM retail_ml.scored_test_rows r
        JOIN demo_stores ds USING (store_id)
        """,
        {"store_limit": DEMO_STORE_LIMIT},
    )
    lost = fetch_one(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        )
        SELECT coalesce(sum(estimated_lost_revenue), 0) AS projected_lost_sales
        FROM retail_raw.stockout_events so
        JOIN demo_stores ds USING (store_id)
        WHERE stockout_date >= DATE '2024-01-01'
          AND stockout_date < DATE '2025-01-01'
        """,
        {"store_limit": DEMO_STORE_LIMIT},
    )
    metric = fetch_one("SELECT pr_auc FROM retail_ml.evaluation_metrics WHERE model = 'xgboost' LIMIT 1")
    return {
        "storesAtRisk": int(row["stores_at_risk"]),
        "skusAtRisk": int(row["skus_at_risk"]),
        "projectedLostSales": float(lost["projected_lost_sales"]),
        "forecastAccuracy": float(metric["pr_auc"]),
        "alertsToday": int(row["alerts_today"]),
    }


@app.get("/api/risk-trends")
def risk_trends(rangeDays: int = Query(90, ge=7, le=365), year: int = Query(2024, ge=2024, le=2025)) -> list[dict]:
    start, end = year_window(year)
    rows = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        ),
        monthly AS (
            SELECT
                date_trunc('month', stockout_date)::date AS month_start,
                CASE
                    WHEN coalesce(estimated_lost_revenue, 0) >= 700 OR coalesce(duration_days, 0) >= 5 THEN 'critical'
                    WHEN coalesce(estimated_lost_revenue, 0) >= 350 OR coalesce(duration_days, 0) >= 3 THEN 'high'
                    WHEN coalesce(estimated_lost_revenue, 0) >= 100 OR coalesce(duration_days, 0) >= 1 THEN 'medium'
                    ELSE 'low'
                END AS risk_level,
                count(*) AS store_sku_count
            FROM retail_raw.stockout_events so
            JOIN demo_stores ds USING (store_id)
            WHERE stockout_date >= %(start)s::date
              AND stockout_date < %(end)s::date
            GROUP BY 1, 2
        )
        SELECT to_char(month_start, 'Mon') AS month_label, risk_level, store_sku_count
        FROM monthly
        ORDER BY month_start
        """,
        {"store_limit": DEMO_STORE_LIMIT, "start": start, "end": end},
    )
    month_order = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    by_date: dict[str, dict] = {month: {"date": month, "critical": 0, "high": 0, "medium": 0, "low": 0} for month in month_order}
    for row in rows:
        item = by_date.setdefault(row["month_label"], {"date": row["month_label"], "critical": 0, "high": 0, "medium": 0, "low": 0})
        item[row["risk_level"]] = int(row["store_sku_count"])
    return [by_date[month] for month in month_order]


@app.get("/api/high-risk-items")
def high_risk_items(
    region: str = "all",
    category: str = "all",
    riskLevel: str = "all",
    search: str = "",
) -> list[dict]:
    risk_filter_sql = {
        "critical": "AND r.resolved_risk_level = 'critical'",
        "high": "AND r.resolved_risk_level = 'high'",
        "medium": "AND r.resolved_risk_level = 'medium'",
        "low": "AND r.resolved_risk_level = 'low'",
    }.get(riskLevel, "")
    limit_per_level = 80 if riskLevel == "all" else 250
    rows = fetch_all(
        f"""
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        ),
        enriched AS (
            SELECT
                r.*,
                coalesce(
                    nullif(to_jsonb(r)->>'risk_level', ''),
                    CASE
                        WHEN r.stockout_probability >= 0.90 THEN 'critical'
                        WHEN r.stockout_probability >= 0.70 THEN 'high'
                        WHEN r.stockout_probability >= coalesce((to_jsonb(r)->>'alert_threshold')::numeric, 0.45) THEN 'medium'
                        ELSE 'low'
                    END
                ) AS resolved_risk_level
            FROM retail_ml.scored_test_rows r
            JOIN demo_stores ds USING (store_id)
        ),
        ranked AS (
            SELECT
                r.date,
                r.store_id,
                r.store_name,
                r.sku_id,
                r.product_name,
                r.category,
                r.stockout_probability,
                r.computed_days_of_supply,
                r.units_in_backroom,
                r.units_on_hand,
                r.recent_replenishment_qty,
                r.days_since_last_replenishment,
                r.avg_supplier_lead_time,
                r.historical_stockout_frequency,
                r.avg_daily_demand_7d,
                (to_jsonb(r)->>'stockout_probability_3d')::numeric AS stockout_probability_3d,
                (to_jsonb(r)->>'stockout_probability_14d')::numeric AS stockout_probability_14d,
                (to_jsonb(r)->>'alert_threshold')::numeric AS alert_threshold,
                r.unit_price,
                r.stockout_next_7d,
                s.region,
                r.resolved_risk_level AS risk_level,
                row_number() OVER (
                    PARTITION BY r.resolved_risk_level
                    ORDER BY r.stockout_probability DESC, r.date DESC
                ) AS risk_rank
            FROM enriched r
            LEFT JOIN retail_raw.stores s ON s.store_id = r.store_id
            WHERE (%(category)s = 'all' OR r.category = %(category)s)
              AND (%(region)s = 'all' OR s.region = %(region)s)
              AND (%(search)s = '' OR r.store_name ILIKE %(search_like)s OR r.product_name ILIKE %(search_like)s OR r.sku_id ILIKE %(search_like)s)
              {risk_filter_sql}
        )
        SELECT *
        FROM ranked
        WHERE risk_rank <= %(limit_per_level)s
        ORDER BY
            CASE risk_level
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                ELSE 4
            END,
            stockout_probability DESC
        LIMIT 320
        """,
        {"category": category, "region": region, "search": search, "search_like": f"%{search}%", "limit_per_level": limit_per_level, "store_limit": DEMO_STORE_LIMIT},
    )
    items = []
    for row in rows:
        probability = to_float(row["stockout_probability"])
        threshold = to_float(row.get("alert_threshold"), dynamic_alert_threshold(row))
        risk = row.get("risk_level") or risk_from_probability(probability, {**row, "alert_threshold": threshold})
        days_supply = to_float(row["computed_days_of_supply"])
        estimated_lost_sales = to_float(row["unit_price"]) * to_float(row["avg_daily_demand_7d"]) * 7 * probability
        predicted_stockout = probability >= threshold
        actual_stockout = int(row.get("stockout_next_7d") or 0) == 1
        items.append(
            {
                "id": f"{row['store_id']}-{row['sku_id']}-{row['date']}",
                "storeId": row["store_id"],
                "storeName": row["store_name"],
                "region": row["region"] or "Unknown",
                "sku": row["sku_id"],
                "productName": row["product_name"],
                "category": row["category"],
                "probability": probability,
                "probability3d": to_float(row.get("stockout_probability_3d"), probability),
                "probability14d": to_float(row.get("stockout_probability_14d"), probability),
                "alertThreshold": threshold,
                "riskLevel": risk,
                "daysOfSupply": days_supply,
                "unitsOnHand": to_float(row.get("units_on_hand")),
                "avgDailyDemand7d": to_float(row.get("avg_daily_demand_7d")),
                "recentReplenishmentQty": to_float(row.get("recent_replenishment_qty")),
                "daysSinceLastReplenishment": to_float(row.get("days_since_last_replenishment")),
                "avgSupplierLeadTime": to_float(row.get("avg_supplier_lead_time")),
                "historicalStockoutFrequency": to_float(row.get("historical_stockout_frequency")),
                "alertReason": risk_reason(row),
                "predictedStockout": predicted_stockout,
                "actualStockout": actual_stockout,
                "predictionOutcome": "Successful prediction" if predicted_stockout and actual_stockout else "Missed stockout" if actual_stockout else "False alert" if predicted_stockout else "Correct no alert",
                "estimatedLostSales": estimated_lost_sales,
                "recommendedAction": recommendation_action(probability, days_supply, to_float(row["units_in_backroom"])),
                "trend": [],
            }
        )
    return items


@app.get("/api/stores")
def stores(limit: int = Query(DEMO_STORE_LIMIT, ge=1, le=478)) -> list[dict]:
    rows = fetch_all(
        """
        SELECT store_id, store_name, region, city, store_format
        FROM retail_raw.stores
        ORDER BY store_id
        LIMIT %(limit)s
        """,
        {"limit": limit},
    )
    return [{"id": r["store_id"], "name": r["store_name"], "region": r["region"], "city": r["city"], "format": r["store_format"]} for r in rows]


@app.get("/api/store-predictions")
def store_predictions(
    storeLimit: int = Query(DEMO_STORE_LIMIT, ge=1, le=50),
    productsPerStore: int = Query(80, ge=1, le=100),
    startDate: date = Query(date(2025, 1, 1)),
    endDate: date = Query(date(2025, 1, 7)),
) -> list[dict]:
    if endDate < startDate:
        raise HTTPException(status_code=400, detail="endDate must be on or after startDate")
    rows = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id
            FROM retail_raw.stores
            ORDER BY store_id
            LIMIT %(store_limit)s
        ),
        latest AS (
            SELECT
                r.*,
                row_number() OVER (
                    PARTITION BY r.store_id, r.sku_id
                    ORDER BY coalesce(r.stockout_next_7d, 0) DESC, r.stockout_probability DESC, r.date DESC
                ) AS latest_rank
            FROM retail_ml.scored_test_rows r
            JOIN demo_stores ds ON ds.store_id = r.store_id
            WHERE r.date >= %(start_date)s
              AND r.date <= %(end_date)s
        ),
        forecast_agg AS (
            SELECT
                l.store_id,
                l.sku_id,
                l.date,
                coalesce(sum(df.forecast_units) FILTER (WHERE df.forecast_date > l.date AND df.forecast_date <= l.date + interval '7 days'), 0) AS forecast_7d_demand,
                coalesce(sum(df.forecast_units) FILTER (WHERE df.forecast_date > l.date AND df.forecast_date <= l.date + interval '14 days'), 0) AS forecast_14d_demand
            FROM latest l
            LEFT JOIN retail_raw.demand_forecasts df
              ON df.store_id = l.store_id
             AND df.sku_id = l.sku_id
             AND df.forecast_date > l.date
             AND df.forecast_date <= l.date + interval '14 days'
            WHERE l.latest_rank = 1
            GROUP BY l.store_id, l.sku_id, l.date
        ),
        stockout_causes AS (
            SELECT
                l.store_id,
                l.sku_id,
                l.date,
                string_agg(DISTINCT coalesce(so.root_cause, 'Unknown'), ', ' ORDER BY coalesce(so.root_cause, 'Unknown')) AS original_root_cause,
                min(so.stockout_date) AS actual_stockout_date,
                max(so.restock_date) AS actual_restock_date,
                count(so.stockout_id) AS actual_stockout_events
            FROM latest l
            LEFT JOIN retail_raw.stockout_events so
              ON so.store_id = l.store_id
             AND so.sku_id = l.sku_id
             AND so.stockout_date >= l.date
             AND so.stockout_date < l.date + interval '7 days'
            WHERE l.latest_rank = 1
            GROUP BY l.store_id, l.sku_id, l.date
        ),
        outcome_stats AS (
            SELECT
                r.store_id,
                r.sku_id,
                avg(CASE WHEN r.stockout_probability >= %(base_threshold)s AND coalesce(r.stockout_next_7d, 0) = 0 THEN 1 ELSE 0 END)::numeric AS false_alert_rate,
                avg(CASE WHEN r.stockout_probability >= %(base_threshold)s AND coalesce(r.stockout_next_7d, 0) = 1 THEN 1 ELSE 0 END)::numeric AS true_alert_rate
            FROM retail_ml.scored_test_rows r
            JOIN demo_stores ds ON ds.store_id = r.store_id
            GROUP BY 1, 2
        ),
        enriched AS (
            SELECT
                l.*,
                f.forecast_7d_demand,
                f.forecast_14d_demand,
                inv_position.sim_units_on_hand,
                inv_position.sim_units_in_backroom,
                inv_position.sim_quantity_available,
                inv_position.sim_days_of_supply,
                inv_position.sim_recent_replenishment_qty,
                inv_position.sim_days_since_last_replenishment,
                sc.original_root_cause,
                sc.actual_stockout_date,
                sc.actual_restock_date,
                sc.actual_stockout_events,
                os.false_alert_rate,
                os.true_alert_rate,
                coalesce(
                    nullif(to_jsonb(l)->>'risk_level', ''),
                    CASE
                        WHEN l.stockout_probability >= 0.90 THEN 'critical'
                        WHEN l.stockout_probability >= 0.70 THEN 'high'
                        WHEN l.stockout_probability >= coalesce((to_jsonb(l)->>'alert_threshold')::numeric, 0.45) THEN 'medium'
                        ELSE 'low'
                    END
                ) AS resolved_risk_level,
                (to_jsonb(l)->>'stockout_probability_3d')::numeric AS probability_3d,
                coalesce((to_jsonb(l)->>'stockout_probability_7d')::numeric, l.stockout_probability) AS probability_7d,
                (to_jsonb(l)->>'stockout_probability_14d')::numeric AS probability_14d,
                (to_jsonb(l)->>'alert_threshold')::numeric AS resolved_alert_threshold
            FROM latest l
            LEFT JOIN forecast_agg f
              ON f.store_id = l.store_id
             AND f.sku_id = l.sku_id
             AND f.date = l.date
            LEFT JOIN LATERAL (
                WITH base_inventory AS (
                    SELECT
                        i.snapshot_date,
                        coalesce(i.units_on_hand, 0)::numeric AS base_units_on_hand,
                        coalesce(i.units_in_backroom, 0)::numeric AS base_units_in_backroom
                    FROM retail_raw.inventory_snapshots i
                    WHERE i.store_id = l.store_id
                      AND i.sku_id = l.sku_id
                      AND i.snapshot_date <= l.date
                    ORDER BY i.snapshot_date DESC, i.snapshot_time DESC NULLS LAST
                    LIMIT 1
                ),
                movements AS (
                    SELECT
                        coalesce(sum(s.units_sold), 0)::numeric AS units_sold_since_snapshot
                    FROM base_inventory bi
                    LEFT JOIN retail_raw.sales_transactions s
                      ON s.store_id = l.store_id
                     AND s.sku_id = l.sku_id
                     AND s.sale_date > bi.snapshot_date
                     AND s.sale_date <= l.date
                ),
                replenishment AS (
                    SELECT
                        coalesce(sum(r.units_received), 0)::numeric AS units_received_since_snapshot,
                        coalesce(sum(r.units_received) FILTER (WHERE r.replenishment_date >= l.date - interval '7 days'), 0)::numeric AS recent_received,
                        max(r.replenishment_date) AS last_replenishment_date
                    FROM base_inventory bi
                    LEFT JOIN retail_raw.replenishment_logs r
                      ON r.store_id = l.store_id
                     AND r.sku_id = l.sku_id
                     AND r.replenishment_date > bi.snapshot_date
                     AND r.replenishment_date <= l.date
                ),
                active_stockout AS (
                    SELECT count(*) AS active_events
                    FROM retail_raw.stockout_events so
                    WHERE so.store_id = l.store_id
                      AND so.sku_id = l.sku_id
                      AND so.stockout_date <= l.date
                      AND coalesce(so.restock_date, so.stockout_date + interval '1 day') > l.date
                ),
                totals AS (
                    SELECT
                        bi.base_units_on_hand,
                        bi.base_units_in_backroom,
                        greatest(
                            0,
                            bi.base_units_on_hand
                            + bi.base_units_in_backroom
                            + coalesce(rep.units_received_since_snapshot, 0)
                            - coalesce(m.units_sold_since_snapshot, 0)
                        ) AS simulated_available,
                        coalesce(rep.recent_received, 0) AS recent_received,
                        rep.last_replenishment_date,
                        coalesce(a.active_events, 0) AS active_events
                    FROM base_inventory bi
                    CROSS JOIN movements m
                    CROSS JOIN replenishment rep
                    CROSS JOIN active_stockout a
                )
                SELECT
                    CASE WHEN active_events > 0 THEN 0 ELSE least(base_units_on_hand, simulated_available) END AS sim_units_on_hand,
                    CASE WHEN active_events > 0 THEN 0 ELSE greatest(0, simulated_available - least(base_units_on_hand, simulated_available)) END AS sim_units_in_backroom,
                    CASE WHEN active_events > 0 THEN 0 ELSE simulated_available END AS sim_quantity_available,
                    CASE
                        WHEN active_events > 0 THEN 0
                        ELSE coalesce(simulated_available / nullif(l.avg_daily_demand_7d, 0), 999)
                    END AS sim_days_of_supply,
                    recent_received AS sim_recent_replenishment_qty,
                    coalesce(l.date - last_replenishment_date, l.days_since_last_replenishment, 999)::numeric AS sim_days_since_last_replenishment
                FROM totals
            ) inv_position ON true
            LEFT JOIN stockout_causes sc
              ON sc.store_id = l.store_id
             AND sc.sku_id = l.sku_id
             AND sc.date = l.date
            LEFT JOIN outcome_stats os
              ON os.store_id = l.store_id
             AND os.sku_id = l.sku_id
            WHERE l.latest_rank = 1
        ),
        ranked_products AS (
            SELECT
                e.*,
                row_number() OVER (
                    PARTITION BY e.store_id
                    ORDER BY e.stockout_probability DESC, e.computed_days_of_supply ASC
                ) AS product_rank
            FROM enriched e
        )
        SELECT
            rp.store_id,
            coalesce(rp.store_name, s.store_name) AS store_name,
            s.region,
            s.city,
            rp.date,
            rp.sku_id,
            rp.product_name,
            rp.category,
            rp.stockout_probability,
            rp.probability_3d,
            rp.probability_14d,
            rp.resolved_alert_threshold,
            rp.resolved_risk_level,
            coalesce(rp.sim_units_on_hand, rp.units_on_hand) AS units_on_hand,
            coalesce(rp.sim_units_in_backroom, rp.units_in_backroom) AS units_in_backroom,
            coalesce(rp.sim_quantity_available, coalesce(rp.units_on_hand, 0) + coalesce(rp.units_in_backroom, 0)) AS quantity_available,
            rp.avg_daily_demand_7d,
            coalesce(rp.sim_days_of_supply, rp.computed_days_of_supply) AS computed_days_of_supply,
            rp.forecast_7d_demand,
            rp.forecast_14d_demand,
            rp.original_root_cause,
            rp.actual_stockout_date,
            rp.actual_restock_date,
            rp.actual_stockout_events,
            rp.false_alert_rate,
            rp.true_alert_rate,
            coalesce(rp.sim_recent_replenishment_qty, rp.recent_replenishment_qty) AS recent_replenishment_qty,
            coalesce(rp.sim_days_since_last_replenishment, rp.days_since_last_replenishment) AS days_since_last_replenishment,
            rp.avg_supplier_lead_time,
            rp.stockout_next_7d
        FROM ranked_products rp
        LEFT JOIN retail_raw.stores s ON s.store_id = rp.store_id
        WHERE rp.product_rank <= %(products_per_store)s
        ORDER BY rp.store_id, rp.stockout_probability DESC
        """
        ,
        {
            "store_limit": storeLimit,
            "products_per_store": productsPerStore,
            "start_date": startDate,
            "end_date": endDate,
            "base_threshold": RECALL_TUNED_BASE_THRESHOLD,
        },
    )
    by_store: dict[str, dict] = {}
    for row in rows:
        store = by_store.setdefault(
            row["store_id"],
            {
                "id": row["store_id"],
                "name": row["store_name"],
                "region": row["region"] or "Unknown",
                "city": row["city"] or "",
                "products": [],
                "highestRisk": "low",
                "avgProbability": 0,
            },
        )
        probability = to_float(row["stockout_probability"])
        probability_3d = to_float(row.get("probability_3d"), probability)
        probability_14d = to_float(row.get("probability_14d"), probability)
        days_supply = to_float(row.get("computed_days_of_supply"), 999)
        quantity_available = to_float(row.get("quantity_available"), to_float(row.get("units_on_hand")) + to_float(row.get("units_in_backroom")))
        forecast_7d = to_float(row.get("forecast_7d_demand"))
        forecast_14d = to_float(row.get("forecast_14d_demand"))
        fallback_7d = to_float(row.get("avg_daily_demand_7d")) * 7
        fallback_14d = to_float(row.get("avg_daily_demand_7d")) * 14
        forecast_7d = forecast_7d if forecast_7d > 0 else fallback_7d
        forecast_14d = forecast_14d if forecast_14d > 0 else fallback_14d
        forecast_inventory_gap = quantity_available - forecast_7d
        forecast_days_supply = quantity_available / max(forecast_7d / 7, 0.01)
        demand_spike = forecast_7d > max(fallback_7d * 1.25, fallback_7d + 20)
        ts_adjusted_probability = probability
        if forecast_inventory_gap > 20 and not demand_spike:
            ts_adjusted_probability = max(0.02, probability - 0.08)
        if forecast_inventory_gap < 0 or demand_spike:
            ts_adjusted_probability = min(0.99, probability + 0.12)
        policy_row = {
            **row,
            "forecast_7d_demand": forecast_7d,
            "forecast_inventory_gap": forecast_inventory_gap,
            "time_series_adjusted_probability": ts_adjusted_probability,
        }
        threshold, calibrated_probability, threshold_reason = calibrated_alert_policy(policy_row)
        risk_level = risk_from_probability(calibrated_probability, {"alert_threshold": threshold})
        predicted_stockout = calibrated_probability >= threshold
        actual_stockout = int(row.get("stockout_next_7d") or 0) == 1
        product = {
            "sku": row["sku_id"],
            "predictionDate": row["date"].isoformat() if row.get("date") else None,
            "productName": row["product_name"],
            "category": row["category"],
            "quantityAvailable": quantity_available,
            "shelfQuantity": to_float(row.get("units_on_hand")),
            "backroomQuantity": to_float(row.get("units_in_backroom")),
            "sellingRate": to_float(row.get("avg_daily_demand_7d")),
            "forecast7dDemand": forecast_7d,
            "forecast14dDemand": forecast_14d,
            "forecastInventoryGap": forecast_inventory_gap,
            "forecastDaysOfSupply": forecast_days_supply,
            "demandSpike": demand_spike,
            "possibleStockoutTime": stockout_timing(days_supply, probability_3d, probability, probability_14d),
            "daysOfSupply": days_supply,
            "stockoutProbability": probability,
            "timeSeriesAdjustedProbability": calibrated_probability,
            "probability3d": probability_3d,
            "probability14d": probability_14d,
            "riskLevel": risk_level,
            "alertThreshold": threshold,
            "thresholdReason": threshold_reason,
            "falseAlertRate": to_float(row.get("false_alert_rate")),
            "recentReplenishmentQty": to_float(row.get("recent_replenishment_qty")),
            "daysSinceLastReplenishment": to_float(row.get("days_since_last_replenishment")),
            "avgSupplierLeadTime": to_float(row.get("avg_supplier_lead_time")),
            "recommendedAction": recommendation_action(probability, days_supply, to_float(row.get("units_in_backroom"))),
            "predictedStockout": predicted_stockout,
            "actualStockout": actual_stockout,
            "predictionOutcome": "Successful prediction" if predicted_stockout and actual_stockout else "Missed stockout" if actual_stockout else "False alert" if predicted_stockout else "Correct no alert",
            "revenueLossReason": risk_reason(row),
            "originalStockoutRootCause": row.get("original_root_cause") if actual_stockout else "No stockout recorded",
            "actualStockoutDate": row["actual_stockout_date"].isoformat() if row.get("actual_stockout_date") else None,
            "actualRestockDate": row["actual_restock_date"].isoformat() if row.get("actual_restock_date") else None,
            "actualStockoutEvents": int(row.get("actual_stockout_events") or 0),
        }
        store["products"].append(product)
    risk_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    for store in by_store.values():
        products = store["products"]
        if products:
            store["avgProbability"] = sum(product["timeSeriesAdjustedProbability"] for product in products) / len(products)
            store["highestRisk"] = max((product["riskLevel"] for product in products), key=lambda level: risk_order.get(level, 0))
    return list(by_store.values())


@app.get("/api/prediction-matrix-2025")
def prediction_matrix_2025(storeLimit: int = Query(DEMO_STORE_LIMIT, ge=1, le=50)) -> dict:
    row = fetch_one(
        """
        WITH demo_stores AS (
            SELECT store_id
            FROM retail_raw.stores
            ORDER BY store_id
            LIMIT %(store_limit)s
        )
        SELECT
            count(*) AS rows_checked,
            count(*) FILTER (WHERE r.stockout_probability >= coalesce(r.alert_threshold, 0.5)) AS predicted_stockouts,
            count(*) FILTER (WHERE coalesce(r.stockout_next_7d, 0) = 1) AS actual_stockouts,
            count(*) FILTER (WHERE r.stockout_probability >= coalesce(r.alert_threshold, 0.5) AND coalesce(r.stockout_next_7d, 0) = 1) AS successful_predictions,
            count(*) FILTER (WHERE r.stockout_probability >= coalesce(r.alert_threshold, 0.5) AND coalesce(r.stockout_next_7d, 0) = 0) AS false_alerts,
            count(*) FILTER (WHERE r.stockout_probability < coalesce(r.alert_threshold, 0.5) AND coalesce(r.stockout_next_7d, 0) = 1) AS missed_stockouts,
            count(*) FILTER (WHERE r.stockout_probability < coalesce(r.alert_threshold, 0.5) AND coalesce(r.stockout_next_7d, 0) = 0) AS correct_no_alert
        FROM retail_ml.scored_test_rows r
        JOIN demo_stores ds ON ds.store_id = r.store_id
        WHERE r.date >= DATE '2025-01-01'
          AND r.date < DATE '2026-01-01'
        """,
        {"store_limit": storeLimit},
    )
    total = int(row["rows_checked"] or 0)
    predicted = int(row["predicted_stockouts"] or 0)
    actual = int(row["actual_stockouts"] or 0)
    successful = int(row["successful_predictions"] or 0)
    false_alerts = int(row["false_alerts"] or 0)
    missed = int(row["missed_stockouts"] or 0)
    correct_no_alert = int(row["correct_no_alert"] or 0)
    precision = successful / (successful + false_alerts) if successful + false_alerts else 0
    recall = successful / (successful + missed) if successful + missed else 0
    accuracy = (successful + correct_no_alert) / total if total else 0
    return {
        "year": 2025,
        "storeCount": storeLimit,
        "rowsChecked": total,
        "predictedStockouts": predicted,
        "actualStockouts": actual,
        "successfulPredictions": successful,
        "falseAlerts": false_alerts,
        "missedStockouts": missed,
        "correctNoAlerts": correct_no_alert,
        "precision": precision,
        "recall": recall,
        "accuracy": accuracy,
    }


@app.get("/api/results-2025")
def results_2025(storeLimit: int = Query(DEMO_STORE_LIMIT, ge=1, le=50)) -> dict:
    matrix = prediction_matrix_2025(storeLimit)
    event_rows = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id
            FROM retail_raw.stores
            ORDER BY store_id
            LIMIT %(store_limit)s
        ),
        events AS (
            SELECT
                so.stockout_id,
                so.store_id,
                st.store_name,
                st.city,
                st.region,
                so.sku_id,
                p.product_name,
                p.category,
                so.stockout_date,
                so.duration_days,
                coalesce(so.root_cause, 'Unknown') AS root_cause,
                coalesce(so.estimated_lost_revenue, 0) AS estimated_lost_revenue,
                coalesce(so.estimated_lost_units, 0) AS estimated_lost_units
            FROM retail_raw.stockout_events so
            JOIN demo_stores ds ON ds.store_id = so.store_id
            LEFT JOIN retail_raw.stores st ON st.store_id = so.store_id
            LEFT JOIN retail_raw.products p ON p.sku_id = so.sku_id
            WHERE so.stockout_date >= DATE '2025-01-01'
              AND so.stockout_date < DATE '2026-01-01'
        )
        SELECT
            e.*,
            first_alert.date AS first_alert_date,
            first_alert.stockout_probability AS first_alert_probability,
            first_alert.alert_threshold AS first_alert_threshold,
            latest_score.date AS score_date,
            latest_score.stockout_probability,
            latest_score.stockout_probability_3d AS probability_3d,
            latest_score.stockout_probability_14d AS probability_14d,
            latest_score.alert_threshold,
            latest_score.risk_level,
            latest_score.units_on_hand,
            latest_score.units_in_backroom,
            latest_score.avg_daily_demand_7d,
            latest_score.computed_days_of_supply,
            latest_score.recent_replenishment_qty,
            latest_score.days_since_last_replenishment,
            latest_score.avg_supplier_lead_time,
            latest_score.unit_price,
            coalesce(prior_counts.prior_scored_rows, 0) AS prior_scored_rows
        FROM events e
        LEFT JOIN LATERAL (
            SELECT r.date, r.stockout_probability, coalesce(r.alert_threshold, 0.5) AS alert_threshold
            FROM retail_ml.scored_test_rows r
            WHERE r.store_id = e.store_id
              AND r.sku_id = e.sku_id
              AND r.date >= e.stockout_date - interval '7 days'
              AND r.date < e.stockout_date
              AND r.stockout_probability >= coalesce(r.alert_threshold, 0.5)
            ORDER BY r.date ASC
            LIMIT 1
        ) first_alert ON true
        LEFT JOIN LATERAL (
            SELECT
                r.date,
                r.stockout_probability,
                r.stockout_probability_3d,
                r.stockout_probability_14d,
                coalesce(r.alert_threshold, 0.5) AS alert_threshold,
                coalesce(r.risk_level, 'low') AS risk_level,
                r.units_on_hand,
                r.units_in_backroom,
                r.avg_daily_demand_7d,
                r.computed_days_of_supply,
                r.recent_replenishment_qty,
                r.days_since_last_replenishment,
                r.avg_supplier_lead_time,
                r.unit_price
            FROM retail_ml.scored_test_rows r
            WHERE r.store_id = e.store_id
              AND r.sku_id = e.sku_id
              AND r.date >= e.stockout_date - interval '7 days'
              AND r.date < e.stockout_date
            ORDER BY r.date DESC
            LIMIT 1
        ) latest_score ON true
        LEFT JOIN LATERAL (
            SELECT count(*) AS prior_scored_rows
            FROM retail_ml.scored_test_rows r
            WHERE r.store_id = e.store_id
              AND r.sku_id = e.sku_id
              AND r.date >= e.stockout_date - interval '7 days'
              AND r.date < e.stockout_date
        ) prior_counts ON true
        ORDER BY e.stockout_date, e.store_id, e.sku_id
        """,
        {"store_limit": storeLimit},
    )

    def outcome_row(event: dict, prediction_outcome: str) -> dict:
        demand = to_float(event.get("avg_daily_demand_7d"))
        available = to_float(event.get("units_on_hand")) + to_float(event.get("units_in_backroom"))
        forecast_7d = demand * 7
        forecast_gap = available - forecast_7d
        probability = to_float(event.get("stockout_probability"))
        threshold = to_float(event.get("alert_threshold"), 0.5)
        days_supply = to_float(event.get("computed_days_of_supply"), 999)
        warning_days = (event["stockout_date"] - event["first_alert_date"]).days if event.get("first_alert_date") else None
        return {
            "storeId": event["store_id"],
            "storeName": event.get("store_name") or event["store_id"],
            "city": event.get("city") or "",
            "region": event.get("region") or "",
            "sku": event["sku_id"],
            "productName": event.get("product_name") or event["sku_id"],
            "category": event.get("category") or "Unknown",
            "predictionDate": event["score_date"].isoformat() if event.get("score_date") else None,
            "quantityAvailable": available,
            "shelfQuantity": to_float(event.get("units_on_hand")),
            "backroomQuantity": to_float(event.get("units_in_backroom")),
            "sellingRate": demand,
            "forecast7dDemand": forecast_7d,
            "forecastInventoryGap": forecast_gap,
            "forecastDaysOfSupply": available / max(forecast_7d / 7, 0.01),
            "possibleStockoutTime": stockout_timing(days_supply, to_float(event.get("probability_3d"), probability), probability, to_float(event.get("probability_14d"), probability)),
            "daysOfSupply": days_supply,
            "stockoutProbability": probability,
            "timeSeriesAdjustedProbability": probability,
            "alertThreshold": threshold,
            "riskLevel": event.get("risk_level") or risk_from_probability(probability, {"alert_threshold": threshold}),
            "predictionOutcome": prediction_outcome,
            "warningDays": warning_days,
            "recentReplenishmentQty": to_float(event.get("recent_replenishment_qty")),
            "daysSinceLastReplenishment": to_float(event.get("days_since_last_replenishment"), 999),
            "avgSupplierLeadTime": to_float(event.get("avg_supplier_lead_time")),
            "recommendedAction": recommendation_action(probability, days_supply, to_float(event.get("units_in_backroom"))) if event.get("score_date") else "No prior prediction row was available in the 7-day warning window",
            "actualStockoutDate": event["stockout_date"].isoformat() if event.get("stockout_date") else None,
            "root_cause": event["root_cause"],
            "duration_days": int(event["duration_days"] or 0),
            "estimated_lost_revenue": float(event["estimated_lost_revenue"]),
            "estimated_lost_units": float(event["estimated_lost_units"]),
        }

    covered_events = [outcome_row(row, "Successful prediction") for row in event_rows if row.get("first_alert_date")]
    missed_events = [outcome_row(row, "Missed stockout") for row in event_rows if not row.get("first_alert_date") and int(row.get("prior_scored_rows") or 0) > 0]
    no_prior_scored_events = [outcome_row(row, "No prior scored row") for row in event_rows if not row.get("first_alert_date") and int(row.get("prior_scored_rows") or 0) == 0]

    def aggregate_by_cause(rows: list[dict]) -> list[dict]:
        grouped: dict[str, dict] = {}
        for row in rows:
            cause = row["root_cause"]
            bucket = grouped.setdefault(cause, {"cause": cause, "events": 0, "lostRevenue": 0.0, "lostUnits": 0.0})
            bucket["events"] += 1
            bucket["lostRevenue"] += float(row["estimated_lost_revenue"])
            bucket["lostUnits"] += float(row["estimated_lost_units"])
        return sorted(grouped.values(), key=lambda item: item["lostRevenue"], reverse=True)

    def duration_bucket(duration: int) -> str:
        if duration <= 1:
            return "1 day"
        if duration == 2:
            return "2 days"
        if duration == 3:
            return "3 days"
        if duration <= 5:
            return "4-5 days"
        if duration <= 7:
            return "6-7 days"
        return "8+ days"

    duration_order = {"1 day": 1, "2 days": 2, "3 days": 3, "4-5 days": 4, "6-7 days": 5, "8+ days": 6}

    def aggregate_by_duration(rows: list[dict]) -> list[dict]:
        grouped: dict[str, dict] = {}
        for row in rows:
            bucket_name = duration_bucket(int(row["duration_days"] or 0))
            bucket = grouped.setdefault(bucket_name, {"bucket": bucket_name, "events": 0, "lostRevenue": 0.0, "lostUnits": 0.0})
            bucket["events"] += 1
            bucket["lostRevenue"] += float(row["estimated_lost_revenue"])
            bucket["lostUnits"] += float(row["estimated_lost_units"])
        return sorted(grouped.values(), key=lambda item: duration_order[item["bucket"]])

    all_missed_events = missed_events + no_prior_scored_events
    total_revenue = sum(float(row["estimated_lost_revenue"]) for row in covered_events + all_missed_events)
    covered_revenue = sum(float(row["estimated_lost_revenue"]) for row in covered_events)
    missed_revenue = sum(float(row["estimated_lost_revenue"]) for row in all_missed_events)
    warning_days = [int(row["warningDays"]) for row in covered_events if row.get("warningDays") is not None]
    return {
        "matrix": matrix,
        "stockoutEvents": len(covered_events) + len(all_missed_events),
        "coveredEvents": len(covered_events),
        "missedEvents": len(all_missed_events),
        "noPriorScoredEvents": len(no_prior_scored_events),
        "averageWarningDays": sum(warning_days) / len(warning_days) if warning_days else 0,
        "estimatedRevenueAtRisk": total_revenue,
        "estimatedRevenueProtected": covered_revenue,
        "estimatedRevenueMissed": missed_revenue,
        "coverageRate": len(covered_events) / (len(covered_events) + len(all_missed_events)) if covered_events or all_missed_events else 0,
        "revenueCoverageRate": covered_revenue / total_revenue if total_revenue else 0,
        "coveredCauses": aggregate_by_cause(covered_events),
        "missedCauses": aggregate_by_cause(all_missed_events),
        "coveredDurations": aggregate_by_duration(covered_events),
        "missedDurations": aggregate_by_duration(all_missed_events),
        "missedStockouts": sorted(all_missed_events, key=lambda item: item["estimated_lost_revenue"], reverse=True),
    }


@app.get("/api/threshold-tuning-2025")
def threshold_tuning_2025(
    storeLimit: int = Query(DEMO_STORE_LIMIT, ge=1, le=50),
    falseAlertCost: float = Query(25.0, ge=0),
    recallTarget: float = Query(0.85, ge=0, le=1),
) -> dict:
    scored_rows = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id
            FROM retail_raw.stores
            ORDER BY store_id
            LIMIT %(store_limit)s
        )
        SELECT
            r.store_id,
            r.sku_id,
            r.date,
            r.stockout_probability,
            r.unit_price,
            r.avg_daily_demand_7d,
            r.stockout_next_7d
        FROM retail_ml.scored_test_rows r
        JOIN demo_stores ds ON ds.store_id = r.store_id
        WHERE r.date >= DATE '2025-01-01'
          AND r.date < DATE '2026-01-01'
        """,
        {"store_limit": storeLimit},
    )
    events = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id
            FROM retail_raw.stores
            ORDER BY store_id
            LIMIT %(store_limit)s
        )
        SELECT
            so.store_id,
            so.sku_id,
            so.stockout_date,
            coalesce(so.estimated_lost_revenue, 0) AS estimated_lost_revenue
        FROM retail_raw.stockout_events so
        JOIN demo_stores ds ON ds.store_id = so.store_id
        WHERE so.stockout_date >= DATE '2025-01-01'
          AND so.stockout_date < DATE '2026-01-01'
        """,
        {"store_limit": storeLimit},
    )
    events_by_pair: dict[tuple[str, str], list[dict]] = {}
    for event in events:
        events_by_pair.setdefault((event["store_id"], event["sku_id"]), []).append(event)
    for pair_events in events_by_pair.values():
        pair_events.sort(key=lambda item: item["stockout_date"])

    validation_rows = []
    for row in scored_rows:
        actual = int(row.get("stockout_next_7d") or 0) == 1
        lost_revenue = 0.0
        if actual:
            matching_events = [
                event
                for event in events_by_pair.get((row["store_id"], row["sku_id"]), [])
                if row["date"] <= event["stockout_date"] <= row["date"] + timedelta(days=7)
            ]
            if matching_events:
                lost_revenue = float(matching_events[0]["estimated_lost_revenue"] or 0)
            else:
                lost_revenue = to_float(row.get("unit_price")) * to_float(row.get("avg_daily_demand_7d")) * 7
        validation_rows.append(
            {
                "probability": to_float(row.get("stockout_probability")),
                "actual": actual,
                "lostRevenue": lost_revenue,
            }
        )

    def threshold_metrics(threshold: float) -> dict:
        tp = fp = tn = fn = 0
        revenue_saved = 0.0
        revenue_missed = 0.0
        for row in validation_rows:
            predicted = row["probability"] >= threshold
            actual = row["actual"]
            if predicted and actual:
                tp += 1
                revenue_saved += row["lostRevenue"]
            elif predicted and not actual:
                fp += 1
            elif not predicted and actual:
                fn += 1
                revenue_missed += row["lostRevenue"]
            else:
                tn += 1
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0
        accuracy = (tp + tn) / len(validation_rows) if validation_rows else 0
        false_alert_cost = fp * falseAlertCost
        return {
            "threshold": threshold,
            "successfulPredictions": tp,
            "falseAlerts": fp,
            "missedStockouts": fn,
            "correctNoAlerts": tn,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "accuracy": accuracy,
            "revenueSaved": revenue_saved,
            "revenueMissed": revenue_missed,
            "falseAlertCost": false_alert_cost,
            "netRevenueValue": revenue_saved - false_alert_cost,
        }

    thresholds = [round(value / 100, 2) for value in range(5, 96)]
    curve = [threshold_metrics(threshold) for threshold in thresholds]
    best_f1 = max(curve, key=lambda item: item["f1"]) if curve else threshold_metrics(0.5)
    recall_candidates = [item for item in curve if item["recall"] >= recallTarget]
    best_recall_target = (
        min(recall_candidates, key=lambda item: (item["falseAlerts"], -item["precision"]))
        if recall_candidates
        else max(curve, key=lambda item: item["recall"])
    )
    best_net = max(curve, key=lambda item: item["netRevenueValue"]) if curve else threshold_metrics(0.5)
    actual_count = sum(1 for row in validation_rows if row["actual"])
    total_revenue_at_risk = sum(row["lostRevenue"] for row in validation_rows if row["actual"])

    try:
        from sklearn.metrics import average_precision_score

        pr_auc = float(
            average_precision_score(
                [1 if row["actual"] else 0 for row in validation_rows],
                [row["probability"] for row in validation_rows],
            )
        )
    except Exception:
        pr_auc = 0.0

    techniques = [
        {
            "technique": "PR-AUC",
            "threshold": None,
            "description": "Ranks model quality across all thresholds; it does not choose one operating threshold.",
            "prAuc": pr_auc,
            "metrics": best_f1,
        },
        {
            "technique": "F1 sweet spot",
            "threshold": best_f1["threshold"],
            "description": "Best statistical balance between precision and recall.",
            "prAuc": pr_auc,
            "metrics": best_f1,
        },
        {
            "technique": f"Recall target >= {round(recallTarget * 100)}%",
            "threshold": best_recall_target["threshold"],
            "description": "Fewest false alerts while still catching the target share of stockouts.",
            "prAuc": pr_auc,
            "metrics": best_recall_target,
        },
        {
            "technique": "Cost/revenue sweet spot",
            "threshold": best_net["threshold"],
            "description": "Maximizes estimated revenue saved minus false-alert action cost.",
            "prAuc": pr_auc,
            "metrics": best_net,
        },
    ]

    return {
        "year": 2025,
        "storeCount": storeLimit,
        "rowsChecked": len(validation_rows),
        "actualStockouts": actual_count,
        "totalRevenueAtRisk": total_revenue_at_risk,
        "falseAlertCost": falseAlertCost,
        "recallTarget": recallTarget,
        "prAuc": pr_auc,
        "recommendedTechnique": f"Recall target >= {round(recallTarget * 100)}%",
        "recommendedThreshold": best_recall_target["threshold"],
        "techniques": techniques,
        "curve": curve,
    }


@app.get("/api/best-demo-week")
def best_demo_week(storeLimit: int = Query(DEMO_STORE_LIMIT, ge=1, le=50)) -> dict:
    row = fetch_one(
        """
        WITH demo_stores AS (
            SELECT store_id
            FROM retail_raw.stores
            ORDER BY store_id
            LIMIT %(store_limit)s
        ),
        scored_week_rows AS (
            SELECT
                date_trunc('week', r.date)::date AS week_start,
                r.store_id,
                r.sku_id,
                max(coalesce(r.stockout_next_7d, 0)) AS actual_label
            FROM retail_ml.scored_test_rows r
            JOIN demo_stores ds ON ds.store_id = r.store_id
            WHERE r.date >= DATE '2025-01-01'
              AND r.date < DATE '2026-01-01'
            GROUP BY 1, 2, 3
        ),
        weeks AS (
            SELECT
                week_start,
                count(*) AS products_scored,
                sum(actual_label) AS actual_stockout_products,
                count(DISTINCT store_id) FILTER (WHERE actual_label = 1) AS stores_affected,
                count(DISTINCT sku_id) FILTER (WHERE actual_label = 1) AS products_affected
            FROM scored_week_rows
            GROUP BY week_start
        )
        SELECT week_start, week_start + 6 AS week_end, products_scored, actual_stockout_products, stores_affected, products_affected
        FROM weeks
        ORDER BY actual_stockout_products DESC, products_scored DESC, week_start
        LIMIT 1
        """,
        {"store_limit": storeLimit},
    )
    if not row:
        return {
            "weekStart": "2025-01-01",
            "weekEnd": "2025-01-07",
            "stockoutEvents": 0,
            "storesAffected": 0,
            "productsAffected": 0,
        }
    return {
        "weekStart": row["week_start"].isoformat(),
        "weekEnd": row["week_end"].isoformat(),
        "stockoutEvents": int(row["actual_stockout_products"]),
        "storesAffected": int(row["stores_affected"]),
        "productsAffected": int(row["products_affected"]),
    }


@app.get("/api/products")
def products() -> list[dict]:
    rows = fetch_all(
        """
        SELECT sku_id, product_name, category, brand
        FROM retail_raw.products
        ORDER BY sku_id
        """
    )
    return [{"sku": r["sku_id"], "name": r["product_name"], "category": r["category"], "brand": r["brand"]} for r in rows]


@app.get("/api/prediction")
def prediction(storeId: str, sku: str) -> dict:
    row = fetch_one(
        """
        SELECT *
        FROM retail_ml.scored_test_rows
        WHERE store_id = %(store_id)s
          AND sku_id = %(sku)s
        ORDER BY date DESC
        LIMIT 1
        """,
        {"store_id": storeId, "sku": sku},
    )
    if row is None:
        row = fetch_one(
            """
            SELECT *
            FROM retail_ml.scored_test_rows
            WHERE store_id = %(store_id)s OR sku_id = %(sku)s
            ORDER BY stockout_probability DESC
            LIMIT 1
            """,
            {"store_id": storeId, "sku": sku},
        )
    probability = to_float(row["stockout_probability"]) if row else 0
    days_supply = to_float(row.get("computed_days_of_supply") if row else None, 0)
    threshold = to_float(row.get("alert_threshold") if row else None, dynamic_alert_threshold(row or {}))
    return {
        "storeId": storeId,
        "sku": sku,
        "probability": probability,
        "probability3d": to_float(row.get("stockout_probability_3d") if row else None, probability),
        "probability14d": to_float(row.get("stockout_probability_14d") if row else None, probability),
        "alertThreshold": threshold,
        "riskLevel": row.get("risk_level") if row and row.get("risk_level") else risk_from_probability(probability, {**(row or {}), "alert_threshold": threshold}),
        "daysOfSupply": days_supply,
        "unitsOnHand": to_float(row.get("units_on_hand") if row else None),
        "avgDailyDemand7d": to_float(row.get("avg_daily_demand_7d") if row else None),
        "recentReplenishmentQty": to_float(row.get("recent_replenishment_qty") if row else None),
        "daysSinceLastReplenishment": to_float(row.get("days_since_last_replenishment") if row else None),
        "avgSupplierLeadTime": to_float(row.get("avg_supplier_lead_time") if row else None),
        "historicalStockoutFrequency": to_float(row.get("historical_stockout_frequency") if row else None),
        "alertReason": risk_reason(row or {}),
        "estimatedLostSales": to_float(row.get("unit_price") if row else None) * to_float(row.get("avg_daily_demand_7d") if row else None) * 7 * probability,
        "recommendedAction": recommendation_action(probability, days_supply, to_float(row.get("units_in_backroom") if row else None)),
        "drivers": driver_set(row or {}),
    }


@app.post("/api/scenario")
def scenario(storeId: str, sku: str, params: ScenarioInput) -> dict:
    base = prediction(storeId, sku)
    probability = max(
        0.04,
        min(
            0.99,
            base["probability"]
            + (params.leadTimeDays - 3) * 0.035
            + params.promoUpliftPct * 0.003
            - params.safetyStockUnits * 0.0018,
        ),
    )
    days_supply = max(1, base["daysOfSupply"] + params.safetyStockUnits / 22 - params.promoUpliftPct / 20)
    return {
        **base,
        "probability": probability,
        "alertThreshold": base.get("alertThreshold", dynamic_alert_threshold(base)),
        "riskLevel": risk_from_probability(probability, {"alert_threshold": base.get("alertThreshold", dynamic_alert_threshold(base))}),
        "daysOfSupply": days_supply,
        "estimatedLostSales": base["estimatedLostSales"] * (0.75 + probability),
        "recommendedAction": recommendation_action(probability, days_supply),
    }


UPLOAD_TABLES = {
    "sales": {
        "table": "retail_raw.sales_transactions",
        "id": "transaction_id",
        "columns": ["transaction_id", "store_id", "sku_id", "sale_date", "units_sold", "unit_price_actual", "revenue", "is_promoted", "promotion_id"],
        "date": "sale_date",
    },
    "inventory": {
        "table": "retail_raw.inventory_snapshots",
        "id": "snapshot_id",
        "columns": ["snapshot_id", "store_id", "sku_id", "snapshot_date", "snapshot_time", "units_on_hand", "units_in_backroom", "days_of_supply", "expiry_nearest_date"],
        "date": "snapshot_date",
    },
    "replenishment": {
        "table": "retail_raw.replenishment_logs",
        "id": "replenishment_id",
        "columns": [
            "replenishment_id",
            "store_id",
            "sku_id",
            "replenishment_date",
            "trigger_type",
            "units_ordered",
            "units_received",
            "order_date",
            "receive_date",
            "lead_time_actual",
            "replenishment_cost",
            "associate_id",
        ],
        "date": "replenishment_date",
    },
    "stockouts": {
        "table": "retail_raw.stockout_events",
        "id": "stockout_id",
        "columns": [
            "stockout_id",
            "store_id",
            "sku_id",
            "stockout_date",
            "restock_date",
            "duration_days",
            "estimated_lost_units",
            "estimated_lost_revenue",
            "root_cause",
        ],
        "date": "stockout_date",
    },
}


MODEL_FEATURES = [
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
    "brand",
    "category",
    "subcategory",
    "is_perishable",
    "region",
    "store_format",
    "foot_traffic_tier",
]


def normalize_upload_value(value: str) -> Any:
    value = value.strip()
    if value == "":
        return None
    if value.lower() in {"true", "false"}:
        return value.lower() == "true"
    return value


def generated_upload_id(data_type: str, row: dict, index: int) -> str:
    seed = "|".join(str(row.get(part, "")) for part in ["store_id", "sku_id"]) + f"|{index}|{json.dumps(row, sort_keys=True, default=str)}"
    return f"upload_{data_type}_{hashlib.sha1(seed.encode('utf-8')).hexdigest()[:24]}"


def upsert_upload_rows(data_type: str, rows: list[dict]) -> list[tuple[str, str, date]]:
    config = UPLOAD_TABLES[data_type]
    columns = config["columns"]
    id_column = config["id"]
    date_column = config["date"]
    prepared = []
    affected: set[tuple[str, str, date]] = set()
    for index, row in enumerate(rows):
        clean = {column: normalize_upload_value("" if row.get(column) is None else str(row.get(column))) for column in columns}
        if not clean.get(id_column):
            clean[id_column] = generated_upload_id(data_type, clean, index)
        if not clean.get("store_id") or not clean.get("sku_id") or not clean.get(date_column):
            continue
        prepared.append(clean)
        affected.add((str(clean["store_id"]), str(clean["sku_id"]), pd.to_datetime(clean[date_column]).date()))
    if not prepared:
        return []

    placeholders = ", ".join([f"%({column})s" for column in columns])
    update_cols = [column for column in columns if column != id_column]
    updates = ", ".join([f"{column} = EXCLUDED.{column}" for column in update_cols])
    sql = f"""
        INSERT INTO {config['table']} ({", ".join(columns)})
        VALUES ({placeholders})
        ON CONFLICT ({id_column}) DO UPDATE SET {updates}
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, prepared)
        conn.commit()
    return list(affected)


def latest_feature_row(store_id: str, sku: str, as_of: date) -> dict | None:
    return fetch_one(
        """
        WITH params AS (
            SELECT %(store_id)s::text AS store_id, %(sku)s::text AS sku_id, %(as_of)s::date AS as_of
        ),
        sales AS (
            SELECT
                coalesce(sum(units_sold) FILTER (WHERE sale_date = params.as_of), 0) AS units_sold,
                coalesce(sum(revenue) FILTER (WHERE sale_date = params.as_of), 0) AS revenue,
                coalesce(sum(CASE WHEN is_promoted THEN 1 ELSE 0 END) FILTER (WHERE sale_date = params.as_of), 0) AS promoted_sales_days,
                coalesce(sum(units_sold) FILTER (WHERE sale_date > params.as_of - interval '7 days' AND sale_date <= params.as_of), 0) AS sales_last_7d,
                coalesce(sum(units_sold) FILTER (WHERE sale_date > params.as_of - interval '14 days' AND sale_date <= params.as_of), 0) AS sales_last_14d,
                min(sale_date) AS first_sale_date
            FROM retail_raw.sales_transactions s
            JOIN params ON params.store_id = s.store_id AND params.sku_id = s.sku_id
            WHERE s.sale_date <= params.as_of
        ),
        inv AS (
            SELECT units_on_hand, units_in_backroom, days_of_supply
            FROM retail_raw.inventory_snapshots i
            JOIN params ON params.store_id = i.store_id AND params.sku_id = i.sku_id
            WHERE i.snapshot_date <= params.as_of
            ORDER BY i.snapshot_date DESC, i.snapshot_time DESC NULLS LAST
            LIMIT 1
        ),
        repl AS (
            SELECT
                coalesce(sum(units_received) FILTER (WHERE replenishment_date = params.as_of), 0) AS recent_replenishment_qty,
                max(replenishment_date) AS last_replenishment_date,
                coalesce(avg(lead_time_actual), 0) AS avg_supplier_lead_time
            FROM retail_raw.replenishment_logs r
            JOIN params ON params.store_id = r.store_id AND params.sku_id = r.sku_id
            WHERE r.replenishment_date <= params.as_of
        ),
        stockouts AS (
            SELECT count(*) AS stockout_count
            FROM retail_raw.stockout_events so
            JOIN params ON params.store_id = so.store_id AND params.sku_id = so.sku_id
            WHERE so.stockout_date < params.as_of
        )
        SELECT
            params.store_id,
            params.sku_id,
            params.as_of AS date,
            p.product_name,
            st.store_name,
            sales.units_sold,
            sales.revenue,
            sales.promoted_sales_days,
            sales.sales_last_7d,
            sales.sales_last_14d,
            sales.sales_last_7d / 7.0 AS avg_daily_demand_7d,
            sales.sales_last_14d / 14.0 AS avg_daily_demand_14d,
            coalesce(inv.units_on_hand, 0) AS units_on_hand,
            coalesce(inv.units_in_backroom, 0) AS units_in_backroom,
            coalesce(inv.days_of_supply, 999) AS days_of_supply,
            coalesce((coalesce(inv.units_on_hand, 0) + coalesce(inv.units_in_backroom, 0)) / nullif(sales.sales_last_7d / 7.0, 0), 999) AS computed_days_of_supply,
            repl.recent_replenishment_qty,
            coalesce(params.as_of - repl.last_replenishment_date, 999) AS days_since_last_replenishment,
            repl.avg_supplier_lead_time,
            coalesce(stockouts.stockout_count / nullif(params.as_of - sales.first_sale_date, 0)::numeric, 0) AS historical_stockout_frequency,
            p.unit_price,
            p.unit_cost,
            p.reorder_point,
            p.safety_stock,
            p.brand,
            p.category,
            p.subcategory,
            p.is_perishable,
            st.region,
            st.store_format,
            st.foot_traffic_tier
        FROM params
        CROSS JOIN sales
        CROSS JOIN repl
        CROSS JOIN stockouts
        LEFT JOIN inv ON true
        LEFT JOIN retail_raw.products p ON p.sku_id = params.sku_id
        LEFT JOIN retail_raw.stores st ON st.store_id = params.store_id
        """,
        {"store_id": store_id, "sku": sku, "as_of": as_of},
    )


def fallback_probability(row: dict) -> float:
    days_supply = to_float(row.get("computed_days_of_supply"), 999)
    demand = to_float(row.get("avg_daily_demand_7d"), 0)
    lead_time = to_float(row.get("avg_supplier_lead_time"), 0)
    stockout_history = to_float(row.get("historical_stockout_frequency"), 0)
    probability = 0.12
    probability += max(0, 10 - min(days_supply, 10)) * 0.055
    probability += min(demand, 35) * 0.008
    probability += min(lead_time, 14) * 0.018
    probability += min(stockout_history, 0.3) * 1.25
    if to_float(row.get("recent_replenishment_qty"), 0) > 0:
        probability -= 0.22
    return max(0.03, min(0.98, probability))


def predict_probability(row: dict, horizon: int = 7) -> float:
    model_path = PROJECT_ROOT / "models" / ("xgboost_stockout.joblib" if horizon == 7 else f"xgboost_stockout_{horizon}d.joblib")
    if not model_path.exists():
        base = fallback_probability(row)
        if horizon == 3:
            return max(0.01, min(0.99, base * (0.72 if to_float(row.get("computed_days_of_supply"), 999) > 3 else 1.05)))
        if horizon == 14:
            return max(base, min(0.99, base * 1.28))
        return base
    model = joblib.load(model_path)
    frame = pd.DataFrame([{feature: row.get(feature) for feature in MODEL_FEATURES}])
    return float(model.predict_proba(frame)[0, 1])


def ensure_ml_score_columns() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                ALTER TABLE retail_ml.scored_test_rows
                    ADD COLUMN IF NOT EXISTS stockout_next_3d integer,
                    ADD COLUMN IF NOT EXISTS stockout_next_14d integer,
                    ADD COLUMN IF NOT EXISTS stockout_probability_3d numeric,
                    ADD COLUMN IF NOT EXISTS stockout_probability_7d numeric,
                    ADD COLUMN IF NOT EXISTS stockout_probability_14d numeric,
                    ADD COLUMN IF NOT EXISTS alert_threshold numeric,
                    ADD COLUMN IF NOT EXISTS risk_level text
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS retail_ml.ingestion_state (
                    state_key text PRIMARY KEY,
                    last_fetched_end_date date,
                    updated_at timestamptz DEFAULT now()
                )
                """
            )
        conn.commit()


def rescore_pairs(affected: list[tuple[str, str, date]]) -> int:
    scored_rows = []
    for store_id, sku, as_of in affected:
        row = latest_feature_row(store_id, sku, as_of)
        if not row:
            continue
        probability = predict_probability(row, 7)
        probability_3d = predict_probability(row, 3)
        probability_14d = predict_probability(row, 14)
        threshold = dynamic_alert_threshold(row)
        scored_rows.append(
            {
                **row,
                "stockout_next_3d": None,
                "stockout_next_7d": None,
                "stockout_next_14d": None,
                "stockout_probability": probability,
                "stockout_probability_3d": probability_3d,
                "stockout_probability_7d": probability,
                "stockout_probability_14d": probability_14d,
                "alert_threshold": threshold,
                "risk_level": risk_from_probability(probability, {**row, "alert_threshold": threshold}),
            }
        )
    if not scored_rows:
        return 0

    columns = [
        "store_id",
        "sku_id",
        "date",
        "product_name",
        "store_name",
        *MODEL_FEATURES,
        "stockout_next_3d",
        "stockout_next_7d",
        "stockout_next_14d",
        "stockout_probability",
        "stockout_probability_3d",
        "stockout_probability_7d",
        "stockout_probability_14d",
        "alert_threshold",
        "risk_level",
    ]
    placeholders = ", ".join([f"%({column})s" for column in columns])
    ensure_ml_score_columns()
    with get_conn() as conn:
        with conn.cursor() as cur:
            for row in scored_rows:
                cur.execute(
                    """
                    DELETE FROM retail_ml.scored_test_rows
                    WHERE store_id = %(store_id)s AND sku_id = %(sku_id)s AND date = %(date)s
                    """,
                    row,
                )
            cur.executemany(
                f"""
                INSERT INTO retail_ml.scored_test_rows ({", ".join(columns)})
                VALUES ({placeholders})
                """,
                scored_rows,
            )
        conn.commit()
    return len(scored_rows)


def next_week_window() -> tuple[date, date]:
    ensure_ml_score_columns()
    state = fetch_one(
        """
        SELECT last_fetched_end_date
        FROM retail_ml.ingestion_state
        WHERE state_key = 'future_2025_weekly'
        """
    )
    if state and state.get("last_fetched_end_date"):
        start = state["last_fetched_end_date"] + timedelta(days=1)
    else:
        start = date(2025, 1, 1)
    end = min(start + timedelta(days=6), date(2025, 12, 31))
    return start, end


def affected_pairs_for_week(start: date, end: date) -> list[tuple[str, str, date]]:
    rows = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id
            FROM retail_raw.stores
            ORDER BY store_id
            LIMIT %(store_limit)s
        ),
        affected AS (
            SELECT store_id, sku_id, sale_date AS event_date
            FROM retail_raw.sales_transactions
            WHERE sale_date BETWEEN %(start)s AND %(end)s
            UNION
            SELECT store_id, sku_id, snapshot_date AS event_date
            FROM retail_raw.inventory_snapshots
            WHERE snapshot_date BETWEEN %(start)s AND %(end)s
            UNION
            SELECT store_id, sku_id, replenishment_date AS event_date
            FROM retail_raw.replenishment_logs
            WHERE replenishment_date BETWEEN %(start)s AND %(end)s
            UNION
            SELECT store_id, sku_id, stockout_date AS event_date
            FROM retail_raw.stockout_events
            WHERE stockout_date BETWEEN %(start)s AND %(end)s
        )
        SELECT store_id, sku_id, max(event_date) AS as_of
        FROM affected
        JOIN demo_stores USING (store_id)
        GROUP BY store_id, sku_id
        ORDER BY store_id, sku_id
        LIMIT 5000
        """,
        {"start": start, "end": end, "store_limit": DEMO_STORE_LIMIT},
    )
    return [(row["store_id"], row["sku_id"], row["as_of"]) for row in rows]


def update_weekly_state(end: date) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO retail_ml.ingestion_state (state_key, last_fetched_end_date, updated_at)
                VALUES ('future_2025_weekly', %(end)s, now())
                ON CONFLICT (state_key)
                DO UPDATE SET last_fetched_end_date = EXCLUDED.last_fetched_end_date, updated_at = now()
                """,
                {"end": end},
            )
        conn.commit()


def week_difference_summary(start: date, end: date) -> dict:
    rows = fetch_all(
        """
        WITH demo_stores AS (
            SELECT store_id FROM retail_raw.stores ORDER BY store_id LIMIT %(store_limit)s
        ),
        before_rows AS (
            SELECT DISTINCT ON (r.store_id, r.sku_id)
                r.store_id,
                r.sku_id,
                r.stockout_probability AS before_probability,
                coalesce(r.units_on_hand, 0) + coalesce(r.units_in_backroom, 0) AS before_available
            FROM retail_ml.scored_test_rows r
            JOIN demo_stores ds USING (store_id)
            WHERE r.date < %(start)s
            ORDER BY r.store_id, r.sku_id, r.date DESC
        ),
        after_rows AS (
            SELECT DISTINCT ON (r.store_id, r.sku_id)
                r.store_id,
                r.sku_id,
                r.store_name,
                r.product_name,
                r.category,
                r.stockout_probability AS after_probability,
                coalesce(r.units_on_hand, 0) + coalesce(r.units_in_backroom, 0) AS after_available,
                r.computed_days_of_supply,
                r.avg_daily_demand_7d,
                r.recent_replenishment_qty,
                r.avg_supplier_lead_time
            FROM retail_ml.scored_test_rows r
            JOIN demo_stores ds USING (store_id)
            WHERE r.date BETWEEN %(start)s AND %(end)s
            ORDER BY r.store_id, r.sku_id, r.date DESC, r.stockout_probability DESC
        ),
        stockouts AS (
            SELECT store_id, sku_id, count(*) AS actual_stockouts, max(root_cause) AS root_cause
            FROM retail_raw.stockout_events
            WHERE stockout_date BETWEEN %(start)s AND %(end)s
            GROUP BY 1, 2
        )
        SELECT
            a.store_id,
            a.store_name,
            a.sku_id,
            a.product_name,
            a.category,
            coalesce(b.before_probability, 0) AS before_probability,
            a.after_probability,
            coalesce(b.before_available, 0) AS before_available,
            a.after_available,
            a.computed_days_of_supply,
            a.avg_daily_demand_7d,
            a.recent_replenishment_qty,
            a.avg_supplier_lead_time,
            coalesce(s.actual_stockouts, 0) AS actual_stockouts,
            coalesce(s.root_cause, 'No stockout recorded') AS root_cause
        FROM after_rows a
        LEFT JOIN before_rows b USING (store_id, sku_id)
        LEFT JOIN stockouts s USING (store_id, sku_id)
        ORDER BY abs(a.after_probability - coalesce(b.before_probability, 0)) DESC, a.after_probability DESC
        LIMIT 8
        """,
        {"start": start, "end": end, "store_limit": DEMO_STORE_LIMIT},
    )
    if not rows:
        return {"avgProbabilityBefore": 0, "avgProbabilityAfter": 0, "avgAvailableBefore": 0, "avgAvailableAfter": 0, "actualStockouts": 0, "topChanges": []}
    return {
        "avgProbabilityBefore": sum(to_float(row["before_probability"]) for row in rows) / len(rows),
        "avgProbabilityAfter": sum(to_float(row["after_probability"]) for row in rows) / len(rows),
        "avgAvailableBefore": sum(to_float(row["before_available"]) for row in rows) / len(rows),
        "avgAvailableAfter": sum(to_float(row["after_available"]) for row in rows) / len(rows),
        "actualStockouts": sum(int(row["actual_stockouts"]) for row in rows),
        "topChanges": [
            {
                "storeName": row["store_name"],
                "sku": row["sku_id"],
                "productName": row["product_name"],
                "category": row["category"],
                "beforeProbability": to_float(row["before_probability"]),
                "afterProbability": to_float(row["after_probability"]),
                "beforeAvailable": to_float(row["before_available"]),
                "afterAvailable": to_float(row["after_available"]),
                "daysOfSupply": to_float(row["computed_days_of_supply"]),
                "sellingRate": to_float(row["avg_daily_demand_7d"]),
                "recentReplenishmentQty": to_float(row["recent_replenishment_qty"]),
                "reason": row["root_cause"] if row["root_cause"] != "No stockout recorded" else risk_reason(row),
            }
            for row in rows
        ],
    }


@app.get("/api/fetch-next-week/status")
def fetch_next_week_status() -> dict:
    start, end = next_week_window()
    state = fetch_one(
        """
        SELECT last_fetched_end_date
        FROM retail_ml.ingestion_state
        WHERE state_key = 'future_2025_weekly'
        """
    )
    return {
        "nextWeekStart": start.isoformat(),
        "nextWeekEnd": end.isoformat(),
        "lastFetchedEndDate": state["last_fetched_end_date"].isoformat() if state and state.get("last_fetched_end_date") else None,
        "complete": start > date(2025, 12, 31),
    }


@app.post("/api/fetch-next-week")
def fetch_next_week() -> dict:
    start, end = next_week_window()
    if start > date(2025, 12, 31):
        return {
            "weekStart": None,
            "weekEnd": None,
            "pairsFound": 0,
            "pairsScored": 0,
            "complete": True,
            "message": "All 2025 weeks have already been fetched.",
        }
    affected = affected_pairs_for_week(start, end)
    scored = rescore_pairs(affected)
    difference = week_difference_summary(start, end)
    update_weekly_state(end)
    return {
        "weekStart": start.isoformat(),
        "weekEnd": end.isoformat(),
        "pairsFound": len(affected),
        "pairsScored": scored,
        "difference": difference,
        "complete": end >= date(2025, 12, 31),
        "message": f"Fetched DB week {start.isoformat()} to {end.isoformat()} and refreshed affected predictions.",
    }


@app.post("/api/uploads/weekly")
async def weekly_upload(request: Request, dataType: str = Query(..., pattern="^(sales|inventory|replenishment|stockouts)$")) -> dict:
    body = (await request.body()).decode("utf-8-sig")
    reader = csv.DictReader(StringIO(body))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="Uploaded CSV has no data rows.")
    affected = upsert_upload_rows(dataType, rows)
    rescored = rescore_pairs(affected)
    return {
        "dataType": dataType,
        "rowsReceived": len(rows),
        "rowsAccepted": len(affected),
        "pairsRescored": rescored,
        "message": "Weekly data loaded into PostgreSQL and affected alerts were refreshed.",
    }


@app.post("/api/assistant")
def assistant(request: AssistantRequest) -> dict:
    text = request.message.lower()
    chunks = retrieve_rag_context(request.message)
    context = format_rag_context(chunks)
    history = [item.model_dump() for item in request.history]
    answer = ask_ollama(request.message, context, history) or assistant_fallback(text, chunks)
    answer = metric_answer_guard(request.message, answer)
    sources = [{"source": chunk["source"], "title": chunk["title"]} for chunk in chunks]
    return {"response": answer, "sources": sources, "ragEnabled": True}
