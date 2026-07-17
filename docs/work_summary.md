# ShelfSignal Work Summary

## Project Purpose

ShelfSignal was built to solve a practical retail problem:

> Predict which products may stock out soon, explain why, and recommend actions that can protect sales.

The project is not only a machine learning model. It is an early-warning and decision-support dashboard for retail stockout prevention.

## Why This Problem Matters

Stockouts create direct business loss:

- Customers cannot buy the product.
- Stores lose revenue.
- Shelf availability becomes unreliable.
- Replenishment teams react late instead of acting early.

The goal was to move from:

```text
What already stocked out?
```

to:

```text
What is likely to stock out soon, where, why, and what should we do?
```

## What Was Performed

### 1. Created the Project Scope

I defined the project as a retail stockout early-warning system.

The final scope became:

- Use **2024 data for training**
- Use **2025 data for future-style testing**
- Focus on **10 selected stores**
- Generate daily predictions for store-SKU combinations
- Evaluate whether alerts came before real stockout events

Why:

This creates a more realistic production-style setup. The model learns from the past and is tested on future data instead of randomly mixing dates.

### 2. Loaded and Organized the Data

The project uses these retail datasets:

- `sales_transactions`
- `inventory_snapshots`
- `replenishment_logs`
- `stockout_events`
- `products`
- `stores`
- `suppliers`
- `promotions`
- `store_layout`
- `demand_forecasts`

PostgreSQL schemas were created:

| Schema | Purpose |
| --- | --- |
| `retail_raw` | Stores raw business data |
| `retail_ml` | Stores modeling tables, predictions, metrics, and recommendations |

Why:

Using PostgreSQL makes the project closer to a production data flow instead of only reading local CSV files.

### 3. Built the Modeling Table

The core modeling table was built at this grain:

```text
store + SKU + date
```

Example:

```text
Store 001 + Product 084 + 2025-01-13
```

Why:

Stockout risk changes daily. A product may be safe today but risky tomorrow after high sales, low replenishment, or reduced inventory.

### 4. Engineered Useful Features

Features were created from the raw data, including:

- Sales in the last 7 days
- Sales in the last 14 days
- Average daily demand
- Current on-hand inventory
- Shelf inventory
- Backroom inventory
- Days of supply
- Days since last replenishment
- Recent replenishment quantity
- Supplier lead time
- Historical stockout frequency
- Product category
- Store format and region
- Promotion-related signals

Why:

The model needs to understand both demand and supply. Stockouts are usually caused by a combination of fast sales, low inventory, delayed replenishment, poor forecasting, or operational issues.

### 5. Created the Prediction Target

The main target was:

```text
stockout_next_7d = 1 if a stockout occurs within the next 7 days
stockout_next_7d = 0 otherwise
```

Additional horizons were also considered:

- 3-day urgent risk
- 7-day main action window
- 14-day planning risk

Why:

The purpose is prevention. Predicting the exact stockout date is less useful than warning early enough for the store to reorder, transfer stock, or refill the shelf.

### 6. Trained Machine Learning Models

Two models were used:

| Model | Purpose |
| --- | --- |
| Logistic Regression | Baseline model |
| XGBoost | Main stockout-risk model |

Why:

Logistic Regression gives a simple benchmark. XGBoost handles non-linear patterns better, such as how demand, inventory, lead time, and stockout history interact.

### 7. Tuned Alert Thresholds

The project explored threshold tuning instead of using a random fixed threshold like 35%.

The system considers:

- Recall
- Precision
- F1-score
- PR-AUC
- Revenue impact
- Product-specific behavior

Why:

In stockout prevention, missing a real stockout is costly. A lower threshold catches more stockouts, but creates more false alerts. Threshold tuning helps find a useful balance.

### 8. Added Product-Specific Alert Logic

The project also uses product-aware alert logic.

Examples:

```text
Fast-selling product + low days of supply + long lead time
= alert earlier
```

```text
Slow-selling product + enough inventory + short lead time
= alert later
```

Why:

Different products should not always use the same threshold. A high-demand perishable item and a slow-moving household item have different risk behavior.

### 9. Evaluated Predictions in a Production-Like Way

The evaluation checks:

```text
For each real 2025 stockout event,
was there an alert 1-7 days before the stockout date?
```

Reported metrics include:

- Precision
- Recall
- Accuracy
- Successful predictions
- False alerts
- Missed stockouts
- Revenue protected
- Missed revenue
- Average warning days
- Covered and missed root causes
- Covered and missed stockout durations

Why:

Row-level model accuracy is not enough. The business question is whether the system warned before the stockout happened.

### 10. Built the Dashboard

The dashboard was built with four main pages:

| Page | Purpose |
| --- | --- |
| Overview | Explains the project scope and business goal |
| Risk Dashboard | Shows 2024/2025 stockout loss, causes, trends, categories, and durations |
| Predictions | Lets users inspect store-level and product-level stockout alerts |
| Results | Shows event-level model results and revenue protected |

Why:

The output should be understandable to analysts and business users, not only data scientists.

### 11. Added a Simple RAG/Ollama Assistant

An assistant was added to explain:

- Current data
- Dashboard values
- Model results
- Stockout risk drivers
- Recommended actions

Why:

A business user may not understand model metrics or feature names directly. The assistant helps translate results into plain English.

### 12. Created a Public Demo Dataset

A 10-store anonymized dataset was created.

Anonymized:

- Store names
- SKU IDs
- Supplier IDs
- Product brands
- Transaction IDs
- Associate IDs

Retained:

- Dates
- Quantities
- Prices
- Categories
- Stockout duration
- Root cause
- Lost revenue

Why:

The project can be shared publicly on GitHub without exposing sensitive business-like identifiers.

### 13. Deployed the Dashboard to GitHub Pages

The React frontend was deployed using GitHub Pages.

Live dashboard:

```text
https://rajashekarakula19-spec.github.io/retail-stockout-early-warning/
```

Why:

This makes the project easy to share as a clickable portfolio link.

### 14. Added Static Portfolio Fallback Data

GitHub Pages is static and cannot connect to a local PostgreSQL database or local FastAPI server.

To solve this, a static frontend fallback dataset was added.

Why:

The live GitHub Pages dashboard can now show meaningful demo data even when the backend is not running.

## Tech Stack Used

### Data and Storage

| Tool | Why Used |
| --- | --- |
| CSV | Original source data format |
| PostgreSQL | Production-style database |
| SQL | Data extraction and aggregation |
| Parquet | Efficient processed ML data storage |

### Machine Learning

| Tool | Why Used |
| --- | --- |
| Python | Main data science and backend language |
| pandas | Data cleaning, joining, feature engineering |
| scikit-learn | Baseline modeling and evaluation |
| XGBoost | Main predictive model |
| SHAP-style explanations | To explain risk drivers |

### Backend

| Tool | Why Used |
| --- | --- |
| FastAPI | API layer for dashboard and model outputs |
| Uvicorn | Local FastAPI server |
| PostgreSQL connector | Pulls model and business data from DB |

### Frontend

| Tool | Why Used |
| --- | --- |
| React | Interactive dashboard UI |
| TypeScript | Safer frontend code |
| Vite | Fast frontend build system |
| Tailwind CSS | Dashboard styling |
| Recharts | Charts and visual analytics |
| Lucide React | UI icons |

### Deployment and Version Control

| Tool | Why Used |
| --- | --- |
| Git | Version control |
| GitHub | Public project hosting |
| GitHub Actions | Automated frontend build and deploy |
| GitHub Pages | Free live dashboard hosting |

### Assistant Layer

| Tool | Why Used |
| --- | --- |
| Ollama | Local LLM explanation assistant |
| Simple RAG logic | Explains dashboard and model results using project context |

## Final Project Output

The final project includes:

- PostgreSQL-backed data pipeline
- Modeling table at store-SKU-date level
- XGBoost stockout prediction model
- 2024 train / 2025 score setup
- Event-level prior-alert evaluation
- Revenue protected and missed revenue analysis
- Root cause and duration analysis
- React dashboard
- Public GitHub Pages deployment
- Static demo fallback for portfolio use
- Anonymized 10-store dataset
- README and supporting project documentation

## Key Business Takeaway

ShelfSignal shows how machine learning can be used as a practical retail decision-support tool.

The main value is not just predicting a stockout. The value is:

```text
Predict early → explain why → recommend action → protect revenue
```

