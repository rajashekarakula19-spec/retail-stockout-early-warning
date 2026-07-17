import { ArrowRight, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/Button";

export function HeroSection() {
  return (
    <section className="hero-gradient overflow-hidden rounded-xl p-8 shadow-elegant lg:p-12">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-foreground/14 px-3 py-1 text-sm font-bold text-brand-foreground">
            <Store className="h-4 w-4" />
            10-store stockout early-warning demo
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-brand-foreground md:text-6xl">
            Train on 2024. Predict weekly 2025 stockouts.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-brand-foreground/84">
            This demo focuses on 10 selected stores, pulls the next unseen week from PostgreSQL, and shows how inventory, demand, replenishment, and stockout history change risk alerts.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/dashboard">
              <Button>
                View Risk Dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/predictions">
              <Button variant="ghost" className="bg-brand-foreground/12 text-brand-foreground hover:bg-brand-foreground/18">
                View Store Predictions
              </Button>
            </Link>
          </div>
        </div>
        <div className="rounded-xl border border-brand-foreground/18 bg-brand-foreground/12 p-5 text-brand-foreground backdrop-blur">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-foreground/74">Demo scope</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-foreground/12 p-4">
              <p className="text-3xl font-black">10</p>
              <p className="text-sm text-brand-foreground/74">stores selected</p>
            </div>
            <div className="rounded-xl bg-brand-foreground/12 p-4">
              <p className="text-3xl font-black">2024</p>
              <p className="text-sm text-brand-foreground/74">analysis/training year</p>
            </div>
            <div className="col-span-2 rounded-xl bg-brand-foreground/12 p-4">
              <p className="text-3xl font-black">2025 weekly DB fetch</p>
              <p className="text-sm text-brand-foreground/74">simulate new operational data arriving from PostgreSQL</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
