import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RiskTrendPoint } from "../../lib/api/types";

export function RiskTrendChart({ data }: { data: RiskTrendPoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="criticalFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--risk-critical))" stopOpacity={0.34} />
              <stop offset="95%" stopColor="hsl(var(--risk-critical))" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
            }}
          />
          <Area type="monotone" dataKey="critical" stroke="hsl(var(--risk-critical))" fill="url(#criticalFill)" strokeWidth={3} />
          <Area type="monotone" dataKey="high" stroke="hsl(var(--risk-high))" fill="hsl(var(--risk-high) / 0.10)" strokeWidth={2} />
          <Area type="monotone" dataKey="medium" stroke="hsl(var(--risk-medium))" fill="hsl(var(--risk-medium) / 0.08)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
