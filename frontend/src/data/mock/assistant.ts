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
      "The current local modeling sample now covers all 478 stores with two representative SKUs per store, giving full store coverage while keeping the local pipeline responsive.",
  },
];
