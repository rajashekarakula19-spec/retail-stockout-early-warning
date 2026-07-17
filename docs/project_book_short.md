# Retail Stockout Early-Warning System: Short Project Book

## 1. Project Idea

Retail stores lose sales when products are not available on the shelf. This project predicts which store-product combinations may stock out soon.

The goal is not only to predict risk, but also to recommend an action.

## 2. Simple Logic

The system looks at:

```text
Recent demand + current inventory + replenishment behavior + past stockouts
```

Then it estimates:

```text
Will this product stock out in the next 3, 7, or 14 days?
```

Simple example:

```text
Product sells 32 units per day.
Store has 121 units on hand.
Backroom has 103 units.
Supplier/replenishment has been delayed.
This item has stocked out before.
```

The model sees high demand and stockout history, then predicts high risk.

Recommended action:

```text
Move backroom inventory to shelf and check replenishment.
```

## 3. Data Used

Main data:

- `sales_transactions`: what sold, where, when, and how many units
- `inventory_snapshots`: current stock on hand and backroom inventory
- `replenishment_logs`: orders, received units, and supplier lead time
- `stockout_events`: when stockouts happened and estimated lost sales

Supporting data:

- `products`: product category, price, cost, supplier, reorder point
- `stores`: store location, region, format
- `suppliers`: lead time and reliability
- `promotions`: promotion periods and demand lift
- `demand_forecasts`: expected future demand

## 4. Modeling Table

The project creates one row for each:

```text
store + SKU + date
```

Example row:

```text
FreshPlace Louisville + NovaBrand Skincare + 2025-05-15
```

Features include:

- sales last 7 days
- sales last 14 days
- average daily demand
- units on hand
- backroom inventory
- days of supply
- days since last replenishment
- supplier lead time
- past stockout frequency

## 5. Targets

The main target is:

```text
1 = stockout happens within next 7 days
0 = no stockout happens within next 7 days
```

The improved system also tracks 3-day urgent risk and 14-day planning risk. The project uses 2024 as the training period and keeps 2025 as future/unseen data for production-style testing.

## 6. Model

The project trains:

- Logistic Regression as a baseline
- XGBoost as the main model

Recall is most important because missing a real stockout is costly.

## 7. Dynamic Alerts

The model gives a stockout probability. The alert system then uses a product-specific threshold.

```text
Product A probability = 38%
Lead time = 12 days
Days of supply = 3
Alert = High

Product B probability = 38%
Lead time = 1 day
Days of supply = 12
Alert = Medium or Low
```

This is better than one fixed threshold because products with long lead time, high demand, low inventory, or stockout history need earlier warnings.

## 8. Weekly Upload Flow

The dashboard has a weekly upload option for sales, inventory, replenishment, and stockout events.

```text
CSV upload → PostgreSQL raw table → affected store-SKUs rescored → dashboard alerts refresh
```

If replenishment increases inventory, the alert can move from Critical/High down to Medium/Low.

## 9. Dashboard Meaning

The dashboard shows:

- **Stockout probability**: chance of stockout in next 7 days
- **3-day risk**: urgent stockout danger
- **14-day risk**: planning risk
- **Alert threshold**: the probability level where this product starts needing attention
- **Risk level**: critical, high, medium, or low
- **Days of supply**: how long inventory can cover demand
- **On-hand inventory**: current available shelf/store inventory
- **Recent replenishment**: newly received units
- **Estimated lost sales**: expected revenue loss if stockout happens
- **Recommended action**: reorder, transfer, move backroom stock, or monitor

## 10. Database and API Flow

Production-style flow:

```text
PostgreSQL → FastAPI → React dashboard
PostgreSQL → ML training pipeline
```

PostgreSQL stores:

- raw retail data in `retail_raw`
- model outputs in `retail_ml`

## 11. Business Value

This project helps retail teams:

- prevent stockouts before they happen
- reduce lost sales
- prioritize high-risk stores and products
- explain why a product is risky
- take clear operational action
