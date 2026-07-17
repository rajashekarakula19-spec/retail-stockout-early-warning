import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, PackageCheck, RefreshCw, Search, Sparkles, Store } from "lucide-react";
import { getBestDemoWeek, getStorePredictions } from "../lib/api/stockout-api";
import type { RiskLevel, StorePredictionGroup, StorePredictionProduct } from "../lib/api/types";
import { RiskBadge } from "../components/risk/RiskBadge";
import { Button } from "../components/ui/Button";
import { percent } from "../lib/utils";

const riskBarColor: Record<RiskLevel, string> = {
  critical: "bg-red-600",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-emerald-500",
};

const defaultPredictionStartDate = "2025-12-01";

function addDaysIso(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function probabilityCell(product: StorePredictionProduct) {
  return (
    <div className="min-w-[150px]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-black text-foreground">{percent(product.timeSeriesAdjustedProbability ?? product.stockoutProbability)}</span>
        <RiskBadge level={product.riskLevel} />
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className={`h-2 rounded-full ${riskBarColor[product.riskLevel]}`} style={{ width: `${Math.round((product.timeSeriesAdjustedProbability ?? product.stockoutProbability) * 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        XGB {percent(product.stockoutProbability)} · threshold {percent(product.alertThreshold ?? 0.5)}
      </p>
      <p className="text-xs text-muted-foreground">
        {product.thresholdReason ?? "standard calibrated threshold"}
      </p>
    </div>
  );
}

export function PredictionsPage() {
  const [stores, setStores] = useState<StorePredictionGroup[]>([]);
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [predictionStartDate, setPredictionStartDate] = useState(defaultPredictionStartDate);
  const [bestWeekSummary, setBestWeekSummary] = useState<string>("Best demo week: Dec 1-7, 2025");
  const [storeSearch, setStoreSearch] = useState("");
  const predictionEndDate = addDaysIso(predictionStartDate, 6);
  const outcomeWindow = `${predictionStartDate} to ${predictionEndDate}`;
  const filteredStores = useMemo(() => {
    const query = storeSearch.trim().toLowerCase();
    if (!query) return stores;
    return stores
      .map((store) => {
        const storeMatches = [store.id, store.name, store.city, store.region].some((value) => value.toLowerCase().includes(query));
        const products = store.products.filter((product) =>
          [product.sku, product.productName, product.category, product.predictionOutcome, product.originalStockoutRootCause ?? ""].some((value) =>
            value.toLowerCase().includes(query),
          ),
        );
        return storeMatches ? store : { ...store, products };
      })
      .filter((store) => store.products.length > 0 || [store.id, store.name, store.city, store.region].some((value) => value.toLowerCase().includes(query)));
  }, [storeSearch, stores]);
  const predictionMatrix = useMemo(() => {
    const products = stores.flatMap((store) => store.products);
    const successful = products.filter((product) => product.predictedStockout && product.actualStockout).length;
    const falseAlerts = products.filter((product) => product.predictedStockout && !product.actualStockout).length;
    const missed = products.filter((product) => !product.predictedStockout && product.actualStockout).length;
    const correctNoAlert = products.filter((product) => !product.predictedStockout && !product.actualStockout).length;
    const total = products.length;
    const precision = successful + falseAlerts > 0 ? successful / (successful + falseAlerts) : 0;
    const recall = successful + missed > 0 ? successful / (successful + missed) : 0;
    const accuracy = total > 0 ? (successful + correctNoAlert) / total : 0;
    const leadTimes = products
      .filter((product) => product.predictedStockout && product.actualStockout)
      .map((product) => daysBetween(product.predictionDate, product.actualStockoutDate))
      .filter((days): days is number => typeof days === "number" && days >= 0);
    const avgLeadDays = leadTimes.length > 0 ? leadTimes.reduce((sum, days) => sum + days, 0) / leadTimes.length : 0;
    const maxLeadDays = leadTimes.length > 0 ? Math.max(...leadTimes) : 0;
    const minLeadDays = leadTimes.length > 0 ? Math.min(...leadTimes) : 0;

    return { successful, falseAlerts, missed, correctNoAlert, total, precision, recall, accuracy, avgLeadDays, maxLeadDays, minLeadDays };
  }, [stores]);
  const dailySummary = useMemo(() => {
    const byDate = new Map<string, { date: string; predicted: number; actual: number; successful: number; falseAlerts: number; missed: number }>();
    const ensure = (date: string) => {
      const current = byDate.get(date);
      if (current) return current;
      const next = { date, predicted: 0, actual: 0, successful: 0, falseAlerts: 0, missed: 0 };
      byDate.set(date, next);
      return next;
    };

    stores.flatMap((store) => store.products).forEach((product) => {
      const date = product.predictionDate ?? predictionStartDate;
      const row = ensure(date);
      if (product.predictedStockout) row.predicted += 1;
      if (product.actualStockout) row.actual += 1;
      if (product.predictedStockout && product.actualStockout) row.successful += 1;
      if (product.predictedStockout && !product.actualStockout) row.falseAlerts += 1;
      if (!product.predictedStockout && product.actualStockout) row.missed += 1;
    });

    return Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
  }, [predictionStartDate, stores]);

  const loadStores = async () => {
    setLoading(true);
    const data = await getStorePredictions(10, 80, predictionStartDate, predictionEndDate);
    setStores(data);
    setExpandedStoreId((current) => current ?? data[0]?.id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void loadStores();
  }, [predictionStartDate]);

  const useBestDemoWeek = async () => {
    const week = await getBestDemoWeek(10);
    setBestWeekSummary(`Best demo week: ${week.weekStart} to ${week.weekEnd} · ${week.stockoutEvents} actual stockout products`);
    setPredictionStartDate(week.weekStart);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">10-store time-travel prediction demo</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground">Store Stockout Predictions</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Using scored rows from {predictionStartDate} to {predictionEndDate} to predict whether each store-SKU stocks out in its next 7 days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">
            <CalendarDays className="h-4 w-4 text-brand" />
            <input
              className="bg-transparent outline-none"
              type="date"
              min="2025-01-01"
              max="2025-12-25"
              value={predictionStartDate}
              onChange={(event) => setPredictionStartDate(event.target.value)}
            />
          </label>
          <Button variant="secondary" onClick={() => void useBestDemoWeek()} disabled={loading}>
            <Sparkles className="h-4 w-4" />
            Best demo week
          </Button>
          <Button variant="ghost" onClick={() => void loadStores()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-elegant">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">Prediction result matrix</p>
            <h2 className="mt-1 text-2xl font-black text-foreground">Correctly identified stockouts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Based on {predictionMatrix.total} scored store-SKUs available during {outcomeWindow}; predicted stockout vs actual stockout.
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{bestWeekSummary}</p>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Precision</p>
              <p className="font-black text-foreground">{percent(predictionMatrix.precision)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Recall</p>
              <p className="font-black text-foreground">{percent(predictionMatrix.recall)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Accuracy</p>
              <p className="font-black text-foreground">{percent(predictionMatrix.accuracy)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Avg warning</p>
              <p className="font-black text-foreground">{predictionMatrix.avgLeadDays.toFixed(1)}d</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Successful prediction</p>
            <p className="mt-2 text-3xl font-black text-emerald-900">{predictionMatrix.successful}</p>
            <p className="mt-1 text-xs text-emerald-700">
              Predicted yes · Actual yes · {predictionMatrix.minLeadDays}-{predictionMatrix.maxLeadDays}d early
            </p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-rose-700">False alert</p>
            <p className="mt-2 text-3xl font-black text-rose-900">{predictionMatrix.falseAlerts}</p>
            <p className="mt-1 text-xs text-rose-700">Predicted yes · Actual no</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Missed stockout</p>
            <p className="mt-2 text-3xl font-black text-amber-900">{predictionMatrix.missed}</p>
            <p className="mt-1 text-xs text-amber-700">Predicted no · Actual yes</p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Correct no alert</p>
            <p className="mt-2 text-3xl font-black text-sky-900">{predictionMatrix.correctNoAlert}</p>
            <p className="mt-1 text-xs text-sky-700">Predicted no · Actual no</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-elegant">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">Day-wise prediction view</p>
            <h2 className="mt-1 text-2xl font-black text-foreground">Stockout signals by prediction date</h2>
            <p className="mt-1 text-sm text-muted-foreground">Shows how many alerts and actual stockouts appear on each scored date in the selected 7-day window.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Prediction date</th>
                <th className="px-3 py-3">Predicted alerts</th>
                <th className="px-3 py-3">Actual stockouts</th>
                <th className="px-3 py-3">Successful</th>
                <th className="px-3 py-3">False alerts</th>
                <th className="px-3 py-3">Missed</th>
              </tr>
            </thead>
            <tbody>
              {dailySummary.map((row) => (
                <tr key={row.date} className="border-t border-border">
                  <td className="px-3 py-3 font-black text-foreground">{row.date}</td>
                  <td className="px-3 py-3 text-foreground">{row.predicted}</td>
                  <td className="px-3 py-3 text-foreground">{row.actual}</td>
                  <td className="px-3 py-3 font-black text-emerald-700">{row.successful}</td>
                  <td className="px-3 py-3 font-semibold text-rose-700">{row.falseAlerts}</td>
                  <td className="px-3 py-3 font-semibold text-amber-700">{row.missed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elegant">
        <div className="grid gap-3 border-b border-border bg-muted/70 px-4 py-3 text-sm font-bold text-muted-foreground lg:grid-cols-[1fr_auto] lg:items-center">
          <span>
            Showing {filteredStores.length || 0} of {stores.length || 10} demo stores from PostgreSQL · prediction window {predictionStartDate} to {predictionEndDate}
          </span>
          <label className="flex min-w-[280px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">
            <Search className="h-4 w-4 text-brand" />
            <input
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
              type="search"
              placeholder="Search store, SKU, product, cause"
              value={storeSearch}
              onChange={(event) => setStoreSearch(event.target.value)}
            />
          </label>
        </div>
        {loading ? (
          <div className="p-8 text-sm font-semibold text-muted-foreground">Loading store predictions...</div>
        ) : (
          <div className="divide-y divide-border">
            {filteredStores.map((store) => {
              const expanded = expandedStoreId === store.id;
              const actualStockouts = store.products.filter((product) => product.actualStockout).length;
              const successfulPredictions = store.products.filter((product) => product.predictedStockout && product.actualStockout).length;
              return (
                <div key={store.id}>
                  <button
                    type="button"
                    className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-muted/60 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_auto] md:items-center"
                    onClick={() => setExpandedStoreId(expanded ? null : store.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? <ChevronDown className="h-5 w-5 text-brand" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <Store className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-foreground">{store.name}</span>
                          {actualStockouts > 0 && (
                            <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-emerald-800">
                              {successfulPredictions}/{actualStockouts} stockout predicted
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{store.id} · {store.city || "City"} · {store.region}</div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Products shown</p>
                      <p className="font-black text-foreground">{store.products.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg probability</p>
                      <p className="font-black text-brand">{percent(store.avgProbability)}</p>
                    </div>
                    <RiskBadge level={store.highestRisk} />
                    <PackageCheck className="hidden h-5 w-5 text-muted-foreground md:block" />
                  </button>

                  {expanded && (
                    <div className="border-t border-border bg-background px-4 pb-5">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
                          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-3">Product</th>
                              <th className="px-3 py-3">Available Qty</th>
                              <th className="px-3 py-3">Shelf Qty</th>
                              <th className="px-3 py-3">Backroom</th>
                              <th className="px-3 py-3">Selling Rate</th>
                              <th className="px-3 py-3">Forecast</th>
                              <th className="px-3 py-3">Possible Stockout</th>
                              <th className="px-3 py-3">Probability</th>
                              <th className="px-3 py-3">Prediction result</th>
                              <th className="px-3 py-3">Replenishment</th>
                              <th className="px-3 py-3">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {store.products.map((product) => {
                              const isSuccessfulPrediction = product.predictedStockout && product.actualStockout;
                              const warningDays = daysBetween(product.predictionDate, product.actualStockoutDate);
                              return (
                              <tr
                                key={`${store.id}-${product.sku}`}
                                className={`border-t border-border ${isSuccessfulPrediction ? "bg-emerald-50 ring-2 ring-inset ring-emerald-300" : ""}`}
                              >
                                <td className="px-3 py-4">
                                  {isSuccessfulPrediction && (
                                    <div className="mb-2 inline-flex rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-white">
                                      Successful prediction
                                    </div>
                                  )}
                                  <div className="font-bold text-foreground">{product.productName}</div>
                                  <div className="text-xs text-muted-foreground">{product.sku} · {product.category}</div>
                                </td>
                                <td className="px-3 py-4 font-black text-foreground">{Math.round(product.quantityAvailable).toLocaleString()}</td>
                                <td className="px-3 py-4 font-semibold text-foreground">{Math.round(product.shelfQuantity).toLocaleString()}</td>
                                <td className="px-3 py-4 text-muted-foreground">{Math.round(product.backroomQuantity).toLocaleString()}</td>
                                <td className="px-3 py-4">
                                  <span className="font-black text-foreground">{product.sellingRate.toFixed(1)}</span>
                                  <span className="text-xs text-muted-foreground"> units/day</span>
                                </td>
                                <td className="px-3 py-4">
                                  <div className="font-black text-foreground">{Math.round(product.forecast7dDemand).toLocaleString()} units</div>
                                  <div className="text-xs text-muted-foreground">
                                    7d demand · gap {Math.round(product.forecastInventoryGap).toLocaleString()}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {product.forecastDaysOfSupply.toFixed(1)} forecast days {product.demandSpike ? "· spike" : ""}
                                  </div>
                                </td>
                                <td className="px-3 py-4">
                                  <div className="font-black text-foreground">{product.possibleStockoutTime}</div>
                                  <div className="text-xs text-muted-foreground">{product.daysOfSupply.toFixed(1)} days supply</div>
                                </td>
                                <td className="px-3 py-4">{probabilityCell(product)}</td>
                                <td className="px-3 py-4">
                                  <div className="font-bold text-foreground">{product.predictionOutcome}</div>
                                  <div className="text-xs font-semibold text-brand">Alert date: {product.predictionDate ?? "Not available"}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Predicted {product.predictedStockout ? "yes" : "no"} · Actual {product.actualStockout ? "yes" : "no"}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">{product.revenueLossReason}</div>
                                  {typeof product.falseAlertRate === "number" && (
                                    <div className="text-xs text-muted-foreground">False-alert history {percent(product.falseAlertRate)}</div>
                                  )}
                                </td>
                                <td className="px-3 py-4">
                                  <div className="font-semibold text-foreground">{Math.round(product.recentReplenishmentQty ?? 0).toLocaleString()} received</div>
                                  <div className="text-xs text-muted-foreground">
                                    {Math.round(product.daysSinceLastReplenishment ?? 0)} days ago · lead {product.avgSupplierLeadTime?.toFixed(1) ?? "0.0"}d
                                  </div>
                                  <div className={`mt-1 text-xs font-semibold ${product.actualStockout ? "text-emerald-800" : "text-muted-foreground"}`}>
                                    Root cause: {product.originalStockoutRootCause ?? "No stockout recorded"}
                                    {(product.actualStockoutEvents ?? 0) > 1 ? ` · ${product.actualStockoutEvents} events` : ""}
                                  </div>
                                  {product.actualStockoutDate && (
                                    <div className="text-xs font-semibold text-emerald-800">
                                      Stockout: {product.actualStockoutDate}
                                      {product.actualRestockDate ? ` · Restock: ${product.actualRestockDate}` : ""}
                                    </div>
                                  )}
                                  {isSuccessfulPrediction && typeof warningDays === "number" && (
                                    <div className="text-xs font-black text-emerald-800">
                                      Warned {warningDays} day{warningDays === 1 ? "" : "s"} before stockout
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-4 text-muted-foreground">{product.recommendedAction}</td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
