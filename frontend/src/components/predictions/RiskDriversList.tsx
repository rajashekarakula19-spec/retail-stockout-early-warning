import type { RiskDriver } from "../../lib/api/types";

export function RiskDriversList({ drivers }: { drivers: RiskDriver[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-elegant">
      <h3 className="text-lg font-bold text-foreground">Risk drivers</h3>
      <div className="mt-4 space-y-4">
        {drivers.map((driver) => (
          <div key={driver.name}>
            <div className="flex justify-between gap-4 text-sm">
              <span className="font-semibold text-foreground">{driver.name}</span>
              <span className={driver.direction === "increases" ? "text-risk-high" : "text-risk-low"}>{driver.direction}</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-muted">
              <div
                className={driver.direction === "increases" ? "h-3 rounded-full bg-risk-high" : "h-3 rounded-full bg-risk-low"}
                style={{ width: `${driver.impact * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
