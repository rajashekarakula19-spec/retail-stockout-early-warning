import type { AssistantMessage } from "../../lib/api/types";
import { cn } from "../../lib/utils";

export function AiAssistantMessage({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[86%] rounded-xl px-4 py-3 text-sm leading-6",
          isUser ? "bg-brand text-brand-foreground" : "bg-muted text-foreground",
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

export function AiAssistantTypingMessage() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-xl bg-muted px-4 py-3" aria-label="Assistant is typing">
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.24s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.12s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
      </div>
    </div>
  );
}
