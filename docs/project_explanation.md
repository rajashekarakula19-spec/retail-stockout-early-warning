# Retail Stockout Early-Warning System Explanation

## Project Goal

This project predicts whether a store-SKU will stock out in the next 7 days and turns that prediction into a business action.

Instead of only reporting past stockouts, it helps answer:

> Which products are likely to stock out soon, where, why, and what should the business do?

## Data Used

Main model data:

- Sales transactions
- Inventory snapshots
- Replenishment logs
- Stockout events

Supporting data:

- Products
- Stores
- Suppliers
- Promotions
- Demand forecasts

The core modeling grain is:

```text
store + SKU + date
```

## Target

The model target is:

```text
1 = stockout occurs within the next 7 days
0 = no stockout occurs within the next 7 days
```

## Important Features

Examples:

- Sales in the last 7 and 14 days
- Average daily demand
- Units on hand
- Backroom inventory
- Days of supply
- Days since last replenishment
- Supplier lead time
- Historical stockout frequency

## Model

Two models are trained:

- Logistic Regression as baseline
- XGBoost as main model

The most important metric is **recall** because missing a real stockout is costly.

## PostgreSQL + API Flow

Current production-style flow:

```text
PostgreSQL → FastAPI backend → React frontend
PostgreSQL → ML training pipeline
```

Schemas:

- `retail_raw`: raw operational data
- `retail_ml`: model outputs, predictions, metrics, SHAP, recommendations

## Dashboard Pages

### Overview

Explains the product and shows:

- Business value
- Risk trend preview
- High-risk product preview

### Risk Dashboard

Shows:

- Stores at risk
- SKUs at risk
- Projected lost sales
- Model PR-AUC
- Risk trend by alert level
- High-risk product table
- Recommended actions

### Predictions

Lets the user select:

```text
store + SKU
```

Then shows:

- Stockout probability
- Risk level
- Days of supply
- Estimated lost sales
- Recommended action
- Risk drivers
- Scenario simulation

## Example

For:

```text
FreshPlace Louisville
NovaBrand Natural Skincare 250g
```

The model predicted very high stockout risk before a recorded stockout happened. This shows how the system can warn teams early and recommend shelf/replenishment actions.

## Business Value

The project helps retail teams:

- Reduce lost sales
- Prioritize high-risk products
- Improve shelf availability
- Detect supplier or replenishment issues earlier
- Convert ML predictions into operational decisions
