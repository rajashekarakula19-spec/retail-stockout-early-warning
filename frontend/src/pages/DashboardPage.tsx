import { useEffect, useState } from "react";
import { AlertTriangle, Database, DollarSign, LineChart, Store } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchNextWeekFromDb, getExecutiveSummary, getFetchNextWeekStatus, getHighRiskItems, getKpis, getRevenueLossCauses, getRiskTrends, getStockoutDurationDistribution, getTopCategoriesByRevenue } from "../lib/api/stockout-api";
import type { CategoryRevenue, FetchNextWeekResult, FetchNextWeekStatus, HighRiskItem, KpiSummary, RevenueLossSummary, RiskTrendPoint, StockoutDurationBucket } from "../lib/api/types";
import { FiltersBar, type RiskFilters } from "../components/risk/FiltersBar";
import { HighRiskTable } from "../components/risk/HighRiskTable";
import { KpiCard } from "../components/risk/KpiCard";
import { ProductDetailDrawer } from "../components/risk/ProductDetailDrawer";
import { RiskTrendChart } from "../components/risk/RiskTrendChart";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { currency } from "../lib/utils";

const defaultFilters: RiskFilters = { region: "all", category: "all", riskLevel: "all", search: "" };
const lossColors = ["#2563eb", "#f97316", "#dc2626", "#16a34a", "#9333ea", "#0891b2"];

export function DashboardPage() {
  const [summary, setSummary] = useState("");
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [trends, setTrends] = useState<RiskTrendPoint[]>([]);
  const [items, setItems] = useState<HighRiskItem[]>([]);
  const [filters, setFilters] = useState<RiskFilters>(defaultFilters);
  const [selected, setSelected] = useState<HighRiskItem | null>(null);
  const [fetchingWeek, setFetchingWeek] = useState(false);
  const [weekStatus, setWeekStatus] = useState<FetchNextWeekStatus | null>(null);
  const [lastFetchedWeek, setLastFetchedWeek] = useState("");
  const [fetchResult, setFetchResult] = useState<FetchNextWeekResult | null>(null);
  const [revenueLoss, setRevenueLoss] = useState<RevenueLossSummary | null>(null);
  const [topCategories, setTopCategories] = useState<CategoryRevenue[]>([]);
  const [durationDistribution, setDurationDistribution] = useState<StockoutDurationBucket[]>([]);
  const revenueCauseOrder = revenueLoss?.causes.map((cause) => cause.cause) ?? [];
  const rootCauses = Array.from(new Set([...revenueCauseOrder, ...durationDistribution.flatMap((bucket) => Object.keys(bucket.causes ?? {}))]));
  const causeColor = (cause: string) => {
    const index = rootCauses.indexOf(cause);
    return lossColors[(index >= 0 ? index : 0) % lossColors.length];
  };
  const durationChartData = durationDistribution.map((bucket) => ({
    ...bucket,
    ...bucket.causes,
  }));

  const refreshDashboard = () => {
    void getExecutiveSummary().then(setSummary);
    void getKpis().then(setKpis);
    void getRiskTrends(90).then(setTrends);
    void getHighRiskItems(filters).then(setItems);
    void getFetchNextWeekStatus().then(setWeekStatus);
    void getRevenueLossCauses().then(setRevenueLoss);
    void getTopCategoriesByRevenue().then(setTopCategories);
    void getStockoutDurationDistribution().then(setDurationDistribution);
  };

  useEffect(() => {
    refreshDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void getHighRiskItems(filters).then(setItems);
  }, [filters]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-elegant">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">Executive summary</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Risk Dashboard</h1>
        <p className="mt-3 max-w-4xl text-muted-foreground">{summary}</p>
      </section>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-elegant lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-black text-foreground">Fetch next week from DB</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Pull the next unseen 2025 week from PostgreSQL, score affected store-SKUs, and refresh the stockout alerts.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {weekStatus?.lastFetchedEndDate && (
              <span className="rounded-lg bg-muted px-3 py-1 font-semibold text-muted-foreground">Last fetched through {weekStatus.lastFetchedEndDate}</span>
            )}
            {weekStatus?.nextWeekStart && weekStatus?.nextWeekEnd && (
              <span className="rounded-lg bg-brand/10 px-3 py-1 font-bold text-brand">Next: {weekStatus.nextWeekStart} to {weekStatus.nextWeekEnd}</span>
            )}
            {lastFetchedWeek && <span className="rounded-lg bg-accent-warm/15 px-3 py-1 font-bold text-accent-warm">{lastFetchedWeek}</span>}
          </div>
        </div>
        <Button
          disabled={fetchingWeek || weekStatus?.complete}
          onClick={async () => {
            setFetchingWeek(true);
            setLastFetchedWeek("Fetching next DB week...");
            const result = await fetchNextWeekFromDb();
            setFetchResult(result);
            setLastFetchedWeek(
              result.weekStart && result.weekEnd
                ? `Fetched ${result.weekStart} to ${result.weekEnd}. Scored ${result.pairsScored} of ${result.pairsFound} store-SKUs.`
                : result.message,
            );
            setFetchingWeek(false);
            refreshDashboard();
          }}
        >
          <Database className="h-4 w-4" />
          {fetchingWeek ? "Fetching..." : weekStatus?.complete ? "All weeks fetched" : "Fetch Next Week"}
        </Button>
      </section>

      {fetchResult?.difference && (
        <section className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-elegant lg:grid-cols-4">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Probability change</p>
            <p className="mt-1 text-2xl font-black text-brand">
              {(fetchResult.difference.avgProbabilityBefore * 100).toFixed(1)}% → {(fetchResult.difference.avgProbabilityAfter * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Available qty change</p>
            <p className="mt-1 text-2xl font-black text-brand">
              {fetchResult.difference.avgAvailableBefore.toFixed(0)} → {fetchResult.difference.avgAvailableAfter.toFixed(0)}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Actual stockouts</p>
            <p className="mt-1 text-2xl font-black text-brand">{fetchResult.difference.actualStockouts}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Fetched products</p>
            <p className="mt-1 text-2xl font-black text-brand">{fetchResult.pairsScored}</p>
          </div>
        </section>
      )}

      {fetchResult?.difference?.topChanges.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Difference after DB fetch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Probability</th>
                    <th className="px-3 py-2">Available qty</th>
                    <th className="px-3 py-2">Demand</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {fetchResult.difference.topChanges.map((change) => (
                    <tr key={`${change.storeName}-${change.sku}`} className="border-t border-border">
                      <td className="px-3 py-3">
                        <div className="font-bold text-foreground">{change.productName}</div>
                        <div className="text-xs text-muted-foreground">{change.sku} · {change.category}</div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{change.storeName}</td>
                      <td className="px-3 py-3 font-black text-brand">
                        {(change.beforeProbability * 100).toFixed(1)}% → {(change.afterProbability * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-3">{change.beforeAvailable.toFixed(0)} → {change.afterAvailable.toFixed(0)}</td>
                      <td className="px-3 py-3">{change.sellingRate.toFixed(1)} units/day</td>
                      <td className="px-3 py-3 text-muted-foreground">{change.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {kpis && (
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard label="Stores with high-risk alerts" value={kpis.storesAtRisk.toLocaleString()} delta="10-store demo scope" icon={Store} />
          <KpiCard label="SKUs with high-risk alerts" value={kpis.skusAtRisk.toLocaleString()} delta="10-store demo scope" icon={AlertTriangle} />
          <KpiCard label="2024 stockout revenue loss" value={currency(kpis.projectedLostSales)} delta="historical loss for same 10 stores" icon={DollarSign} />
          <KpiCard label="PR-AUC" value={kpis.forecastAccuracy.toFixed(3)} delta="XGBoost model" icon={LineChart} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>2024 monthly risk trend by alert level</CardTitle>
        </CardHeader>
        <CardContent>
          <RiskTrendChart data={trends} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2024 Top 10 Categories by Sales Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[420px]">
            <ResponsiveContainer>
              <BarChart data={topCategories} layout="vertical" margin={{ left: 24, right: 32, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => currency(Number(value)).replace(".00", "")}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={150}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value, name, item) => {
                    const payload = item.payload as CategoryRevenue;
                    if (name === "revenue") return [currency(Number(value ?? 0)), `${payload.unitsSold.toLocaleString()} units sold`];
                    return [String(value), name];
                  }}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                  }}
                />
                <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
                  {topCategories.map((item, index) => (
                    <Cell key={item.category} fill={lossColors[index % lossColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {topCategories.slice(0, 10).map((category, index) => (
              <div key={category.category} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: lossColors[index % lossColors.length] }} />
                  <p className="truncate text-xs font-bold text-muted-foreground">{category.category}</p>
                </div>
                <p className="mt-1 font-black text-foreground">{currency(category.revenue)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2024 Stockout Duration Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[340px]">
            <ResponsiveContainer>
              <BarChart data={durationChartData} margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(value, name, item) => {
                    const payload = item.payload as StockoutDurationBucket;
                    return [Number(value).toLocaleString(), `${String(name)} · ${payload.avgDurationDays.toFixed(1)} avg days`];
                  }}
                  labelFormatter={(label) => `Duration: ${label}`}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                  }}
                />
                {rootCauses.map((cause, index) => (
                  <Bar key={cause} dataKey={cause} stackId="duration" fill={causeColor(cause)} radius={index === rootCauses.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {rootCauses.map((cause, index) => (
              <span key={cause} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1 text-xs font-bold text-muted-foreground">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: causeColor(cause) }} />
                {cause}
              </span>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {durationDistribution.map((bucket, index) => (
              <div key={bucket.bucket} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: lossColors[index % lossColors.length] }} />
                  <p className="text-xs font-bold text-muted-foreground">{bucket.bucket}</p>
                </div>
                <p className="mt-1 font-black text-foreground">{bucket.stockoutEvents.toLocaleString()} events</p>
                <p className="text-xs text-muted-foreground">{currency(bucket.lostRevenue)} lost</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {revenueLoss && (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>2024 stockout revenue loss causes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="h-72">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={revenueLoss.causes}
                        dataKey="lostRevenue"
                        nameKey="cause"
                        innerRadius={58}
                        outerRadius={104}
                        paddingAngle={2}
                      >
                        {revenueLoss.causes.map((cause) => (
                          <Cell key={cause.cause} fill={causeColor(cause.cause)} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, item) => {
                          const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                          const payload = item.payload as { cause?: string; stockoutEvents?: number };
                          return [currency(numericValue), `${payload.cause ?? "Cause"} · ${payload.stockoutEvents ?? 0} events`];
                        }}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 pr-1">
                  {revenueLoss.causes.map((cause) => (
                    <div key={cause.cause} className="rounded-lg border border-border bg-background p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: causeColor(cause.cause) }} />
                          <p className="font-bold text-foreground">{cause.cause}</p>
                        </div>
                        <p className="font-black text-brand">{currency(cause.lostRevenue)}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{cause.stockoutEvents} events · {cause.lostUnits.toLocaleString()} lost units</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>2024 products involved in revenue loss</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Store</th>
                      <th className="px-3 py-2">Cause</th>
                      <th className="px-3 py-2">Lost sales</th>
                      <th className="px-3 py-2">Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueLoss.products.map((product) => (
                      <tr key={`${product.storeId}-${product.sku}-${product.rootCause}`} className="border-t border-border">
                        <td className="px-3 py-3">
                          <div className="font-bold text-foreground">{product.productName}</div>
                          <div className="text-xs text-muted-foreground">{product.sku} · {product.category}</div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{product.storeName}</td>
                        <td className="px-3 py-3">{product.rootCause}</td>
                        <td className="px-3 py-3 font-black text-brand">{currency(product.lostRevenue)}</td>
                        <td className="px-3 py-3">{product.stockoutEvents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <FiltersBar filters={filters} onChange={setFilters} />
      <HighRiskTable items={items} onSelect={setSelected} />
      <ProductDetailDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
