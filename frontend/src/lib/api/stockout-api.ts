import { assistantReplies } from "../../data/mock/assistant";
import { executiveSummary, kpis } from "../../data/mock/kpis";
import { products } from "../../data/mock/products";
import { highRiskItems } from "../../data/mock/risk-items";
import {
  staticDurationDistributionByYear,
  staticExecutiveSummary,
  staticKpis,
  staticPredictionMatrix2025,
  staticProducts,
  staticResults2025,
  staticRevenueLossByYear,
  staticRiskTrendsByYear,
  staticStorePredictions,
  staticStores,
  staticThresholdTuning2025,
  staticTopCategoriesByYear,
  staticYearlySummaries,
} from "../../data/mock/static-demo";
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
  StorePredictionProduct,
  ThresholdTuningSummary,
  WeeklyUploadResult,
  YearlyStockoutSummary,
} from "./types";

const delay = (ms = 220) => new Promise((resolve) => window.setTimeout(resolve, ms));
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

function shiftedIsoDate(startDate: string, offsetDays: number) {
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function daysBetweenIso(startDate: string, endDate: string) {
  return Math.round((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86_400_000);
}

function simulateStaticInventory(product: StorePredictionProduct, startDate: string, index: number): StorePredictionProduct {
  const predictionDate = shiftedIsoDate(startDate, index % 7);
  const daysFromBase = Math.max(0, daysBetweenIso("2025-01-01", predictionDate));
  const cycleDay = (daysFromBase + index * 3) % 28;
  const replenishmentPulse = cycleDay <= 2 ? product.recentReplenishmentQty ?? 0 : 0;
  const demandDrawdown = product.sellingRate * cycleDay;
  const simulatedAvailable = Math.max(0, Math.round(product.quantityAvailable + replenishmentPulse - demandDrawdown));
  const stockoutDay = Math.min(6, (index % 7) + 1);
  const actualStockoutDate = product.actualStockout ? shiftedIsoDate(startDate, stockoutDay) : null;
  const isStockoutDate = actualStockoutDate ? predictionDate >= actualStockoutDate && predictionDate <= shiftedIsoDate(actualStockoutDate, 2) : false;
  const quantityAvailable = isStockoutDate ? 0 : simulatedAvailable;
  const shelfQuantity = quantityAvailable === 0 ? 0 : Math.min(quantityAvailable, Math.max(0, product.shelfQuantity - Math.round(product.sellingRate * Math.min(cycleDay, 7))));
  const backroomQuantity = Math.max(0, quantityAvailable - shelfQuantity);
  const forecast7dDemand = Math.round(product.sellingRate * 7);
  const forecastInventoryGap = quantityAvailable - forecast7dDemand;
  const daysOfSupply = quantityAvailable === 0 ? 0 : quantityAvailable / Math.max(product.sellingRate, 0.1);
  const stockoutPressure = quantityAvailable === 0 ? 0.28 : forecastInventoryGap < 0 ? 0.12 : forecastInventoryGap > 20 ? -0.08 : 0;
  const probability = Math.max(0.01, Math.min(0.99, product.stockoutProbability + stockoutPressure));
  const threshold = product.alertThreshold ?? 0.5;
  const predictedStockout = probability >= threshold;
  const actualStockout = product.actualStockout;

  return {
    ...product,
    predictionDate,
    actualStockoutDate,
    quantityAvailable,
    shelfQuantity,
    backroomQuantity,
    forecastInventoryGap,
    forecastDaysOfSupply: daysOfSupply,
    possibleStockoutTime: quantityAvailable === 0 ? "within 1 day" : daysOfSupply <= 3 ? "within 3 days" : daysOfSupply <= 7 ? "within 7 days" : `${daysOfSupply.toFixed(0)} days`,
    daysOfSupply,
    stockoutProbability: probability,
    timeSeriesAdjustedProbability: probability,
    riskLevel: riskFromProbability(probability),
    recentReplenishmentQty: replenishmentPulse,
    daysSinceLastReplenishment: cycleDay,
    predictedStockout,
    actualStockout,
    predictionOutcome: predictedStockout && actualStockout ? "Successful prediction" : !predictedStockout && actualStockout ? "Missed stockout" : predictedStockout ? "False alert" : "Correct no alert",
    recommendedAction: actionFromProbability(probability, daysOfSupply),
  };
}

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
    return { summary: staticExecutiveSummary || executiveSummary };
  });
  return data.summary;
}

export async function getKpis(): Promise<KpiSummary> {
  return getJson<KpiSummary>("/api/kpis", async () => {
    await delay();
    return staticKpis || kpis;
  });
}

export async function getYearlyStockoutSummary(year = 2025): Promise<YearlyStockoutSummary> {
  return getJson<YearlyStockoutSummary>(`/api/yearly-stockout-summary?year=${year}`, async () => {
    await delay();
    return staticYearlySummaries[year] ?? staticYearlySummaries[2025];
  });
}

export async function getRevenueLossCauses(year = 2024): Promise<RevenueLossSummary> {
  return getJson<RevenueLossSummary>(`/api/revenue-loss-causes?year=${year}`, async () => {
    await delay();
    return staticRevenueLossByYear[year] ?? staticRevenueLossByYear[2025];
  });
}

export async function getTopCategoriesByRevenue(year = 2024): Promise<CategoryRevenue[]> {
  return getJson<CategoryRevenue[]>(`/api/top-categories-by-revenue?year=${year}`, async () => {
    await delay();
    return staticTopCategoriesByYear[year] ?? staticTopCategoriesByYear[2025];
  });
}

export async function getStockoutDurationDistribution(year = 2024): Promise<StockoutDurationBucket[]> {
  return getJson<StockoutDurationBucket[]>(`/api/stockout-duration-distribution?year=${year}`, async () => {
    await delay();
    return staticDurationDistributionByYear[year] ?? staticDurationDistributionByYear[2025];
  });
}

export async function getRiskTrends(rangeDays = 90, year = 2024): Promise<RiskTrendPoint[]> {
  return getJson<RiskTrendPoint[]>(`/api/risk-trends?rangeDays=${rangeDays}&year=${year}`, async () => {
    await delay();
    return staticRiskTrendsByYear[year] ?? riskTrends.slice(rangeDays <= 45 ? -6 : 0);
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
    return staticStores.length > 0 ? staticStores : stores;
  });
}

export async function getProducts(): Promise<Product[]> {
  return getJson<Product[]>("/api/products", async () => {
    await delay();
    return staticProducts.length > 0 ? staticProducts : products;
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
    return { ...staticPredictionMatrix2025, storeCount: storeLimit };
  });
}

export async function getResults2025(storeLimit = 10): Promise<Results2025Summary> {
  return getJson<Results2025Summary>(`/api/results-2025?storeLimit=${storeLimit}`, async () => {
    await delay();
    return { ...staticResults2025, matrix: { ...staticResults2025.matrix, storeCount: storeLimit } };
  });
}

export async function getThresholdTuning2025(storeLimit = 10, falseAlertCost = 25, recallTarget = 0.85): Promise<ThresholdTuningSummary> {
  return getJson<ThresholdTuningSummary>(`/api/threshold-tuning-2025?storeLimit=${storeLimit}&falseAlertCost=${falseAlertCost}&recallTarget=${recallTarget}`, async () => {
    await delay();
    return { ...staticThresholdTuning2025, storeCount: storeLimit, falseAlertCost, recallTarget };
  });
}

export async function getStorePredictions(storeLimit = 10, productsPerStore = 80, startDate = "2025-01-01", endDate = "2025-01-07"): Promise<StorePredictionGroup[]> {
  return getJson<StorePredictionGroup[]>(`/api/store-predictions?storeLimit=${storeLimit}&productsPerStore=${productsPerStore}&startDate=${startDate}&endDate=${endDate}`, async () => {
    await delay();
    if (staticStorePredictions.length > 0) {
      return staticStorePredictions.slice(0, storeLimit).map((store) => ({
        ...store,
        products: store.products.slice(0, productsPerStore).map((product, index) => simulateStaticInventory(product, startDate, index)),
      }));
    }
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
    const staticProduct = staticStorePredictions
      .find((store) => store.id === storeId)
      ?.products.find((product) => product.sku === sku);
    if (staticProduct) {
      return {
        storeId,
        sku,
        probability: staticProduct.timeSeriesAdjustedProbability,
        probability3d: staticProduct.probability3d,
        probability14d: staticProduct.probability14d,
        alertThreshold: staticProduct.alertThreshold,
        riskLevel: staticProduct.riskLevel,
        daysOfSupply: staticProduct.daysOfSupply,
        unitsOnHand: staticProduct.quantityAvailable,
        avgDailyDemand7d: staticProduct.sellingRate,
        recentReplenishmentQty: staticProduct.recentReplenishmentQty,
        daysSinceLastReplenishment: staticProduct.daysSinceLastReplenishment,
        avgSupplierLeadTime: staticProduct.avgSupplierLeadTime,
        alertReason: staticProduct.revenueLossReason,
        estimatedLostSales: Math.max(500, staticProduct.forecast7dDemand * 38),
        recommendedAction: staticProduct.recommendedAction,
        drivers: [
          { name: "Days of supply", impact: Math.min(0.96, 1 - Math.min(staticProduct.daysOfSupply, 20) / 24), direction: "increases" },
          { name: "Recent sales demand", impact: Math.min(0.92, staticProduct.sellingRate / 30), direction: "increases" },
          { name: "Supplier lead time", impact: Math.min(0.86, (staticProduct.avgSupplierLeadTime ?? 0) / 12), direction: "increases" },
          { name: "Backroom inventory", impact: Math.min(0.7, staticProduct.backroomQuantity / 200), direction: "reduces" },
        ],
      };
    }
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
