import type { EmergingSkillCandidate, TrendSignal } from "./emerging-skill-radar";

export type TrendRunStatus = "queued" | "screening" | "comparing" | "preparing_review" | "interrupt_requested" | "interrupted" | "completed" | "failed" | "stale";

export type TrendAnalysisSnapshot = {
  id: string;
  version: number;
  generatedAt: string;
  sourceCutoffAt: string;
  configVersion: string;
  promptVersion: string;
  signals: TrendSignal[];
  candidates: EmergingSkillCandidate[];
  sourceCount: number;
};

export type TrendAnalysisRun = {
  id: string;
  mode: "trend_radar";
  status: TrendRunStatus;
  stage: string;
  progress: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  sourceCutoffAt: string;
  configVersion: string;
  snapshotVersion?: number;
  retryOfRunId?: string;
  attempt: number;
  interruptRequested?: boolean;
  warning?: string;
  error?: { code: string; message: string; retryable: boolean };
};

export type ProficiencyLever = "Knowledge & collaboration" | "Problem solving" | "Accountability" | "Impact";
export type CandidateProficiencyLevel = {
  level: 1 | 2 | 3 | 4;
  label: "Guided application" | "Independent application" | "Broad application" | "Strategic contribution";
  levers: Record<ProficiencyLever, string>;
};

export const trendRunStorageKey = "dekra.emerging-skills.active-run";
export const trendSnapshotStorageKey = "dekra.emerging-skills.latest-snapshot";
export const activeTrendRunStates = new Set<TrendRunStatus>(["queued", "screening", "comparing", "preparing_review", "interrupt_requested"]);
export const terminalTrendRunStates = new Set<TrendRunStatus>(["interrupted", "completed", "failed", "stale"]);

export const isActiveTrendRun = (run?: TrendAnalysisRun | null) => Boolean(run && activeTrendRunStates.has(run.status));
export const isTerminalTrendRun = (run?: TrendAnalysisRun | null) => Boolean(run && terminalTrendRunStates.has(run.status));

export function nextTrendPollDelay(previous: number) {
  if (!Number.isFinite(previous) || previous < 2_000) return 2_000;
  return Math.min(10_000, Math.round(previous * 1.5));
}

export function trendRunStage(run: TrendAnalysisRun) {
  if (run.status === "queued") return "Preparing allowlisted sources";
  if (run.status === "screening") return "Screening source evidence";
  if (run.status === "comparing") return "Comparing catalogue and job profiles";
  if (run.status === "preparing_review") return "Preparing governed candidate review";
  if (run.status === "interrupt_requested") return "Stopping at a controlled checkpoint";
  if (run.status === "interrupted") return "Interrupted safely";
  if (run.status === "completed") return "Analysis snapshot ready";
  if (run.status === "stale") return "Inputs changed — rerun required";
  return run.stage || "Trend scan failed";
}

export function candidateProficiencyLevels(candidate: EmergingSkillCandidate): CandidateProficiencyLevel[] {
  const skill = candidate.name;
  return [
    { level: 1, label: "Guided application", levers: {
      "Knowledge & collaboration": `Explains the purpose and basic concepts of ${skill}; applies them with guidance and seeks input from experienced colleagues.`,
      "Problem solving": "Uses defined steps for familiar cases and escalates exceptions or uncertainty.",
      "Accountability": "Owns assigned activities while a reviewer remains accountable for the overall result.",
      "Impact": "Produces reliable task-level contributions within one role or team.",
    } },
    { level: 2, label: "Independent application", levers: {
      "Knowledge & collaboration": `Applies ${skill} independently and coordinates the required inputs with relevant colleagues.`,
      "Problem solving": "Resolves routine and varied cases, selecting an appropriate established approach without routine direction.",
      "Accountability": "Is accountable for the quality and completion of their own end-to-end output.",
      "Impact": "Improves dependable outcomes for the role, team or immediate customer.",
    } },
    { level: 3, label: "Broad application", levers: {
      "Knowledge & collaboration": `Integrates advanced ${skill} knowledge across complex contexts and guides colleagues or adjacent teams.`,
      "Problem solving": "Resolves ambiguous, non-standard and cross-functional problems by adapting methods and evidence.",
      "Accountability": "Owns quality, methods or significant decisions across multiple assignments or teams.",
      "Impact": "Improves capability and measurable outcomes across a value stream, service or broad operating context.",
    } },
    { level: 4, label: "Strategic contribution", levers: {
      "Knowledge & collaboration": `Shapes the DEKRA practice for ${skill}, builds external or enterprise networks and develops other experts.`,
      "Problem solving": "Anticipates and resolves novel, systemic challenges and defines principles for future application.",
      "Accountability": "Is accountable for functional capability direction, standards, guardrails or strategic choices.",
      "Impact": "Advances enterprise, market or ecosystem outcomes and materially shapes the function itself.",
    } },
  ];
}

