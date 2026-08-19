import type { AgentRun } from "./skill-schema";

export const activeMappingRunStates = new Set<AgentRun["status"]>([
  "queued", "running", "validating", "interrupt_requested", "retrying",
]);

export const terminalMappingRunStates = new Set<AgentRun["status"]>([
  "interrupted", "needs_review", "completed", "failed", "stale",
]);

export const mappingRunStorageKey = (jobDescriptionId: string) =>
  `dekra.skill-mapping.active.${jobDescriptionId}`;

export function nextMappingPollDelay(previousDelay: number) {
  if (!Number.isFinite(previousDelay) || previousDelay < 2_000) return 2_000;
  return Math.min(10_000, Math.round(previousDelay * 1.5));
}

export function isActiveMappingRun(run?: AgentRun | null) {
  return Boolean(run && activeMappingRunStates.has(run.status));
}

export function isTerminalMappingRun(run?: AgentRun | null) {
  return Boolean(run && terminalMappingRunStates.has(run.status));
}

export function mappingRunStage(run: AgentRun) {
  if (run.status === "queued") return "Preparing evidence";
  if (run.status === "validating") return "Running governance validation";
  if (run.status === "interrupt_requested") return "Stopping at a controlled checkpoint";
  if (run.status === "interrupted") return "Interrupted safely";
  if (run.status === "retrying") return "Preparing governed retry";
  if (run.status === "needs_review") return "Preparing review suggestion";
  if (run.status === "stale") return "Input changed — rerun required";
  return run.stage || (run.status === "failed" ? "Mapping failed" : "Generating candidate skills");
}

export function normalizeMappingProgress(run: AgentRun) {
  const defaults: Partial<Record<AgentRun["status"], number>> = {
    queued: 5, running: 35, validating: 85, interrupt_requested: 90,
    interrupted: 100, retrying: 10, needs_review: 100, completed: 100,
    failed: 100, stale: 100,
  };
  return Math.max(0, Math.min(100, Number(run.progress ?? defaults[run.status] ?? 0)));
}
