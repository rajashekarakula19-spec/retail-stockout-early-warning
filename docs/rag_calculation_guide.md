# ShelfSignal RAG Calculation Guide

This guide exists so the assistant can explain dashboard metrics with formulas, not only repeat final numbers.

## Revenue Protected

Revenue protected means the stockout revenue loss that had a prior warning.

Calculation logic:

```text
For each actual 2025 stockout event:
    Look back 1 to 7 days before the stockout date.
    If there was at least one alert for the same store + SKU:
        mark the stockout event as covered.
    Otherwise:
        mark it as missed.

Revenue protected =
sum(estimated_lost_revenue for covered stockout events)
```

Project result:

```text
Total 2025 stockout revenue at risk = $6,264,446.53
Revenue protected by prior alerts = $6,245,380.68
Missed revenue = $19,065.85

Revenue coverage rate =
$6,245,380.68 / $6,264,446.53
= 99.7%
```

Important explanation:

Revenue protected does not mean money was automatically saved in reality. It means the system generated an early alert for those stockout events, so that revenue was theoretically protectable if the business acted on the alert.

## Missed Revenue

Missed revenue means actual stockout revenue loss where the model did not produce a prior alert in the 1-7 day warning window.

Formula:

```text
Missed revenue =
sum(estimated_lost_revenue for actual stockout events with no prior alert)
```

Project result:

```text
Missed revenue = $19,065.85
```

## Revenue Coverage Rate

Formula:

```text
Revenue coverage rate =
Revenue protected / Total stockout revenue at risk
```

Project result:

```text
$6,245,380.68 / $6,264,446.53 = 0.997
Revenue coverage rate = 99.7%
```

## Covered Events

Covered events are actual 2025 stockout events that had at least one prior alert 1-7 days before stockout.

Formula:

```text
Covered events =
count(actual stockout events where prior alert exists in the 1-7 day warning window)
```

Project result:

```text
Actual 2025 stockout events = 3,888
Covered events = 3,876
Missed events = 12
```

## Average Warning Days

Average warning days tells how early the model alerted before covered stockouts.

Formula:

```text
warning_days = stockout_date - first_prior_alert_date
average_warning_days = average(warning_days for covered events)
```

Project result:

```text
Average warning time = 6.8 days
```

## Precision

Precision answers:

```text
When the model gave an alert, how often was it correct?
```

Formula:

```text
Precision =
Successful predictions / (Successful predictions + False alerts)
```

Example from dashboard:

```text
Successful predictions = 23,838
False alerts = 31,224

Precision =
23,838 / (23,838 + 31,224)
= 23,838 / 55,062
= 43.3%
```

## Recall

Recall answers:

```text
Of the real stockout cases, how many did the model catch?
```

Formula:

```text
Recall =
Successful predictions / (Successful predictions + Missed stockouts)
```

Example from dashboard:

```text
Successful predictions = 23,838
Missed stockouts = 566

Recall =
23,838 / (23,838 + 566)
= 97.7%
```

## Accuracy

Accuracy answers:

```text
Across all scored rows, how many predictions were correct?
```

Formula:

```text
Accuracy =
(Successful predictions + Correct no alerts) / Total scored rows
```

Accuracy can look high in stockout projects because most store-SKU-date rows are non-stockout cases. Recall and precision are more important for stockout prevention.

## Alert Threshold

The final alert threshold is not one random fixed number.

Calculation logic:

```text
Start with an overall recall-oriented threshold.
Adjust by product/store risk signals.
Alert if:
stockout_probability >= adjusted_threshold
```

Threshold decreases when the system should alert earlier:

- low days of supply
- high recent demand
- long supplier lead time
- high stockout history
- perishable category
- high unit price

Threshold increases when risk is less urgent:

- slow seller
- enough inventory
- backroom buffer
- recent replenishment
- strong false-alert history

## Why 7-Day Stockout Target

The model predicts whether a stockout will happen in the next 7 days because the business needs time to act.

Useful actions include:

- move inventory from backroom to shelf
- reorder immediately
- expedite replenishment
- transfer stock from another store
- monitor high-risk products daily

Predicting the exact stockout date is less useful than alerting early enough to prevent lost sales.

