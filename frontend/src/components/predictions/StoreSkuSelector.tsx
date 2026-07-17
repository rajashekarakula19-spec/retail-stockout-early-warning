import type { Product, Store } from "../../lib/api/types";

interface StoreSkuSelectorProps {
  stores: Store[];
  products: Product[];
  storeId: string;
  sku: string;
  onStoreChange: (storeId: string) => void;
  onSkuChange: (sku: string) => void;
}

export function StoreSkuSelector({ stores, products, storeId, sku, onStoreChange, onSkuChange }: StoreSkuSelectorProps) {
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-elegant md:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-bold text-foreground">Store</span>
        <select className="w-full rounded-xl border border-input bg-background px-3 py-3" value={storeId} onChange={(event) => onStoreChange(event.target.value)}>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-sm font-bold text-foreground">SKU</span>
        <select className="w-full rounded-xl border border-input bg-background px-3 py-3" value={sku} onChange={(event) => onSkuChange(event.target.value)}>
          {products.map((product) => (
            <option key={product.sku} value={product.sku}>{product.sku} · {product.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
