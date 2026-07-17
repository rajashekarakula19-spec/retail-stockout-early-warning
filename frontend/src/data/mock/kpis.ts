import type { KpiSummary } from "../../lib/api/types";

export const kpis: KpiSummary = {
  storesAtRisk: 478,
  skusAtRisk: 703,
  projectedLostSales: 1426000,
  forecastAccuracy: 0.737,
  alertsToday: 1684,
};

export const executiveSummary =
  "Stockout exposure is concentrated in high-velocity categories where backroom inventory and delayed replenishment create immediate shelf availability risk. XGBoost is tuned for high recall so store teams see likely misses early.";
