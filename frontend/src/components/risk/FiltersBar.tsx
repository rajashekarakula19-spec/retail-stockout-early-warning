import type { RiskLevel } from "../../lib/api/types";

export interface RiskFilters {
  region: string;
  category: string;
  riskLevel: RiskLevel | "all";
  search: string;
}

interface FiltersBarProps {
  filters: RiskFilters;
  onChange: (filters: RiskFilters) => void;
}

export function FiltersBar({ filters, onChange }: FiltersBarProps) {
  const update = (patch: Partial<RiskFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-elegant md:grid-cols-4">
      <input
        className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        placeholder="Search store, SKU, product"
        value={filters.search}
        onChange={(event) => update({ search: event.target.value })}
      />
      <select className="rounded-xl border border-input bg-background px-3 py-2 text-sm" value={filters.region} onChange={(event) => update({ region: event.target.value })}>
        <option value="all">All regions</option>
        <option value="Southeast">Southeast</option>
        <option value="Southwest">Southwest</option>
        <option value="West">West</option>
        <option value="Mountain">Mountain</option>
      </select>
      <select className="rounded-xl border border-input bg-background px-3 py-2 text-sm" value={filters.category} onChange={(event) => update({ category: event.target.value })}>
        <option value="all">All categories</option>
        <option value="Personal Care">Personal Care</option>
        <option value="Frozen Foods">Frozen Foods</option>
        <option value="Dairy & Eggs">Dairy & Eggs</option>
        <option value="Snacks">Snacks</option>
        <option value="Beverages">Beverages</option>
        <option value="Pantry">Pantry</option>
      </select>
      <select className="rounded-xl border border-input bg-background px-3 py-2 text-sm" value={filters.riskLevel} onChange={(event) => update({ riskLevel: event.target.value as RiskFilters["riskLevel"] })}>
        <option value="all">All risk levels</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </div>
  );
}
