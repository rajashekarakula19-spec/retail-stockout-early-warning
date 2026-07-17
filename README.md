# ShelfSignal: Retail Stockout Early-Warning System

ShelfSignal is a stockout early-warning and decision-support project for retail stores. It predicts whether a store-SKU is likely to stock out in the next 7 days, explains the risk drivers, and converts predictions into recommended actions such as reorder, expedite replenishment, or move inventory from backroom to shelf.

## Project Highlights

- PostgreSQL-backed retail analytics pipeline
- One modeling row per `store + SKU + date`
- XGBoost stockout-risk model with Logistic Regression baseline
- 2024 training and full-year 2025 daily scoring
- Event-level validation: checks whether each actual 2025 stockout had a prior alert 1-7 days before the event
- Recall-oriented threshold tuning for stockout prevention
- Product-specific threshold adjustments
- Time-series demand forecast signals in the prediction dashboard
- SHAP-style explainability artifacts
- React dashboard with Overview, Risk Dashboard, Predictions, and Results pages
- Optional Ollama assistant for plain-English explanations
- Publishable anonymized 10-store dataset included

## Dashboard Pages

- **Overview**: project scope, daily prediction volume, and event-level business coverage snapshot
- **Risk Dashboard**: switchable 2024/2025 business analytics for stockout loss, events, lost units, causes, durations, products, and category revenue
- **Predictions**: date-window store drill-down with product risk, forecast demand, probability, prediction result, root cause, and action
- **Results**: 2025 event-level evaluation, threshold tuning, revenue covered by prior alerts, missed stockouts, and root-cause charts

## Data

The full local project uses PostgreSQL schemas:

- `retail_raw`: raw operational tables
- `retail_ml`: modeling table, scored rows, model outputs, recommendations, metrics

Main source tables:

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

## Publishable Dataset

A 10-store anonymized dataset is available in:

```text
data/anonymized_10_store_dataset/
```

It includes sanitized versions of the major source CSVs. Direct identifiers such as real store names, SKU IDs, supplier names, brand names, barcodes, transaction IDs, and associate IDs are replaced or removed. Product names keep a short non-brand description, and business-useful fields such as dates, quantities, prices, category, inventory, replenishment, stockout duration, root cause, and lost revenue are retained.

Regenerate it from PostgreSQL:

```bash
DATABASE_URL=postgresql:///retail_stockout .venv/bin/python scripts/export_anonymized_10_store_dataset.py
```

## Model Approach

The model predicts:

```text
stockout_next_7d = 1 if a stockout occurs within the next 7 days
```

Features include:

- sales in last 7 and 14 days
- average daily demand
- on-hand inventory
- backroom inventory
- days of supply
- days since last replenishment
- recent replenishment quantity
- supplier lead time
- historical stockout frequency
- product, store, and category signals

The operating threshold is recall-oriented because missing a real stockout is costly. The project first tunes an overall threshold, then applies product-specific adjustments for low days of supply, long lead time, fast sellers, perishable categories, high stockout history, backroom buffers, replenishment, and false-alert history.

Current 10-store daily scoring scope:

- Modeling table: **584,571 rows** across 2024-2025
- 2025 scored prediction rows: **291,833**
- Active 10-store store-SKU pairs: **800**

Current event-level 2025 result:

- Actual stockout events: **3,888**
- Total 2025 stockout loss: **$6,264,446.53**
- Events covered by prior alerts: **3,876**
- Missed events: **12**
- Revenue covered by prior alerts: **$6,245,380.68**
- Missed revenue: **$19,065.85**
- Average warning time: **6.8 days**

## Local Setup

Create the Python environment:

```bash
cd retail-stockout-early-warning
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

On macOS, XGBoost may require OpenMP:

```bash
brew install libomp
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

## PostgreSQL

Create and load the local database:

```bash
createdb retail_stockout
DB_NAME=retail_stockout ./db/load_postgres.sh
```

Run the modeling pipeline from PostgreSQL:

```bash
DATABASE_URL=postgresql:///retail_stockout PYTHONPATH=src .venv/bin/python -m stockout_ews.pipeline --config config/project.yaml
```

If raw tables are already loaded and only model outputs need refresh:

```bash
LOAD_RAW=0 DB_NAME=retail_stockout ./db/load_postgres.sh
```

## Run Locally

Start backend:

```bash
DATABASE_URL=postgresql:///retail_stockout .venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Start frontend:

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

## Optional Ollama Assistant

The assistant uses Ollama when available and returns a fallback explanation when Ollama is offline.

```bash
ollama serve
ollama pull llama3.2
```

## Evaluation Metrics

The Results page reports:

- precision
- recall
- accuracy
- successful predictions
- false alerts
- missed stockouts
- revenue covered by prior alerts
- missed stockout revenue
- covered/missed causes
- covered/missed durations

Recall is emphasized because the business cost of missing a stockout is higher than investigating a false alert.

## Deployment

The repo includes a GitHub Pages workflow:

```text
.github/workflows/deploy-frontend.yml
```

After pushing to GitHub:

1. Open the repository on GitHub.
2. Go to **Settings > Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to the `main` branch.
5. GitHub Actions will build the React app and publish it.

The live frontend URL will be:

```text
https://<your-github-username>.github.io/<repo-name>/
```

The public GitHub Pages build uses the frontend fallback data if no backend URL is configured. For a fully live backend-backed deployment, deploy FastAPI separately on a service such as Render, Railway, Fly.io, or AWS, then set:

```text
VITE_API_BASE_URL=<your-backend-url>
```

## Repository Notes

- `frontend/dist/`, local virtual environments, model binaries, and generated processed tables are ignored.
- The anonymized 10-store CSV dataset is intentionally kept small enough for normal GitHub usage.
- The original full raw dataset should not be committed unless it is explicitly approved for public release.
