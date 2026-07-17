import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../../lib/utils";

interface PanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "right" | "bottom";
}

export function Panel({ open, onClose, title, children, side = "right" }: PanelProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-brand/35 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={cn(
          "fixed border border-border bg-card shadow-elegant",
          side === "right"
            ? "right-0 top-0 h-full w-full max-w-xl overflow-y-auto rounded-l-xl"
            : "bottom-0 left-0 right-0 max-h-[86vh] overflow-y-auto rounded-t-xl",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-4">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
