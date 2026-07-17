from __future__ import annotations

import csv
import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql:///retail_stockout")
OUT_DIR = Path("data/anonymized_10_store_dataset")


def fetch_all(conn: psycopg.Connection, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(query, params or {})
        return list(cur.fetchall())


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def code_map(values: list[str], prefix: str, width: int = 4) -> dict[str, str]:
    return {value: f"{prefix}_{idx:0{width}d}" for idx, value in enumerate(sorted(set(values)), start=1)}


def short_product_name(row: dict[str, Any]) -> str:
    name = str(row.get("product_name") or "").strip()
    brand = str(row.get("brand") or "").strip()
    if brand and name.startswith(f"{brand} "):
        name = name[len(brand) + 1 :].strip()
    if name:
        return name
    subcategory = str(row.get("subcategory") or "").strip()
    category = str(row.get("category") or "").strip()
    return subcategory or category or "Product"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        store_rows = fetch_all(
            conn,
            """
            SELECT *
            FROM retail_raw.stores
            ORDER BY store_id
            LIMIT 10
            """,
        )
        store_ids = [row["store_id"] for row in store_rows]
        store_map = code_map(store_ids, "STORE", 3)

        sku_rows = fetch_all(
            conn,
            """
            SELECT DISTINCT sku_id
            FROM (
                SELECT sku_id FROM retail_raw.sales_transactions WHERE store_id = ANY(%(store_ids)s)
                UNION
                SELECT sku_id FROM retail_raw.inventory_snapshots WHERE store_id = ANY(%(store_ids)s)
                UNION
                SELECT sku_id FROM retail_raw.replenishment_logs WHERE store_id = ANY(%(store_ids)s)
                UNION
                SELECT sku_id FROM retail_raw.stockout_events WHERE store_id = ANY(%(store_ids)s)
                UNION
                SELECT sku_id FROM retail_raw.demand_forecasts WHERE store_id = ANY(%(store_ids)s)
            ) skus
            ORDER BY sku_id
            """,
            {"store_ids": store_ids},
        )
        sku_ids = [row["sku_id"] for row in sku_rows]
        sku_map = code_map(sku_ids, "SKU", 4)

        product_rows = fetch_all(conn, "SELECT * FROM retail_raw.products WHERE sku_id = ANY(%(sku_ids)s) ORDER BY sku_id", {"sku_ids": sku_ids})
        supplier_ids = sorted({row["supplier_id"] for row in product_rows if row.get("supplier_id")})
        supplier_map = code_map(supplier_ids, "SUPPLIER", 3)
        brand_values = sorted({row["brand"] for row in product_rows if row.get("brand")})
        brand_map = code_map(brand_values, "BRAND", 3)

        promotion_rows = fetch_all(
            conn,
            """
            SELECT *
            FROM retail_raw.promotions
            WHERE store_id = ANY(%(store_ids)s)
              AND sku_id = ANY(%(sku_ids)s)
            ORDER BY promotion_id
            """,
            {"store_ids": store_ids, "sku_ids": sku_ids},
        )
        promotion_map = code_map([row["promotion_id"] for row in promotion_rows], "PROMO", 4)

        stores = []
        for idx, row in enumerate(store_rows, start=1):
            stores.append(
                {
                    "store_id": store_map[row["store_id"]],
                    "store_name": f"Demo Store {idx:02d}",
                    "region": f"Region {idx:02d}",
                    "city": f"City {idx:02d}",
                    "state": f"ST{idx:02d}",
                    "store_format": row["store_format"],
                    "foot_traffic_tier": row["foot_traffic_tier"],
                    "num_aisles": row["num_aisles"],
                    "open_date": row["open_date"],
                    "sq_footage": row["sq_footage"],
                }
            )
        write_csv(OUT_DIR / "stores.csv", stores)

        products = []
        for row in product_rows:
            products.append(
                {
                    "sku_id": sku_map[row["sku_id"]],
                    "product_name": short_product_name(row),
                    "brand": brand_map.get(row.get("brand"), ""),
                    "category": row["category"],
                    "subcategory": row["subcategory"],
                    "unit_price": row["unit_price"],
                    "unit_cost": row["unit_cost"],
                    "unit_weight_g": row["unit_weight_g"],
                    "shelf_life_days": row["shelf_life_days"],
                    "is_perishable": row["is_perishable"],
                    "supplier_id": supplier_map.get(row.get("supplier_id"), ""),
                    "barcode": "",
                    "pack_size": row["pack_size"],
                    "reorder_point": row["reorder_point"],
                    "safety_stock": row["safety_stock"],
                }
            )
        write_csv(OUT_DIR / "products.csv", products)

        supplier_rows = fetch_all(conn, "SELECT * FROM retail_raw.suppliers WHERE supplier_id = ANY(%(supplier_ids)s) ORDER BY supplier_id", {"supplier_ids": supplier_ids})
        suppliers = []
        for idx, row in enumerate(supplier_rows, start=1):
            suppliers.append(
                {
                    "supplier_id": supplier_map[row["supplier_id"]],
                    "supplier_name": f"Supplier {idx:03d}",
                    "country": "Country",
                    "lead_time_days_avg": row["lead_time_days_avg"],
                    "lead_time_days_std": row["lead_time_days_std"],
                    "reliability_score": row["reliability_score"],
                    "min_order_qty": row["min_order_qty"],
                    "contract_start": row["contract_start"],
                    "payment_terms_days": row["payment_terms_days"],
                }
            )
        write_csv(OUT_DIR / "suppliers.csv", suppliers)

        promotions = []
        for idx, row in enumerate(promotion_rows, start=1):
            promotions.append(
                {
                    "promotion_id": promotion_map[row["promotion_id"]],
                    "promotion_name": f"Promotion {idx:04d}",
                    "promo_type": row["promo_type"],
                    "start_date": row["start_date"],
                    "end_date": row["end_date"],
                    "discount_pct": row["discount_pct"],
                    "sku_id": sku_map[row["sku_id"]],
                    "store_id": store_map[row["store_id"]],
                    "demand_lift_factor": row["demand_lift_factor"],
                }
            )
        write_csv(OUT_DIR / "promotions.csv", promotions)

        table_specs = [
            (
                "sales_transactions",
                """
                SELECT *
                FROM retail_raw.sales_transactions
                WHERE store_id = ANY(%(store_ids)s)
                  AND sku_id = ANY(%(sku_ids)s)
                ORDER BY sale_date, transaction_id
                """,
                "transaction_id",
                "TX",
            ),
            (
                "inventory_snapshots",
                """
                SELECT *
                FROM retail_raw.inventory_snapshots
                WHERE store_id = ANY(%(store_ids)s)
                  AND sku_id = ANY(%(sku_ids)s)
                ORDER BY snapshot_date, snapshot_id
                """,
                "snapshot_id",
                "INV",
            ),
            (
                "replenishment_logs",
                """
                SELECT *
                FROM retail_raw.replenishment_logs
                WHERE store_id = ANY(%(store_ids)s)
                  AND sku_id = ANY(%(sku_ids)s)
                ORDER BY replenishment_date, replenishment_id
                """,
                "replenishment_id",
                "REP",
            ),
            (
                "stockout_events",
                """
                SELECT *
                FROM retail_raw.stockout_events
                WHERE store_id = ANY(%(store_ids)s)
                  AND sku_id = ANY(%(sku_ids)s)
                ORDER BY stockout_date, stockout_id
                """,
                "stockout_id",
                "SO",
            ),
            (
                "demand_forecasts",
                """
                SELECT *
                FROM retail_raw.demand_forecasts
                WHERE store_id = ANY(%(store_ids)s)
                  AND sku_id = ANY(%(sku_ids)s)
                ORDER BY forecast_date, forecast_id
                """,
                "forecast_id",
                "FC",
            ),
        ]

        for table_name, query, id_column, prefix in table_specs:
            rows = fetch_all(conn, query, {"store_ids": store_ids, "sku_ids": sku_ids})
            id_map = code_map([row[id_column] for row in rows], prefix, 7)
            output = []
            for row in rows:
                item = dict(row)
                item[id_column] = id_map[row[id_column]]
                item["store_id"] = store_map[row["store_id"]]
                item["sku_id"] = sku_map[row["sku_id"]]
                if "promotion_id" in item and item["promotion_id"]:
                    item["promotion_id"] = promotion_map.get(item["promotion_id"], "")
                if "associate_id" in item:
                    item["associate_id"] = ""
                output.append(item)
            write_csv(OUT_DIR / f"{table_name}.csv", output)

        layout_rows = fetch_all(
            conn,
            """
            SELECT *
            FROM retail_raw.store_layout
            WHERE store_id = ANY(%(store_ids)s)
              AND (assigned_sku_id IS NULL OR assigned_sku_id = ANY(%(sku_ids)s))
            ORDER BY store_id, layout_id
            """,
            {"store_ids": store_ids, "sku_ids": sku_ids},
        )
        layout_id_map = code_map([row["layout_id"] for row in layout_rows], "LAYOUT", 7)
        layouts = []
        for idx, row in enumerate(layout_rows, start=1):
            layouts.append(
                {
                    "layout_id": layout_id_map[row["layout_id"]],
                    "store_id": store_map[row["store_id"]],
                    "aisle_id": f"AISLE_{idx:05d}",
                    "aisle_name": f"Aisle {idx:05d}",
                    "shelf_id": f"SHELF_{idx:05d}",
                    "slot_id": f"SLOT_{idx:05d}",
                    "capacity_units": row["capacity_units"],
                    "assigned_sku_id": sku_map.get(row.get("assigned_sku_id"), ""),
                    "facing_count": row["facing_count"],
                }
            )
        write_csv(OUT_DIR / "store_layout.csv", layouts)

    print(f"Wrote anonymized 10-store dataset to {OUT_DIR}")


if __name__ == "__main__":
    main()
