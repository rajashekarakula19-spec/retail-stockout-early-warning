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
    <Card className="h-full overflow-hidden">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="min-h-10 text-sm font-medium leading-5 text-muted-foreground">{label}</p>
            <p className="mt-2 break-words text-3xl font-black tracking-tight text-foreground">{value}</p>
          </div>
          <div className="shrink-0 rounded-xl bg-accent-warm/14 p-3 text-accent-warm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-risk-low">
          <ArrowUpRight className="h-4 w-4" />
          {delta}
        </p>
      </CardContent>
    </Card>
  );
}
