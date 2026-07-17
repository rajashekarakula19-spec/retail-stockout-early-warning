import { assistantReplies } from "../../data/mock/assistant";
import { executiveSummary, kpis } from "../../data/mock/kpis";
import { products } from "../../data/mock/products";
import { highRiskItems } from "../../data/mock/risk-items";
import { stores } from "../../data/mock/stores";
import { riskTrends } from "../../data/mock/trends";
import type {
  AssistantMessage,
  BestDemoWeek,
  CategoryRevenue,
  FetchNextWeekResult,
  FetchNextWeekStatus,
  HighRiskItem,
  KpiSummary,
  PredictionResult,
  PredictionMatrixSummary,
  Product,
  RevenueLossSummary,
  Results2025Summary,
  RiskLevel,
  RiskTrendPoint,
  ScenarioInput,
  StockoutDurationBucket,
  Store,
  StorePredictionGroup,
  ThresholdTuningSummary,
  WeeklyUploadResult,
} from "./types";

const delay = (ms = 220) => new Promise((resolve) => window.setTimeout(resolve, ms));
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function getJson<T>(path: string, fallback: () => Promise<T> | T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch {
    return fallback();
  }
}

async function postJson<T>(path: string, body: unknown, fallback: () => Promise<T> | T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch {
    return fallback();
  }
}

async function postText<T>(path: string, body: string, fallback: () => Promise<T> | T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch {
    return fallback();
  }
}

const riskFromProbability = (probability: number): RiskLevel => {
  if (probability >= 0.9) return "critical";
  if (probability >= 0.7) return "high";
  if (probability >= 0.45) return "medium";
  return "low";
};

const stableScore = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 10000;
  }
  return hash / 10000;
};

const actionFromProbability = (probability: number, daysOfSupply: number) => {
  if (probability >= 0.9 && daysOfSupply <= 7) return "Reorder immediately and verify shelf availability";
  if (probability >= 0.7) return "Review transfer or expedited replenishment";
  if (probability >= 0.45) return "Increase monitoring and confirm next replenishment";
  return "Monitor normal replenishment cycle";
};

export async function getExecutiveSummary() {
  const data = await getJson<{ summary: string }>("/api/executive-summary", async () => {
    await delay();
    return { summary: executiveSummary };
  });
  return data.summary;
}

export async function getKpis(): Promise<KpiSummary> {
  return getJson<KpiSummary>("/api/kpis", async () => {
    await delay();
    return kpis;
  });
}

export async function getRevenueLossCauses(): Promise<RevenueLossSummary> {
  return getJson<RevenueLossSummary>("/api/revenue-loss-causes", async () => {
    await delay();
    return {
      causes: [],
      products: [],
    };
  });
}

export async function getTopCategoriesByRevenue(): Promise<CategoryRevenue[]> {
  return getJson<CategoryRevenue[]>("/api/top-categories-by-revenue", async () => {
    await delay();
    return [];
  });
}

export async function getStockoutDurationDistribution(): Promise<StockoutDurationBucket[]> {
  return getJson<StockoutDurationBucket[]>("/api/stockout-duration-distribution", async () => {
    await delay();
    return [];
  });
}

export async function getRiskTrends(rangeDays = 90): Promise<RiskTrendPoint[]> {
  return getJson<RiskTrendPoint[]>(`/api/risk-trends?rangeDays=${rangeDays}`, async () => {
    await delay();
    return riskTrends.slice(rangeDays <= 45 ? -6 : 0);
  });
}

export async function getHighRiskItems(filters: {
  region?: string;
  category?: string;
  riskLevel?: RiskLevel | "all";
  search?: string;
}): Promise<HighRiskItem[]> {
  const params = new URLSearchParams();
  if (filters.region) params.set("region", filters.region);
  if (filters.category) params.set("category", filters.category);
  if (filters.riskLevel) params.set("riskLevel", filters.riskLevel);
  if (filters.search) params.set("search", filters.search);

  return getJson<HighRiskItem[]>(`/api/high-risk-items?${params.toString()}`, async () => {
    await delay();
    const search = filters.search?.trim().toLowerCase();
    return highRiskItems.filter((item) => {
      const regionMatch = !filters.region || filters.region === "all" || item.region === filters.region;
      const categoryMatch = !filters.category || filters.category === "all" || item.category === filters.category;
      const riskMatch = !filters.riskLevel || filters.riskLevel === "all" || item.riskLevel === filters.riskLevel;
      const searchMatch =
        !search ||
        item.storeName.toLowerCase().includes(search) ||
        item.productName.toLowerCase().includes(search) ||
        item.sku.toLowerCase().includes(search);
      return regionMatch && categoryMatch && riskMatch && searchMatch;
    });
  });
}

export async function getStores(): Promise<Store[]> {
  return getJson<Store[]>("/api/stores", async () => {
    await delay();
    return stores;
  });
}

export async function getProducts(): Promise<Product[]> {
  return getJson<Product[]>("/api/products", async () => {
    await delay();
    return products;
  });
}

export async function getBestDemoWeek(storeLimit = 10): Promise<BestDemoWeek> {
  return getJson<BestDemoWeek>(`/api/best-demo-week?storeLimit=${storeLimit}`, async () => {
    await delay();
    return {
      weekStart: "2025-12-01",
      weekEnd: "2025-12-07",
      stockoutEvents: 3,
      storesAffected: 10,
      productsAffected: 3,
    };
  });
}

export async function getPredictionMatrix2025(storeLimit = 10): Promise<PredictionMatrixSummary> {
  return getJson<PredictionMatrixSummary>(`/api/prediction-matrix-2025?storeLimit=${storeLimit}`, async () => {
    await delay();
    return {
      year: 2025,
      storeCount: storeLimit,
      rowsChecked: 0,
      predictedStockouts: 0,
      actualStockouts: 0,
      successfulPredictions: 0,
      falseAlerts: 0,
      missedStockouts: 0,
      correctNoAlerts: 0,
      precision: 0,
      recall: 0,
      accuracy: 0,
    };
  });
}

export async function getResults2025(storeLimit = 10): Promise<Results2025Summary> {
  return getJson<Results2025Summary>(`/api/results-2025?storeLimit=${storeLimit}`, async () => {
    await delay();
    const matrix = await getPredictionMatrix2025(storeLimit);
    return {
      matrix,
      stockoutEvents: 0,
      coveredEvents: 0,
      missedEvents: 0,
      estimatedRevenueAtRisk: 0,
      estimatedRevenueProtected: 0,
      estimatedRevenueMissed: 0,
      coverageRate: 0,
      revenueCoverageRate: 0,
      coveredCauses: [],
      missedCauses: [],
      coveredDurations: [],
      missedDurations: [],
      missedStockouts: [],
    };
  });
}

export async function getThresholdTuning2025(storeLimit = 10, falseAlertCost = 25, recallTarget = 0.85): Promise<ThresholdTuningSummary> {
  return getJson<ThresholdTuningSummary>(`/api/threshold-tuning-2025?storeLimit=${storeLimit}&falseAlertCost=${falseAlertCost}&recallTarget=${recallTarget}`, async () => {
    await delay();
    return {
      year: 2025,
      storeCount: storeLimit,
      rowsChecked: 0,
      actualStockouts: 0,
      totalRevenueAtRisk: 0,
      falseAlertCost,
      recallTarget,
      prAuc: 0,
      recommendedTechnique: "Cost/revenue sweet spot",
      recommendedThreshold: 0,
      techniques: [],
      curve: [],
    };
  });
}

export async function getStorePredictions(storeLimit = 10, productsPerStore = 80, startDate = "2025-01-01", endDate = "2025-01-07"): Promise<StorePredictionGroup[]> {
  return getJson<StorePredictionGroup[]>(`/api/store-predictions?storeLimit=${storeLimit}&productsPerStore=${productsPerStore}&startDate=${startDate}&endDate=${endDate}`, async () => {
    await delay();
    const grouped = stores.slice(0, storeLimit).map((store) => {
      const productsForStore = highRiskItems
        .filter((item) => item.storeId === store.id)
        .slice(0, productsPerStore)
        .map((item) => ({
          sku: item.sku,
          productName: item.productName,
          category: item.category,
          quantityAvailable: item.unitsOnHand ?? 0,
          shelfQuantity: item.unitsOnHand ?? 0,
          backroomQuantity: 0,
          sellingRate: item.avgDailyDemand7d ?? 0,
          forecast7dDemand: (item.avgDailyDemand7d ?? 0) * 7,
          forecast14dDemand: (item.avgDailyDemand7d ?? 0) * 14,
          forecastInventoryGap: (item.unitsOnHand ?? 0) - (item.avgDailyDemand7d ?? 0) * 7,
          forecastDaysOfSupply: item.daysOfSupply,
          demandSpike: false,
          possibleStockoutTime: `${item.daysOfSupply.toFixed(0)} days`,
          daysOfSupply: item.daysOfSupply,
          stockoutProbability: item.probability,
          timeSeriesAdjustedProbability: item.probability,
          probability3d: item.probability3d,
          probability14d: item.probability14d,
          riskLevel: item.riskLevel,
          alertThreshold: item.alertThreshold,
          thresholdReason: item.alertReason ?? "standard calibrated threshold",
          falseAlertRate: 0,
          recommendedAction: item.recommendedAction,
          predictedStockout: item.probability >= (item.alertThreshold ?? 0.45),
          actualStockout: false,
          predictionOutcome: item.probability >= (item.alertThreshold ?? 0.45) ? "False alert" : "Correct no alert",
          revenueLossReason: item.alertReason ?? "standard threshold",
          originalStockoutRootCause: "No stockout recorded",
          actualStockoutDate: null,
          actualRestockDate: null,
          actualStockoutEvents: 0,
        }));
      return {
        id: store.id,
        name: store.name,
        region: store.region,
        city: store.city,
        highestRisk: productsForStore[0]?.riskLevel ?? "low",
        avgProbability: productsForStore.reduce((sum, item) => sum + item.stockoutProbability, 0) / Math.max(productsForStore.length, 1),
        products: productsForStore,
      };
    });
    return grouped;
  });
}

export async function getPrediction(storeId: string, sku: string): Promise<PredictionResult> {
  return getJson<PredictionResult>(`/api/prediction?storeId=${encodeURIComponent(storeId)}&sku=${encodeURIComponent(sku)}`, async () => {
    await delay();
    const item = highRiskItems.find((candidate) => candidate.storeId === storeId && candidate.sku === sku);
    if (!item) {
      const product = products.find((candidate) => candidate.sku === sku) ?? products[0];
      const store = stores.find((candidate) => candidate.id === storeId) ?? stores[0];
      const score = stableScore(`${storeId}-${sku}`);
      const probability = Math.max(0.08, Math.min(0.96, 0.18 + score * 0.74));
      const daysOfSupply = Math.max(2.2, 24 - probability * 18 + stableScore(`${sku}-${storeId}`) * 5);
      const estimatedLostSales = Math.round((450 + score * 7800) * probability);
      return {
        storeId,
        sku,
        probability,
        riskLevel: riskFromProbability(probability),
        daysOfSupply,
        estimatedLostSales,
        recommendedAction: actionFromProbability(probability, daysOfSupply),
        drivers: [
          { name: "Days of supply", impact: Math.min(0.96, probability + 0.08), direction: "increases" },
          { name: `${product.category} demand volatility`, impact: 0.42 + score * 0.42, direction: "increases" },
          { name: `${store.region} replenishment pressure`, impact: 0.28 + stableScore(store.id) * 0.45, direction: "increases" },
          { name: "Safety stock buffer", impact: Math.max(0.18, 0.62 - probability / 2), direction: "reduces" },
        ],
      };
    }
    return {
      storeId,
      sku,
      probability: item.probability,
      riskLevel: item.riskLevel,
      daysOfSupply: item.daysOfSupply,
      estimatedLostSales: item.estimatedLostSales,
      recommendedAction: item.recommendedAction,
      drivers: [
        { name: "Low days of supply", impact: 0.92, direction: "increases" },
        { name: "Recent demand acceleration", impact: 0.78, direction: "increases" },
        { name: "Supplier lead-time pressure", impact: 0.64, direction: "increases" },
        { name: "Backroom inventory available", impact: 0.34, direction: "reduces" },
      ],
    };
  });
}

export async function simulateScenario(storeId: string, sku: string, params: ScenarioInput): Promise<PredictionResult> {
  return postJson<PredictionResult>(
    `/api/scenario?storeId=${encodeURIComponent(storeId)}&sku=${encodeURIComponent(sku)}`,
    params,
    async () => {
      await delay(140);
      const base = await getPrediction(storeId, sku);
      const probability = Math.max(
        0.04,
        Math.min(0.99, base.probability + (params.leadTimeDays - 3) * 0.035 + params.promoUpliftPct * 0.003 - params.safetyStockUnits * 0.0018),
      );
      return {
        ...base,
        probability,
        riskLevel: riskFromProbability(probability),
        daysOfSupply: Math.max(1, base.daysOfSupply + params.safetyStockUnits / 22 - params.promoUpliftPct / 20),
        estimatedLostSales: base.estimatedLostSales * (0.75 + probability),
        recommendedAction:
          probability >= 0.9
            ? "Expedite replenishment and confirm shelf availability today"
            : probability >= 0.7
              ? "Increase safety stock and monitor tomorrow morning"
              : "Monitor normal replenishment cycle",
      };
    },
  );
}

export async function sendAssistantMessage(message: string, history: AssistantMessage[]) {
  const data = await postJson<{ response: string }>("/api/assistant", { message, history }, async () => {
    await delay(360);
    const normalized = message.toLowerCase();
    const matched = assistantReplies.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));
    const contextNote = history.length > 2 ? " I also considered the current conversation context." : "";
    return { response: `${matched?.reply ?? "I can help explain data coverage, model results, drivers, and recommended stockout actions."}${contextNote}` };
  });
  return data.response;
}

export async function uploadWeeklyData(dataType: string, file: File): Promise<WeeklyUploadResult> {
  const text = await file.text();
  return postText<WeeklyUploadResult>(`/api/uploads/weekly?dataType=${encodeURIComponent(dataType)}`, text, async () => {
    await delay(260);
    return {
      dataType,
      rowsReceived: 0,
      rowsAccepted: 0,
      pairsRescored: 0,
      message: "Backend unavailable, so this upload was not saved. Start FastAPI and try again.",
    };
  });
}

export async function getFetchNextWeekStatus(): Promise<FetchNextWeekStatus> {
  return getJson<FetchNextWeekStatus>("/api/fetch-next-week/status", async () => {
    await delay(160);
    return {
      nextWeekStart: "2025-01-01",
      nextWeekEnd: "2025-01-07",
      lastFetchedEndDate: null,
      complete: false,
    };
  });
}

export async function fetchNextWeekFromDb(): Promise<FetchNextWeekResult> {
  return postJson<FetchNextWeekResult>("/api/fetch-next-week", {}, async () => {
    await delay(260);
    return {
      weekStart: null,
      weekEnd: null,
      pairsFound: 0,
      pairsScored: 0,
      difference: {
        avgProbabilityBefore: 0,
        avgProbabilityAfter: 0,
        avgAvailableBefore: 0,
        avgAvailableAfter: 0,
        actualStockouts: 0,
        topChanges: [],
      },
      complete: false,
      message: "Backend unavailable, so no DB week was fetched. Start FastAPI and try again.",
    };
  });
}
