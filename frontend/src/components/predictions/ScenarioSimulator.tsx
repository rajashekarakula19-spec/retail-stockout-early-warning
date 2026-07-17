import type { ScenarioInput } from "../../lib/api/types";
import { Button } from "../ui/Button";

interface ScenarioSimulatorProps {
  value: ScenarioInput;
  onChange: (value: ScenarioInput) => void;
  onReset: () => void;
}

export function ScenarioSimulator({ value, onChange, onReset }: ScenarioSimulatorProps) {
  const update = (patch: Partial<ScenarioInput>) => onChange({ ...value, ...patch });
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-elegant">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-foreground">Scenario simulator</h3>
          <p className="text-sm text-muted-foreground">Adjust operating assumptions and watch the prediction rescore.</p>
        </div>
        <Button variant="ghost" onClick={onReset}>Reset</Button>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-sm font-bold text-foreground">Supplier lead time: {value.leadTimeDays} days</span>
          <input className="w-full accent-[hsl(var(--accent-warm))]" type="range" min={1} max={10} value={value.leadTimeDays} onChange={(event) => update({ leadTimeDays: Number(event.target.value) })} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-bold text-foreground">Promo uplift: {value.promoUpliftPct}%</span>
          <input className="w-full accent-[hsl(var(--accent-warm))]" type="range" min={0} max={60} value={value.promoUpliftPct} onChange={(event) => update({ promoUpliftPct: Number(event.target.value) })} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-bold text-foreground">Safety stock: {value.safetyStockUnits} units</span>
          <input className="w-full accent-[hsl(var(--accent-warm))]" type="range" min={0} max={120} value={value.safetyStockUnits} onChange={(event) => update({ safetyStockUnits: Number(event.target.value) })} />
        </label>
      </div>
    </div>
  );
}
