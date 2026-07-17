# Anonymized 10-Store Dataset

This folder contains a publishable 10-store subset of the retail stockout data.

## Included Files

- `stores.csv`
- `products.csv`
- `suppliers.csv`
- `promotions.csv`
- `store_layout.csv`
- `sales_transactions.csv`
- `inventory_snapshots.csv`
- `replenishment_logs.csv`
- `stockout_events.csv`
- `demand_forecasts.csv`

## Anonymization

The export keeps operational patterns needed for analysis and modeling, but removes or replaces direct identifiers:

- Store IDs and store names are replaced with `STORE_###` and `Demo Store ##`.
- City, state, and region are generalized.
- SKU IDs are replaced with `SKU_####`.
- Product names keep a shortened non-brand description, such as `Value Pack Energy Drinks 250g`.
- Supplier IDs and supplier names are replaced.
- Brand names are replaced.
- Promotion names and IDs are replaced.
- Transaction, inventory, replenishment, stockout, forecast, and layout IDs are replaced.
- Product barcodes are blanked.
- Replenishment associate IDs are blanked.

Business fields such as dates, units, prices, inventory quantities, categories, subcategories, lead times, promotion lift, stockout duration, root cause, and lost revenue are retained so the dataset remains useful.

## Regenerate

From the project root:

```bash
DATABASE_URL=postgresql:///retail_stockout .venv/bin/python scripts/export_anonymized_10_store_dataset.py
```
