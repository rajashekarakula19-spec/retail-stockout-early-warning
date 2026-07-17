import type { HighRiskItem, RiskTrendPoint } from "../../lib/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { HighRiskTable } from "../risk/HighRiskTable";
import { RiskTrendChart } from "../risk/RiskTrendChart";

export function ProductPreview({ items, trends }: { items: HighRiskItem[]; trends: RiskTrendPoint[] }) {
  return (
    <section className="mt-10 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle>2024 monthly risk trend</CardTitle>
        </CardHeader>
        <CardContent>
          <RiskTrendChart data={trends} />
        </CardContent>
      </Card>
      <div>
        <h2 className="mb-4 text-3xl font-black tracking-tight text-foreground">10-store product risk preview</h2>
        <HighRiskTable items={items.slice(0, 3)} onSelect={() => undefined} />
      </div>
    </section>
  );
}
