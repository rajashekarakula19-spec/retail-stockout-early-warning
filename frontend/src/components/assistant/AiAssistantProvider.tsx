import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { sendAssistantMessage } from "../../lib/api/stockout-api";
import type { AssistantMessage } from "../../lib/api/types";

interface AiAssistantContextValue {
  open: boolean;
  history: AssistantMessage[];
  loading: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
  send: (content: string) => Promise<void>;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AssistantMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask me about data coverage, model results, prediction drivers, or recommended stockout actions.",
    },
  ]);

  const value = useMemo<AiAssistantContextValue>(
    () => ({
      open,
      history,
      loading,
      openAssistant: () => setOpen(true),
      closeAssistant: () => setOpen(false),
      send: async (content: string) => {
        const userMessage: AssistantMessage = { id: crypto.randomUUID(), role: "user", content };
        setHistory((current) => [...current, userMessage]);
        setLoading(true);
        const response = await sendAssistantMessage(content, history);
        setHistory((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response }]);
        setLoading(false);
      },
    }),
    [history, loading, open],
  );

  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}

export function useAiAssistant() {
  const context = useContext(AiAssistantContext);
  if (!context) throw new Error("useAiAssistant must be used inside AiAssistantProvider");
  return context;
}
