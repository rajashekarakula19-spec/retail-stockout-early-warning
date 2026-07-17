import { useEffect, useState } from "react";
import { Bell, CalendarDays, Database, ShieldCheck } from "lucide-react";
import { getResults2025 } from "../lib/api/stockout-api";
import type { Results2025Summary } from "../lib/api/types";
import { HeroSection } from "../components/overview/HeroSection";
import { Card, CardContent } from "../components/ui/Card";
import { currency, percent } from "../lib/utils";

export function OverviewPage() {
  const [results, setResults] = useState<Results2025Summary | null>(null);

  useEffect(() => {
    void getResults2025(10).then(setResults);
  }, []);

  return (
    <div>
      <HeroSection />
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Project stores</p>
            <p className="mt-2 text-3xl font-black text-brand">10</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Daily prediction rows</p>
            <p className="mt-2 text-3xl font-black text-brand">{results ? results.matrix.rowsChecked.toLocaleString() : "Loading"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">2025 stockout events</p>
            <p className="mt-2 text-3xl font-black text-brand">{results ? results.stockoutEvents.toLocaleString() : "Loading"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Revenue coverage</p>
            <p className="mt-2 text-3xl font-black text-brand">{results ? percent(results.revenueCoverageRate) : "Loading"}</p>
          </CardContent>
        </Card>
      </div>

      <section className="mt-8 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">Project focus</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Daily stockout early-warning system</h2>
            <div className="mt-5 grid gap-4">
              <div className="flex gap-3">
                <Database className="mt-1 h-5 w-5 shrink-0 text-brand" />
                <div>
                  <p className="font-black text-foreground">PostgreSQL-backed data pipeline</p>
                  <p className="text-sm leading-6 text-muted-foreground">Raw sales, inventory, replenishment, and stockout events are converted into daily store-SKU modeling rows.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-1 h-5 w-5 shrink-0 text-brand" />
                <div>
                  <p className="font-black text-foreground">2024 training, 2025 validation</p>
                  <p className="text-sm leading-6 text-muted-foreground">The model learns from 2024 history and scores every active product daily through 2025.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Bell className="mt-1 h-5 w-5 shrink-0 text-brand" />
                <div>
                  <p className="font-black text-foreground">Prior-alert evaluation</p>
                  <p className="text-sm leading-6 text-muted-foreground">Each actual stockout is checked for an alert in the 1-7 days before the stockout date.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">2025 event-level result</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Business coverage snapshot</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Stockout loss at risk</p>
                <p className="mt-1 text-2xl font-black text-foreground">{results ? currency(results.estimatedRevenueAtRisk) : "Loading"}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase text-emerald-700">Revenue covered</p>
                <p className="mt-1 text-2xl font-black text-emerald-900">{results ? percent(results.revenueCoverageRate) : "Loading"}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Average warning</p>
                <p className="mt-1 text-2xl font-black text-foreground">{results ? `${results.averageWarningDays.toFixed(1)} days` : "Loading"}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Daily predictions</p>
                <p className="mt-1 text-2xl font-black text-foreground">{results ? results.matrix.rowsChecked.toLocaleString() : "Loading"}</p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-lg bg-brand/8 p-4">
              <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-brand" />
              <p className="text-sm leading-6 text-muted-foreground">
                This page now introduces the project; detailed charts and product tables live in Risk Dashboard, Predictions, and Results.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
