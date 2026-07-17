export type RiskLevel = "critical" | "high" | "medium" | "low";

export interface Store {
  id: string;
  name: string;
  region: string;
  city: string;
  format: string;
}

export interface Product {
  sku: string;
  name: string;
  category: string;
  brand: string;
}

export interface KpiSummary {
  storesAtRisk: number;
  skusAtRisk: number;
  projectedLostSales: number;
  forecastAccuracy: number;
  alertsToday: number;
}

export interface YearlyStockoutSummary {
  year: number;
  storeCount: number;
  stockoutEvents: number;
  storesWithStockouts: number;
  skusWithStockouts: number;
  lostRevenue: number;
  lostUnits: number;
  avgDurationDays: number;
  salesRevenue: number;
  unitsSold: number;
  transactions: number;
  topCause: string;
  topCauseEvents: number;
  topCauseLostRevenue: number;
}

export interface RiskTrendPoint {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface HighRiskItem {
  id: string;
  storeId: string;
  storeName: string;
  region: string;
  sku: string;
  productName: string;
  category: string;
  probability: number;
  probability3d?: number;
  probability14d?: number;
  alertThreshold?: number;
  riskLevel: RiskLevel;
  daysOfSupply: number;
  unitsOnHand?: number;
  avgDailyDemand7d?: number;
  recentReplenishmentQty?: number;
  daysSinceLastReplenishment?: number;
  avgSupplierLeadTime?: number;
  historicalStockoutFrequency?: number;
  alertReason?: string;
  predictedStockout?: boolean;
  actualStockout?: boolean;
  predictionOutcome?: string;
  estimatedLostSales: number;
  recommendedAction: string;
  trend: RiskTrendPoint[];
}

export interface RiskDriver {
  name: string;
  impact: number;
  direction: "increases" | "reduces";
}

export interface PredictionResult {
  storeId: string;
  sku: string;
  probability: number;
  probability3d?: number;
  probability14d?: number;
  alertThreshold?: number;
  riskLevel: RiskLevel;
  daysOfSupply: number;
  unitsOnHand?: number;
  avgDailyDemand7d?: number;
  recentReplenishmentQty?: number;
  daysSinceLastReplenishment?: number;
  avgSupplierLeadTime?: number;
  historicalStockoutFrequency?: number;
  alertReason?: string;
  estimatedLostSales: number;
  recommendedAction: string;
  drivers: RiskDriver[];
}

export interface StorePredictionProduct {
  sku: string;
  predictionDate?: string;
  productName: string;
  category: string;
  quantityAvailable: number;
  shelfQuantity: number;
  backroomQuantity: number;
  sellingRate: number;
  forecast7dDemand: number;
  forecast14dDemand: number;
  forecastInventoryGap: number;
  forecastDaysOfSupply: number;
  demandSpike: boolean;
  possibleStockoutTime: string;
  daysOfSupply: number;
  stockoutProbability: number;
  timeSeriesAdjustedProbability: number;
  probability3d?: number;
  probability14d?: number;
  riskLevel: RiskLevel;
  alertThreshold?: number;
  thresholdReason?: string;
  falseAlertRate?: number;
  recentReplenishmentQty?: number;
  daysSinceLastReplenishment?: number;
  avgSupplierLeadTime?: number;
  recommendedAction: string;
  predictedStockout: boolean;
  actualStockout: boolean;
  predictionOutcome: string;
  revenueLossReason: string;
  originalStockoutRootCause?: string;
  actualStockoutDate?: string | null;
  actualRestockDate?: string | null;
  actualStockoutEvents?: number;
}

export interface BestDemoWeek {
  weekStart: string;
  weekEnd: string;
  stockoutEvents: number;
  storesAffected: number;
  productsAffected: number;
}

export interface PredictionMatrixSummary {
  year: number;
  storeCount: number;
  rowsChecked: number;
  predictedStockouts: number;
  actualStockouts: number;
  successfulPredictions: number;
  falseAlerts: number;
  missedStockouts: number;
  correctNoAlerts: number;
  precision: number;
  recall: number;
  accuracy: number;
}

export interface ResultBreakdownItem {
  cause?: string;
  bucket?: string;
  events: number;
  lostRevenue: number;
  lostUnits: number;
}

export interface MissedStockoutDetail {
  storeId: string;
  storeName: string;
  city: string;
  region: string;
  sku: string;
  productName: string;
  category: string;
  predictionDate?: string | null;
  quantityAvailable: number;
  shelfQuantity: number;
  backroomQuantity: number;
  sellingRate: number;
  forecast7dDemand: number;
  forecastInventoryGap: number;
  forecastDaysOfSupply: number;
  possibleStockoutTime: string;
  daysOfSupply: number;
  stockoutProbability: number;
  timeSeriesAdjustedProbability: number;
  alertThreshold: number;
  riskLevel: RiskLevel;
  predictionOutcome: string;
  warningDays?: number | null;
  recentReplenishmentQty: number;
  daysSinceLastReplenishment: number;
  avgSupplierLeadTime: number;
  recommendedAction: string;
  actualStockoutDate?: string | null;
  root_cause: string;
  duration_days: number;
  estimated_lost_revenue: number;
  estimated_lost_units: number;
}

export interface ThresholdTuningMetrics {
  threshold: number;
  successfulPredictions: number;
  falseAlerts: number;
  missedStockouts: number;
  correctNoAlerts: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  revenueSaved: number;
  revenueMissed: number;
  falseAlertCost: number;
  netRevenueValue: number;
}

export interface ThresholdTuningTechnique {
  technique: string;
  threshold: number | null;
  description: string;
  prAuc: number;
  metrics: ThresholdTuningMetrics;
}

export interface ThresholdTuningSummary {
  year: number;
  storeCount: number;
  rowsChecked: number;
  actualStockouts: number;
  totalRevenueAtRisk: number;
  falseAlertCost: number;
  recallTarget: number;
  prAuc: number;
  recommendedTechnique: string;
  recommendedThreshold: number;
  techniques: ThresholdTuningTechnique[];
  curve: ThresholdTuningMetrics[];
}

export interface Results2025Summary {
  matrix: PredictionMatrixSummary;
  stockoutEvents: number;
  coveredEvents: number;
  missedEvents: number;
  noPriorScoredEvents: number;
  averageWarningDays: number;
  estimatedRevenueAtRisk: number;
  estimatedRevenueProtected: number;
  estimatedRevenueMissed: number;
  coverageRate: number;
  revenueCoverageRate: number;
  coveredCauses: ResultBreakdownItem[];
  missedCauses: ResultBreakdownItem[];
  coveredDurations: ResultBreakdownItem[];
  missedDurations: ResultBreakdownItem[];
  missedStockouts: MissedStockoutDetail[];
}

export interface StorePredictionGroup {
  id: string;
  name: string;
  region: string;
  city: string;
  highestRisk: RiskLevel;
  avgProbability: number;
  products: StorePredictionProduct[];
}

export interface ScenarioInput {
  leadTimeDays: number;
  promoUpliftPct: number;
  safetyStockUnits: number;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface WeeklyUploadResult {
  dataType: string;
  rowsReceived: number;
  rowsAccepted: number;
  pairsRescored: number;
  message: string;
}

export interface FetchNextWeekStatus {
  nextWeekStart: string | null;
  nextWeekEnd: string | null;
  lastFetchedEndDate: string | null;
  complete: boolean;
}

export interface FetchNextWeekResult {
  weekStart: string | null;
  weekEnd: string | null;
  pairsFound: number;
  pairsScored: number;
  difference?: WeeklyFetchDifference;
  complete: boolean;
  message: string;
}

export interface WeeklyFetchDifference {
  avgProbabilityBefore: number;
  avgProbabilityAfter: number;
  avgAvailableBefore: number;
  avgAvailableAfter: number;
  actualStockouts: number;
  topChanges: WeeklyFetchChange[];
}

export interface WeeklyFetchChange {
  storeName: string;
  sku: string;
  productName: string;
  category: string;
  beforeProbability: number;
  afterProbability: number;
  beforeAvailable: number;
  afterAvailable: number;
  daysOfSupply: number;
  sellingRate: number;
  recentReplenishmentQty: number;
  reason: string;
}

export interface RevenueLossCause {
  cause: string;
  stockoutEvents: number;
  lostRevenue: number;
  lostUnits: number;
}

export interface RevenueLossProduct {
  storeId: string;
  storeName: string;
  sku: string;
  productName: string;
  category: string;
  rootCause: string;
  stockoutEvents: number;
  lostRevenue: number;
  lostUnits: number;
}

export interface RevenueLossSummary {
  causes: RevenueLossCause[];
  products: RevenueLossProduct[];
}

export interface CategoryRevenue {
  category: string;
  revenue: number;
  unitsSold: number;
  transactions: number;
}

export interface StockoutDurationBucket {
  bucket: string;
  stockoutEvents: number;
  avgDurationDays: number;
  lostRevenue: number;
  lostUnits: number;
  causes: Record<string, number>;
}
