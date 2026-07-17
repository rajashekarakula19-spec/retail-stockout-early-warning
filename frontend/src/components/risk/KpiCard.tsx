import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "../ui/Card";

interface KpiCardProps {
  label: string;
  value: string;
  delta: string;
  icon: LucideIcon;
}

export function KpiCard({ label, value, delta, icon: Icon }: KpiCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{value}</p>
          </div>
          <div className="rounded-xl bg-accent-warm/14 p-3 text-accent-warm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 flex items-center gap-1 text-sm font-semibold text-risk-low">
          <ArrowUpRight className="h-4 w-4" />
          {delta}
        </p>
      </CardContent>
    </Card>
  );
}
