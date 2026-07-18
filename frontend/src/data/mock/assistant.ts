export const assistantReplies = [
  {
    keywords: ["recall", "precision", "model", "auc"],
    reply:
      "The model is tuned for recall because missed stockouts are costly. In the latest run, XGBoost catches most future stockouts while keeping precision stronger than the logistic baseline.",
  },
  {
    keywords: ["inventory", "days", "supply", "backroom"],
    reply:
      "The strongest operational signal is days of supply. Low shelf inventory, backroom imbalance, and recent high demand are the clearest reasons an item appears high risk.",
  },
  {
    keywords: ["action", "recommend", "transfer", "reorder"],
    reply:
      "Prioritize critical items with low days of supply first. If backroom stock exists, move it to shelf; otherwise expedite replenishment or transfer from a nearby store.",
  },
  {
    keywords: ["data", "stores", "coverage"],
    reply:
      "The current project scope uses 10 selected stores and scores every active store-SKU daily through 2025, producing 291,833 prediction rows for event-level stockout coverage.",
  },
  {
    keywords: ["rag", "ollama", "assistant", "explain"],
    reply:
      "The assistant uses a lightweight RAG flow: it retrieves relevant project documentation and PostgreSQL summary context, then sends that context to Ollama when the local Ollama server is running.",
  },
];
