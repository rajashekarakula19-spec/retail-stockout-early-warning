import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getResults2025, getThresholdTuning2025 } from "../lib/api/stockout-api";
import type { MissedStockoutDetail, ResultBreakdownItem, Results2025Summary, ThresholdTuningSummary } from "../lib/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { currency, percent } from "../lib/utils";

const colors = ["#2563eb", "#f97316", "#dc2626", "#16a34a", "#9333ea", "#0891b2"];
const causeColors: Record<string, string> = {
  "Demand spike": "#2563eb",
  "Supplier delay": "#f97316",
  "Forecast miss": "#dc2626",
  Shrinkage: "#16a34a",
  "Manual error": "#9333ea",
  Unknown: "#0891b2",
};
const durationColors: Record<string, string> = {
  "1 day": "#2563eb",
  "2 days": "#f97316",
  "3 days": "#dc2626",
  "4-5 days": "#16a34a",
  "6-7 days": "#9333ea",
  "8+ days": "#0891b2",
};

function chartColor(label: string, keyName: "cause" | "bucket", index: number) {
  return (keyName === "cause" ? causeColors[label] : durationColors[label]) ?? colors[index % colors.length];
}

function compactNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function MissedStockoutTable({ rows }: { rows: MissedStockoutDetail[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Missed stockout data</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border bg-background text-sm font-semibold text-muted-foreground">
            No missed stockouts in this result set.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  <th className="border-b border-border px-3 py-3">Product</th>
                  <th className="border-b border-border px-3 py-3">Available Qty</th>
                  <th className="border-b border-border px-3 py-3">Shelf Qty</th>
                  <th className="border-b border-border px-3 py-3">Backroom</th>
                  <th className="border-b border-border px-3 py-3">Selling Rate</th>
                  <th className="border-b border-border px-3 py-3">Forecast</th>
                  <th className="border-b border-border px-3 py-3">Possible Stockout</th>
                  <th className="border-b border-border px-3 py-3">Probability</th>
                  <th className="border-b border-border px-3 py-3">Prediction result</th>
                  <th className="border-b border-border px-3 py-3">Replenishment</th>
                  <th className="border-b border-border px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.storeId}-${row.sku}-${row.predictionDate}`} className="align-top">
                    <td className="border-b border-border px-3 py-4">
                      <p className="font-black text-foreground">{row.productName}</p>
                      <p className="text-xs font-semibold text-muted-foreground">{row.sku} · {row.category}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.storeName} · {row.storeId}</p>
                    </td>
                    <td className="border-b border-border px-3 py-4 font-black text-foreground">{compactNumber(row.quantityAvailable)}</td>
                    <td className="border-b border-border px-3 py-4 font-black text-foreground">{compactNumber(row.shelfQuantity)}</td>
                    <td className="border-b border-border px-3 py-4 text-muted-foreground">{compactNumber(row.backroomQuantity)}</td>
                    <td className="border-b border-border px-3 py-4">
                      <p className="font-black text-foreground">{row.sellingRate.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">units/day</p>
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      <p className="font-black text-foreground">{compactNumber(row.forecast7dDemand)} units</p>
                      <p className="text-xs text-muted-foreground">7d demand · gap {compactNumber(row.forecastInventoryGap)}</p>
                      <p className="text-xs text-muted-foreground">{row.forecastDaysOfSupply.toFixed(1)} forecast days</p>
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      <p className="font-black text-foreground">{row.possibleStockoutTime}</p>
                      <p className="text-xs text-muted-foreground">{row.daysOfSupply.toFixed(1)} days supply</p>
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      <p className="font-black text-foreground">{percent(row.timeSeriesAdjustedProbability)}</p>
                      <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black capitalize text-amber-800">
                        {row.riskLevel}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">XGB {percent(row.stockoutProbability)} · threshold {percent(row.alertThreshold)}</p>
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      <p className="font-black text-amber-800">{row.predictionOutcome}</p>
                      <p className="text-xs text-muted-foreground">Predicted no · Actual yes</p>
                      <p className="mt-1 text-xs text-muted-foreground">Actual {row.actualStockoutDate ?? "unknown"} · {row.root_cause}</p>
                      <p className="text-xs font-semibold text-rose-700">{currency(row.estimated_lost_revenue)} missed</p>
                    </td>
                    <td className="border-b border-border px-3 py-4">
                      <p className="font-black text-foreground">{compactNumber(row.recentReplenishmentQty)} received</p>
                      <p className="text-xs text-muted-foreground">{row.daysSinceLastReplenishment.toFixed(0)} days ago · lead {row.avgSupplierLeadTime.toFixed(1)}d</p>
                    </td>
                    <td className="border-b border-border px-3 py-4 text-muted-foreground">{row.recommendedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, detail, tone = "brand" }: { label: string; value: string; detail: string; tone?: "brand" | "green" | "rose" }) {
  const toneClass = tone === "green" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-brand";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-elegant">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{detail}</p>
    </div>
  );
}

function BreakdownChart({ title, data, keyName }: { title: string; data: ResultBreakdownItem[]; keyName: "cause" | "bucket" }) {
  const chartData = data.map((item) => ({ ...item, label: item[keyName] ?? "Unknown" }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-background text-sm font-semibold text-muted-foreground">
            No missed labels in this evaluated result set.
          </div>
        ) : (
        <div className="h-[320px]">
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 28, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name, item) => {
                  const payload = item.payload as ResultBreakdownItem & { label: string };
                  if (name === "events") return [Number(value).toLocaleString(), `${payload.label} events`];
                  return [currency(Number(value ?? 0)), "Lost revenue"];
                }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                }}
              />
              <Bar dataKey="events" radius={[0, 8, 8, 0]}>
                {chartData.map((item, index) => (
                  <Cell key={item.label} fill={chartColor(item.label, keyName, index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </CardContent>
    </Card>
  );
}

function PieBreakdownChart({ title, data, keyName }: { title: string; data: ResultBreakdownItem[]; keyName: "cause" | "bucket" }) {
  const chartData = data.map((item) => ({ ...item, label: item[keyName] ?? "Unknown" }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-background text-sm font-semibold text-muted-foreground">
            No covered labels in this evaluated result set.
          </div>
        ) : (
        <>
        <div className="h-[320px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={chartData} dataKey="events" nameKey="label" innerRadius={58} outerRadius={108} paddingAngle={2}>
                {chartData.map((item, index) => (
                  <Cell key={item.label} fill={chartColor(item.label, keyName, index)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => {
                  const payload = item.payload as ResultBreakdownItem & { label: string };
                  return [Number(value).toLocaleString(), `${payload.label} · ${currency(payload.lostRevenue)} protected`];
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
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {chartData.map((item, index) => (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: chartColor(item.label, keyName, index) }} />
                <span className="font-bold text-foreground">{item.label}</span>
              </div>
              <span className="font-black text-brand">{item.events}</span>
            </div>
          ))}
        </div>
        </>
        )}
      </CardContent>
    </Card>
  );
}

function ThresholdTuningCard({ tuning }: { tuning: ThresholdTuningSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overall threshold tuning</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-bold uppercase text-muted-foreground">Recommended</p>
            <p className="mt-1 text-xl font-black text-brand">{tuning.recommendedTechnique}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-bold uppercase text-muted-foreground">Base threshold</p>
            <p className="mt-1 text-xl font-black text-foreground">{percent(tuning.recommendedThreshold)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-bold uppercase text-muted-foreground">PR-AUC</p>
            <p className="mt-1 text-xl font-black text-foreground">{tuning.prAuc.toFixed(3)}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                <th className="border-b border-border px-3 py-3">Technique</th>
                <th className="border-b border-border px-3 py-3">Threshold</th>
                <th className="border-b border-border px-3 py-3">Precision</th>
                <th className="border-b border-border px-3 py-3">Recall</th>
                <th className="border-b border-border px-3 py-3">F1</th>
                <th className="border-b border-border px-3 py-3">Successful</th>
                <th className="border-b border-border px-3 py-3">False alerts</th>
                <th className="border-b border-border px-3 py-3">Missed</th>
                <th className="border-b border-border px-3 py-3">Revenue protected</th>
              </tr>
            </thead>
            <tbody>
              {tuning.techniques.map((item) => {
                const isRecommended = item.technique === tuning.recommendedTechnique;
                return (
                  <tr key={item.technique} className={isRecommended ? "bg-emerald-50 align-top" : "align-top"}>
                    <td className="border-b border-border px-3 py-4">
                      <p className={isRecommended ? "font-black text-emerald-900" : "font-black text-foreground"}>{item.technique}</p>
                      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{item.description}</p>
                    </td>
                    <td className="border-b border-border px-3 py-4 font-black text-foreground">{item.threshold == null ? "No fixed threshold" : percent(item.threshold)}</td>
                    <td className="border-b border-border px-3 py-4">{percent(item.metrics.precision)}</td>
                    <td className="border-b border-border px-3 py-4">{percent(item.metrics.recall)}</td>
                    <td className="border-b border-border px-3 py-4">{percent(item.metrics.f1)}</td>
                    <td className="border-b border-border px-3 py-4 font-semibold text-emerald-700">{item.metrics.successfulPredictions}</td>
                    <td className="border-b border-border px-3 py-4 font-semibold text-rose-700">{item.metrics.falseAlerts}</td>
                    <td className="border-b border-border px-3 py-4 font-semibold text-amber-700">{item.metrics.missedStockouts}</td>
                    <td className="border-b border-border px-3 py-4 font-black text-foreground">{currency(item.metrics.revenueSaved)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs font-semibold text-muted-foreground">
          Tested {tuning.rowsChecked.toLocaleString()} evaluated prediction rows and {tuning.actualStockouts.toLocaleString()} evaluated stockout labels.
        </p>
      </CardContent>
    </Card>
  );
}

export function ResultsPage() {
  const [results, setResults] = useState<Results2025Summary | null>(null);
  const [thresholdTuning, setThresholdTuning] = useState<ThresholdTuningSummary | null>(null);

  useEffect(() => {
    void getResults2025(10).then(setResults);
    void getThresholdTuning2025(10).then(setThresholdTuning);
  }, []);

  if (!results) {
    return <div className="rounded-xl border border-border bg-card p-8 text-sm font-semibold text-muted-foreground">Loading 2025 results...</div>;
  }

  const { matrix } = results;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-elegant">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">Results</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">2025 10-Store Model Evaluation</h1>
        <p className="mt-3 max-w-4xl text-muted-foreground">
          Full-year 2025 performance for the same 10 selected stores, based on evaluated prediction rows: stockout labels covered, stockout labels missed, protected revenue, and missed root-cause/duration patterns.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Revenue protected" value={currency(results.estimatedRevenueProtected)} detail={`${percent(results.revenueCoverageRate)} of evaluated stockout revenue`} tone="green" />
        <MetricCard label="Missed stockout revenue" value={currency(results.estimatedRevenueMissed)} detail="Evaluated stockout labels missed by the model" tone="rose" />
        <MetricCard label="Covered stockout labels" value={results.coveredEvents.toLocaleString()} detail={`${percent(results.coverageRate)} of evaluated stockout labels`} />
        <MetricCard label="Evaluated stockout labels" value={results.stockoutEvents.toLocaleString()} detail="2025 rows where actual stockout label = yes" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Full-year 2025 prediction matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 text-center text-sm md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Precision</p>
              <p className="font-black text-foreground">{percent(matrix.precision)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Recall</p>
              <p className="font-black text-foreground">{percent(matrix.recall)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Accuracy</p>
              <p className="font-black text-foreground">{percent(matrix.accuracy)}</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Successful prediction</p>
              <p className="mt-2 text-3xl font-black text-emerald-900">{matrix.successfulPredictions.toLocaleString()}</p>
              <p className="mt-1 text-xs text-emerald-700">Predicted yes · Actual yes</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-rose-700">False alert</p>
              <p className="mt-2 text-3xl font-black text-rose-900">{matrix.falseAlerts.toLocaleString()}</p>
              <p className="mt-1 text-xs text-rose-700">Predicted yes · Actual no</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Missed stockout</p>
              <p className="mt-2 text-3xl font-black text-amber-900">{matrix.missedStockouts.toLocaleString()}</p>
              <p className="mt-1 text-xs text-amber-700">Predicted no · Actual yes</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Correct no alert</p>
              <p className="mt-2 text-3xl font-black text-sky-900">{matrix.correctNoAlerts.toLocaleString()}</p>
              <p className="mt-1 text-xs text-sky-700">Predicted no · Actual no</p>
            </div>
          </div>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            {matrix.rowsChecked.toLocaleString()} evaluated prediction rows · {matrix.predictedStockouts.toLocaleString()} predicted alerts · {matrix.actualStockouts.toLocaleString()} actual stockout labels
          </p>
        </CardContent>
      </Card>

      {thresholdTuning ? <ThresholdTuningCard tuning={thresholdTuning} /> : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <PieBreakdownChart title="Stockout causes covered by alerts" data={results.coveredCauses} keyName="cause" />
        <PieBreakdownChart title="Missed stockout causes" data={results.missedCauses} keyName="cause" />
        <BreakdownChart title="Stockout durations covered by alerts" data={results.coveredDurations} keyName="bucket" />
        <BreakdownChart title="Missed stockout durations" data={results.missedDurations} keyName="bucket" />
      </section>

      <MissedStockoutTable rows={results.missedStockouts} />

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-elegant md:grid-cols-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-600" />
          <div>
            <p className="font-black text-foreground">Revenue protected is estimated</p>
            <p className="text-sm text-muted-foreground">It means a prior alert existed before the actual stockout, so the lost revenue was preventable with action.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Target className="mt-1 h-5 w-5 text-brand" />
          <div>
            <p className="font-black text-foreground">Covered causes</p>
            <p className="text-sm text-muted-foreground">These are actual root causes where the system raised an alert in the previous 7 days.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 text-amber-600" />
          <div>
            <p className="font-black text-foreground">Missed charts</p>
            <p className="text-sm text-muted-foreground">These show where the model needs improvement: causes and durations that did not get a prior alert.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
