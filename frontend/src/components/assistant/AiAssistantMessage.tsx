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
