import { useEffect, useState } from "react";
import { DollarSign, PackageX, Store, Tags } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getExecutiveSummary, getRevenueLossCauses, getRiskTrends, getStockoutDurationDistribution, getTopCategoriesByRevenue, getYearlyStockoutSummary } from "../lib/api/stockout-api";
import type { CategoryRevenue, RevenueLossSummary, RiskTrendPoint, StockoutDurationBucket, YearlyStockoutSummary } from "../lib/api/types";
import { KpiCard } from "../components/risk/KpiCard";
import { RiskTrendChart } from "../components/risk/RiskTrendChart";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { currency } from "../lib/utils";

const lossColors = ["#2563eb", "#f97316", "#dc2626", "#16a34a", "#9333ea", "#0891b2"];

export function DashboardPage() {
  const [summary, setSummary] = useState("");
  const [selectedYear, setSelectedYear] = useState<2024 | 2025>(2025);
  const [yearSummary, setYearSummary] = useState<YearlyStockoutSummary | null>(null);
  const [trends, setTrends] = useState<RiskTrendPoint[]>([]);
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
    void getYearlyStockoutSummary(selectedYear).then(setYearSummary);
    void getRiskTrends(365, selectedYear).then(setTrends);
    void getRevenueLossCauses(selectedYear).then(setRevenueLoss);
    void getTopCategoriesByRevenue(selectedYear).then(setTopCategories);
    void getStockoutDurationDistribution(selectedYear).then(setDurationDistribution);
  };

  useEffect(() => {
    refreshDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-elegant">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">Business data dashboard</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Risk Dashboard</h1>
            <p className="mt-3 max-w-4xl text-muted-foreground">
              {summary} Switch years to compare stockout loss, events, causes, durations, and sales categories for the same 10-store scope.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-border bg-background p-1">
            {[2024, 2025].map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year as 2024 | 2025)}
                className={`rounded-lg px-4 py-2 text-sm font-black transition ${
                  selectedYear === year ? "bg-brand text-brand-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-brand"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      </section>

      {yearSummary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={`${selectedYear} stockout revenue loss`} value={currency(yearSummary.lostRevenue)} delta={`${yearSummary.stockoutEvents.toLocaleString()} stockout events`} icon={DollarSign} />
          <KpiCard label="Lost units" value={yearSummary.lostUnits.toLocaleString()} delta={`${yearSummary.avgDurationDays.toFixed(1)} avg duration days`} icon={PackageX} />
          <KpiCard label="Stores affected" value={yearSummary.storesWithStockouts.toLocaleString()} delta={`${yearSummary.storeCount} stores in project scope`} icon={Store} />
          <KpiCard label="SKUs affected" value={yearSummary.skusWithStockouts.toLocaleString()} delta={`Top cause: ${yearSummary.topCause}`} icon={Tags} />
        </div>
      )}

      {yearSummary && (
        <section className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-elegant md:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">{selectedYear} sales revenue</p>
            <p className="mt-1 text-2xl font-black text-foreground">{currency(yearSummary.salesRevenue)}</p>
            <p className="text-sm text-muted-foreground">{yearSummary.transactions.toLocaleString()} transactions</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Units sold</p>
            <p className="mt-1 text-2xl font-black text-foreground">{yearSummary.unitsSold.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Across 10 selected stores</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Top stockout cause</p>
            <p className="mt-1 text-2xl font-black text-foreground">{yearSummary.topCause}</p>
            <p className="text-sm text-muted-foreground">{yearSummary.topCauseEvents.toLocaleString()} events · {currency(yearSummary.topCauseLostRevenue)}</p>
          </div>
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{selectedYear} monthly stockout trend by severity</CardTitle>
        </CardHeader>
        <CardContent>
          <RiskTrendChart data={trends} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedYear} Top 10 Categories by Sales Revenue</CardTitle>
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
          <CardTitle>{selectedYear} Stockout Duration Distribution</CardTitle>
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
              <CardTitle>{selectedYear} stockout revenue loss causes</CardTitle>
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
              <CardTitle>{selectedYear} products involved in stockout loss</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Store</th>
                      <th className="px-3 py-2">Cause</th>
                      <th className="px-3 py-2">Revenue impact</th>
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
    </div>
  );
}
