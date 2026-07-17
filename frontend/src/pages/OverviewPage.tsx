import { useEffect, useState } from "react";
import { getFetchNextWeekStatus, getHighRiskItems, getRevenueLossCauses, getRiskTrends } from "../lib/api/stockout-api";
import type { FetchNextWeekStatus, HighRiskItem, RevenueLossSummary, RiskTrendPoint } from "../lib/api/types";
import { HeroSection } from "../components/overview/HeroSection";
import { HowItWorks } from "../components/overview/HowItWorks";
import { ProductPreview } from "../components/overview/ProductPreview";
import { Card, CardContent } from "../components/ui/Card";
import { currency } from "../lib/utils";

export function OverviewPage() {
  const [items, setItems] = useState<HighRiskItem[]>([]);
  const [trends, setTrends] = useState<RiskTrendPoint[]>([]);
  const [loss, setLoss] = useState<RevenueLossSummary | null>(null);
  const [weekStatus, setWeekStatus] = useState<FetchNextWeekStatus | null>(null);

  useEffect(() => {
    void getHighRiskItems({}).then(setItems);
    void getRiskTrends(365).then(setTrends);
    void getRevenueLossCauses().then(setLoss);
    void getFetchNextWeekStatus().then(setWeekStatus);
  }, []);

  const totalLostSales = loss?.causes.reduce((sum, cause) => sum + cause.lostRevenue, 0) ?? 0;
  const topCause = loss?.causes[0]?.cause ?? "Loading";
  const nextWeek = weekStatus?.nextWeekStart && weekStatus?.nextWeekEnd ? `${weekStatus.nextWeekStart} to ${weekStatus.nextWeekEnd}` : "2025 weekly DB fetch";

  return (
    <div>
      <HeroSection />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">2024 stockout revenue loss</p>
            <p className="mt-2 text-3xl font-black text-brand">{currency(totalLostSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Top revenue loss cause</p>
            <p className="mt-2 text-3xl font-black text-brand">{topCause}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Next data fetch</p>
            <p className="mt-2 text-3xl font-black text-brand">{nextWeek}</p>
          </CardContent>
        </Card>
      </div>
      <HowItWorks />
      {items.length > 0 && <ProductPreview items={items} trends={trends} />}
    </div>
  );
}
