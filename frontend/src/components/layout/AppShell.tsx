import { NavLink, Outlet } from "react-router-dom";
import { Bot, Boxes, LineChart, Search } from "lucide-react";
import { useAiAssistant } from "../assistant/AiAssistantProvider";
import { AiAssistantPanel } from "../assistant/AiAssistantPanel";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/dashboard", label: "Risk Dashboard" },
  { to: "/predictions", label: "Predictions" },
  { to: "/results", label: "Results" },
];

export function AppShell() {
  const { openAssistant } = useAiAssistant();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="rounded-xl bg-brand p-2 text-brand-foreground">
              <Boxes className="h-5 w-5" />
            </span>
            <span className="hidden font-black tracking-tight text-brand sm:inline">ShelfSignal</span>
            <span className="hidden text-sm font-semibold text-muted-foreground xl:inline">Retail Stockout Early-Warning System</span>
          </NavLink>
          <nav className="flex flex-1 items-center justify-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-brand",
                    isActive && "bg-muted text-brand",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Button onClick={openAssistant} variant="secondary" className="hidden sm:inline-flex">
            <Bot className="h-4 w-4" />
            Ask Assistant
          </Button>
          <Button onClick={openAssistant} variant="secondary" className="sm:hidden" aria-label="Ask Assistant">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <AiAssistantPanel />
      <button
        type="button"
        onClick={openAssistant}
        className="fixed bottom-5 right-5 hidden rounded-full bg-accent-warm/14 p-5 text-accent-warm shadow-elegant transition hover:-translate-y-0.5 hover:bg-accent-warm/20 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-accent-warm focus:ring-offset-2 lg:block"
        aria-label="Open stockout assistant"
        title="Ask the stockout assistant"
      >
        <LineChart className="h-6 w-6" />
      </button>
    </div>
  );
}
