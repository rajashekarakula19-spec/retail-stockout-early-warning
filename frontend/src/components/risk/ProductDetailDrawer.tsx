import type { HighRiskItem } from "../../lib/api/types";
import { currency, percent } from "../../lib/utils";
import { Panel } from "../ui/Panel";
import { RiskBadge } from "./RiskBadge";
import { RiskTrendChart } from "./RiskTrendChart";

export function ProductDetailDrawer({ item, onClose }: { item: HighRiskItem | null; onClose: () => void }) {
  return (
    <Panel open={Boolean(item)} onClose={onClose} title={item ? item.productName : "Product detail"}>
      {item && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <RiskBadge level={item.riskLevel} />
            <span className="text-sm font-semibold text-muted-foreground">{item.storeName}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">Probability</p>
              <p className="text-2xl font-black text-brand">{percent(item.probability)}</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">Days Supply</p>
              <p className="text-2xl font-black text-brand">{item.daysOfSupply.toFixed(1)}</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">Projected Revenue at Risk</p>
              <p className="text-2xl font-black text-brand">{currency(item.estimatedLostSales)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["On hand", item.unitsOnHand?.toLocaleString() ?? "0"],
              ["7-day demand/day", item.avgDailyDemand7d?.toFixed(1) ?? "0.0"],
              ["Recent replenishment", item.recentReplenishmentQty?.toLocaleString() ?? "0"],
              ["Days since replenishment", item.daysSinceLastReplenishment?.toFixed(0) ?? "0"],
              ["Supplier lead time", `${item.avgSupplierLeadTime?.toFixed(1) ?? "0.0"} days`],
              ["Alert threshold", percent(item.alertThreshold ?? 0.5)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-black text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="font-bold text-foreground">Risk horizons</h3>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div><span className="text-muted-foreground">3 days</span><p className="font-black text-brand">{percent(item.probability3d ?? item.probability)}</p></div>
              <div><span className="text-muted-foreground">7 days</span><p className="font-black text-brand">{percent(item.probability)}</p></div>
              <div><span className="text-muted-foreground">14 days</span><p className="font-black text-brand">{percent(item.probability14d ?? item.probability)}</p></div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{item.alertReason ?? "standard threshold"}</p>
          </div>
          <div>
            <h3 className="font-bold text-foreground">Recommended action</h3>
            <p className="mt-2 rounded-xl border border-border bg-background p-4 text-sm leading-6">{item.recommendedAction}</p>
          </div>
          <RiskTrendChart data={item.trend} />
        </div>
      )}
    </Panel>
  );
}
