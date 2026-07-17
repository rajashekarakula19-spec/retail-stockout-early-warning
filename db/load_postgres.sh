#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-retail_stockout}"
CSV_DIR="${CSV_DIR:-$PROJECT_ROOT/../output globeant/csv}"
TMP_DIR="$PROJECT_ROOT/db/load_tmp"
PYTHON_BIN="${PYTHON_BIN:-$PROJECT_ROOT/.venv/bin/python}"
LOAD_RAW="${LOAD_RAW:-1}"
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed or not on PATH." >&2
  exit 1
fi

if ! psql -lqt | cut -d '|' -f 1 | grep -qw "$DB_NAME"; then
  createdb "$DB_NAME"
fi

psql "$DB_NAME" -v ON_ERROR_STOP=1 -f "$PROJECT_ROOT/db/schema.sql"

if [[ "$LOAD_RAW" == "1" ]]; then
  psql "$DB_NAME" -v ON_ERROR_STOP=1 -c "TRUNCATE
    retail_raw.demand_forecasts,
    retail_raw.inventory_snapshots,
    retail_raw.products,
    retail_raw.promotions,
    retail_raw.replenishment_logs,
    retail_raw.sales_transactions,
    retail_raw.stockout_events,
    retail_raw.store_layout,
    retail_raw.stores,
    retail_raw.suppliers
    RESTART IDENTITY;"
fi

psql "$DB_NAME" -v ON_ERROR_STOP=1 -c "TRUNCATE
  retail_ml.modeling_table,
  retail_ml.scored_test_rows,
  retail_ml.stockout_action_recommendations,
  retail_ml.evaluation_metrics,
  retail_ml.shap_feature_importance,
  retail_ml.confusion_matrix
  RESTART IDENTITY;"

copy_csv() {
  local table_name="$1"
  local csv_file="$2"
  local columns
  columns="$(head -n 1 "$csv_file" | tr -d '\r')"
  echo "Loading $table_name from $csv_file"
  psql "$DB_NAME" -v ON_ERROR_STOP=1 -c "\\copy $table_name ($columns) FROM '$csv_file' WITH (FORMAT csv, HEADER true)"
}

if [[ "$LOAD_RAW" == "1" ]]; then
  copy_csv "retail_raw.stores" "$CSV_DIR/stores.csv"
  copy_csv "retail_raw.suppliers" "$CSV_DIR/suppliers.csv"
  copy_csv "retail_raw.products" "$CSV_DIR/products.csv"
  copy_csv "retail_raw.promotions" "$CSV_DIR/promotions.csv"
  copy_csv "retail_raw.store_layout" "$CSV_DIR/store_layout.csv"
  copy_csv "retail_raw.inventory_snapshots" "$CSV_DIR/inventory_snapshots.csv"
  copy_csv "retail_raw.replenishment_logs" "$CSV_DIR/replenishment_logs.csv"
  copy_csv "retail_raw.stockout_events" "$CSV_DIR/stockout_events.csv"
  copy_csv "retail_raw.sales_transactions" "$CSV_DIR/sales_transactions.csv"
  copy_csv "retail_raw.demand_forecasts" "$CSV_DIR/demand_forecasts.csv"
fi

mkdir -p "$TMP_DIR"
"$PYTHON_BIN" "$PROJECT_ROOT/db/export_processed_for_postgres.py" --output-dir "$TMP_DIR"

copy_csv "retail_ml.modeling_table" "$TMP_DIR/modeling_table.csv"
copy_csv "retail_ml.scored_test_rows" "$TMP_DIR/scored_test_rows.csv"
copy_csv "retail_ml.stockout_action_recommendations" "$PROJECT_ROOT/reports/tables/stockout_action_recommendations.csv"
copy_csv "retail_ml.evaluation_metrics" "$PROJECT_ROOT/reports/tables/evaluation_metrics.csv"
copy_csv "retail_ml.shap_feature_importance" "$PROJECT_ROOT/reports/tables/shap_feature_importance.csv"
copy_csv "retail_ml.confusion_matrix" "$TMP_DIR/confusion_matrix.csv"

psql "$DB_NAME" -v ON_ERROR_STOP=1 -f "$PROJECT_ROOT/db/indexes.sql"

psql "$DB_NAME" -v ON_ERROR_STOP=1 -c "
SELECT 'stores' AS table_name, count(*) FROM retail_raw.stores
UNION ALL SELECT 'products', count(*) FROM retail_raw.products
UNION ALL SELECT 'sales_transactions', count(*) FROM retail_raw.sales_transactions
UNION ALL SELECT 'inventory_snapshots', count(*) FROM retail_raw.inventory_snapshots
UNION ALL SELECT 'replenishment_logs', count(*) FROM retail_raw.replenishment_logs
UNION ALL SELECT 'stockout_events', count(*) FROM retail_raw.stockout_events
UNION ALL SELECT 'demand_forecasts', count(*) FROM retail_raw.demand_forecasts
UNION ALL SELECT 'modeling_table', count(*) FROM retail_ml.modeling_table
UNION ALL SELECT 'scored_test_rows', count(*) FROM retail_ml.scored_test_rows
ORDER BY table_name;"
