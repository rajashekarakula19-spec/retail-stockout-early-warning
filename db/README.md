# PostgreSQL Database

This folder turns the local CSV/Parquet prototype into a production-style PostgreSQL data layer.

## Schemas

- `retail_raw`: source operational data from CSV files
- `retail_ml`: processed modeling table, scored predictions, metrics, explanations, and recommended actions

## Install PostgreSQL

On macOS with Homebrew:

```bash
brew install postgresql@16
brew services start postgresql@16
```

If `psql` is not on your `PATH`, add:

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

## Load Data

From the project root:

```bash
DB_NAME=retail_stockout ./db/load_postgres.sh
```

The loader:

1. Creates the database if needed
2. Creates `retail_raw` and `retail_ml` schemas
3. Loads all raw CSV files with PostgreSQL `COPY`
4. Exports processed Parquet artifacts to temporary CSV files
5. Loads model outputs into `retail_ml`
6. Builds indexes and runs `ANALYZE`

## Useful Queries

High-risk work queue:

```sql
SELECT *
FROM retail_ml.current_high_risk_queue
LIMIT 50;
```

Risk trend for dashboards:

```sql
SELECT date, risk_level, store_sku_count
FROM retail_ml.daily_risk_trend
ORDER BY date, risk_level;
```

Example stockout history:

```sql
SELECT *
FROM retail_raw.stockout_events
WHERE store_id = 'S0207'
  AND sku_id = 'P00641'
ORDER BY stockout_date;
```
