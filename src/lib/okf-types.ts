export const STATUS = ["planned", "active", "blocked", "at_risk", "done", "cancelled", "deferred"] as const;
export const RAG = ["green", "amber", "red", "grey"] as const;
export const CONFIDENCE = ["high", "medium", "low"] as const;
export const EVIDENCE = ["verified", "claimed", "none"] as const;
export const FIXED_HEADINGS = [
  "## Objective",
  "## Status Summary",
  "## Definition of Done",
  "## Deliverables",
  "## Dependencies",
  "## Risks & Issues",
  "## Watch-outs",
  "## Changelog",
] as const;
