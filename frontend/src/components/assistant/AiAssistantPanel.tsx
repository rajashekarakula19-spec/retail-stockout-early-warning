import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useIsMobile } from "../../lib/hooks/useIsMobile";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { AiAssistantMessage, AiAssistantTypingMessage } from "./AiAssistantMessage";
import { useAiAssistant } from "./AiAssistantProvider";

const suggestedQuestions = [
  "How is revenue protected calculated?",
  "Why did this product get a critical alert?",
  "How many days before stockout can we warn?",
  "Which features drive stockout risk?",
  "How were product thresholds selected?",
  "Why do false alerts happen?",
  "What data is used for predictions?",
  "How can we reduce missed stockouts?",
];

export function AiAssistantPanel() {
  const { open, closeAssistant, history, send, loading } = useAiAssistant();
  const [input, setInput] = useState("");
  const isMobile = useIsMobile();
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const visibleSuggestions = useMemo(() => {
    const assistantReplies = history.filter((message) => message.role === "assistant").length;
    const start = (assistantReplies - 1) % suggestedQuestions.length;
    return Array.from({ length: 3 }, (_, index) => suggestedQuestions[(start + index) % suggestedQuestions.length]);
  }, [history]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, loading, open]);

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
          {loading && <AiAssistantTypingMessage />}
          {!loading && (
            <div className="flex justify-start">
              <div className="max-w-[86%] space-y-2 rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-xs font-bold uppercase text-muted-foreground">Try asking</p>
                <div className="flex flex-wrap gap-2">
                  {visibleSuggestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => {
                        setInput("");
                        void send(question);
                      }}
                      className="rounded-full border border-border bg-muted px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground transition hover:border-brand/30 hover:bg-brand/8 hover:text-brand"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
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
