import type { HighRiskItem } from "../../lib/api/types";
import { currency, percent } from "../../lib/utils";
import { RiskBadge } from "./RiskBadge";

export function HighRiskTable({ items, onSelect }: { items: HighRiskItem[]; onSelect: (item: HighRiskItem) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elegant">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">3 / 7 / 14 day risk</th>
              <th className="px-4 py-3">Alert threshold</th>
              <th className="px-4 py-3">Days Supply</th>
              <th className="px-4 py-3">Prediction result</th>
              <th className="px-4 py-3">Projected Revenue at Risk</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="cursor-pointer border-t border-border transition hover:bg-muted/70" onClick={() => onSelect(item)}>
                <td className="px-4 py-4">
                  <div className="font-bold text-foreground">{item.storeName}</div>
                  <div className="text-xs text-muted-foreground">{item.region}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="font-semibold text-foreground">{item.productName}</div>
                  <div className="text-xs text-muted-foreground">{item.sku} · {item.category}</div>
                </td>
                <td className="px-4 py-4"><RiskBadge level={item.riskLevel} /></td>
                <td className="px-4 py-4">
                  <div className="font-bold text-brand">{percent(item.probability)}</div>
                  <div className="text-xs text-muted-foreground">
                    {percent(item.probability3d ?? item.probability)} / {percent(item.probability)} / {percent(item.probability14d ?? item.probability)}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="font-semibold text-foreground">{percent(item.alertThreshold ?? 0.5)}</div>
                  <div className="text-xs text-muted-foreground">{item.alertReason ?? "standard threshold"}</div>
                </td>
                <td className="px-4 py-4">{item.daysOfSupply.toFixed(1)}</td>
                <td className="px-4 py-4">
                  <div className="font-bold text-foreground">{item.predictionOutcome ?? "Pending outcome"}</div>
                  <div className="text-xs text-muted-foreground">
                    Predicted {item.predictedStockout ? "yes" : "no"} · Actual {item.actualStockout ? "yes" : "no"}
                  </div>
                </td>
                <td className="px-4 py-4">{currency(item.estimatedLostSales)}</td>
                <td className="px-4 py-4 text-muted-foreground">{item.recommendedAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
