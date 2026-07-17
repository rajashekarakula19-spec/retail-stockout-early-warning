import type { RiskLevel } from "../../lib/api/types";
import { cn } from "../../lib/utils";

const styles: Record<RiskLevel, string> = {
  critical: "border-risk-critical/25 bg-risk-critical/12 text-risk-critical",
  high: "border-risk-high/25 bg-risk-high/12 text-risk-high",
  medium: "border-risk-medium/30 bg-risk-medium/16 text-brand",
  low: "border-risk-low/25 bg-risk-low/12 text-risk-low",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize", styles[level])}>
      {level}
    </span>
  );
}
