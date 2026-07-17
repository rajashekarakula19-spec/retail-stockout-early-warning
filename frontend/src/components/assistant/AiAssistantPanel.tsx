import { useState } from "react";
import { Send } from "lucide-react";
import { useIsMobile } from "../../lib/hooks/useIsMobile";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { AiAssistantMessage } from "./AiAssistantMessage";
import { useAiAssistant } from "./AiAssistantProvider";

export function AiAssistantPanel() {
  const { open, closeAssistant, history, send, loading } = useAiAssistant();
  const [input, setInput] = useState("");
  const isMobile = useIsMobile();

  const submit = async () => {
    if (!input.trim()) return;
    const content = input.trim();
    setInput("");
    await send(content);
  };

  return (
    <Panel open={open} onClose={closeAssistant} title="AI stockout assistant" side={isMobile ? "bottom" : "right"}>
      <div className="space-y-4">
        <div className="max-h-[58vh] space-y-3 overflow-y-auto rounded-xl border border-border bg-background p-3">
          {history.map((message) => (
            <AiAssistantMessage key={message.id} message={message} />
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            placeholder="Ask about risk, drivers, or actions..."
            aria-label="Assistant message"
          />
          <Button onClick={submit} disabled={loading} aria-label="Send assistant message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Panel>
  );
}
