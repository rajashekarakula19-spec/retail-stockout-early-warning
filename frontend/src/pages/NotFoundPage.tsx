import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center shadow-elegant">
      <h1 className="text-4xl font-black text-brand">Page not found</h1>
      <p className="mt-3 text-muted-foreground">The route you opened does not exist in the stockout workspace.</p>
      <Link to="/" className="mt-6 inline-block">
        <Button>Return to overview</Button>
      </Link>
    </div>
  );
}
