import type { PredictionResult } from "../../lib/api/types";
import { currency, percent } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { RiskBadge } from "../risk/RiskBadge";

export function PredictionSummaryCard({ prediction }: { prediction: PredictionResult }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Prediction summary</CardTitle>
          <RiskBadge level={prediction.riskLevel} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-muted p-4">
            <p className="text-sm text-muted-foreground">Stockout probability</p>
            <p className="mt-2 text-4xl font-black text-brand">{percent(prediction.probability)}</p>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <p className="text-sm text-muted-foreground">Days of supply</p>
            <p className="mt-2 text-4xl font-black text-brand">{prediction.daysOfSupply.toFixed(1)}</p>
          </div>
          <div className="rounded-xl bg-muted p-4">
            <p className="text-sm text-muted-foreground">Projected revenue at risk</p>
            <p className="mt-2 text-4xl font-black text-brand">{currency(prediction.estimatedLostSales)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">3-day urgent risk</p>
            <p className="mt-1 text-2xl font-black text-brand">{percent(prediction.probability3d ?? prediction.probability)}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">Alert threshold</p>
            <p className="mt-1 text-2xl font-black text-brand">{percent(prediction.alertThreshold ?? 0.5)}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">14-day planning risk</p>
            <p className="mt-1 text-2xl font-black text-brand">{percent(prediction.probability14d ?? prediction.probability)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ["On hand", prediction.unitsOnHand?.toLocaleString() ?? "0"],
            ["Demand/day", prediction.avgDailyDemand7d?.toFixed(1) ?? "0.0"],
            ["Last replenishment", `${prediction.daysSinceLastReplenishment?.toFixed(0) ?? "0"} days`],
            ["Lead time", `${prediction.avgSupplierLeadTime?.toFixed(1) ?? "0.0"} days`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-black text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-bold text-foreground">Recommended action</p>
          <p className="mt-1 text-sm text-muted-foreground">{prediction.recommendedAction}</p>
          <p className="mt-2 text-xs font-semibold text-brand">{prediction.alertReason ?? "standard threshold"}</p>
        </div>
      </CardContent>
    </Card>
  );
}
