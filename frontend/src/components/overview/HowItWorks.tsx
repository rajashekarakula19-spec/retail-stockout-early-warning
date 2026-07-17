import { Bell, Database, LineChart, Truck } from "lucide-react";
import { Card, CardContent } from "../ui/Card";

const steps = [
  { title: "Select 10 Stores", body: "Dashboard, risk analysis, and predictions use the same 10 selected stores from PostgreSQL.", icon: Database },
  { title: "Analyze 2024", body: "Revenue loss, products involved, and monthly risk trend are shown from 2024 stockout history.", icon: LineChart },
  { title: "Fetch 2025 Week", body: "A button pulls the next unseen 2025 week from the database and rescoring updates alerts.", icon: Bell },
  { title: "Act", body: "Predictions include reorder, transfer, shelf-fill, and monitoring actions for each risky product.", icon: Truck },
];

export function HowItWorks() {
  return (
    <section className="mt-10">
      <div className="mb-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-warm">Workflow</p>
        <h2 className="text-3xl font-black tracking-tight text-foreground">10-store stockout simulation flow</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {steps.map((step) => (
          <Card key={step.title}>
            <CardContent className="p-5">
              <div className="mb-4 inline-flex rounded-xl bg-accent-warm/14 p-3 text-accent-warm">
                <step.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
