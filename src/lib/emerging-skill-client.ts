import type { SkillWorkspace } from "./skill-schema";
import { governedIdempotencyKey, SkillWorkflowError } from "./skill-client";
import type { EmergingSkillCandidate, TrendSignal } from "./emerging-skill-radar";
import type { TrendAnalysisRun, TrendAnalysisSnapshot } from "./emerging-skill-runtime";
import { readWorkflowResponse, workflowErrorMessage } from "./workflow-response";

const startUrl = () => process.env.NEXT_PUBLIC_N8N_TREND_RADAR_START_URL?.trim() || "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-trend-radar-async-v1";
const controlUrl = () => process.env.NEXT_PUBLIC_N8N_TREND_RADAR_CONTROL_URL?.trim() || "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-trend-radar-control-v1";

export type TrendWorkflowResponse = { ok?: boolean; error?: string; message?: string; trendRun?: TrendAnalysisRun; snapshot?: TrendAnalysisSnapshot; pollAfterMs?: number };

function unwrap(raw: unknown): TrendWorkflowResponse {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && "json" in first) return (first as { json: TrendWorkflowResponse }).json;
    return (first || {}) as TrendWorkflowResponse;
  }
  return (raw || {}) as TrendWorkflowResponse;
}

async function call(secret: string, body: unknown, endpoint: string, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret.trim() }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "TimeoutError") throw new Error("The trend workflow did not respond in time. Its persisted run remains available; resume monitoring before retrying.");
    throw reason;
  }
  const payload = unwrap(await readWorkflowResponse(response));
  if (!response.ok || payload.ok === false) throw new SkillWorkflowError(payload.error || workflowErrorMessage(payload, response.status, "Trend Radar workflow"), response.status, payload);
  return payload;
}

function governedWorkspaceInput(workspace: SkillWorkspace) {
  return {
    revision: workspace.revision,
    frameworkVersion: workspace.framework.version,
    rulesVersion: workspace.framework.rulesVersion,
    skills: workspace.skills.map(({ id, name, description, aliases, dimension, capabilityType, status, futureRelevance }) => ({ id, name, description, aliases, dimension, capabilityType, status, futureRelevance })),
    jobs: workspace.jobDescriptions.filter((job) => job.status !== "archived").map(({ id, title, jobFamily, purpose, responsibilities, outcomes, activities, tools, evidenceSegments }) => ({ id, title, jobFamily, purpose, responsibilities, outcomes, activities, tools, evidenceSegments })),
  };
}

export function startTrendAnalysis(secret: string, payload: { runId: string; workspace: SkillWorkspace; signals: TrendSignal[]; candidates: EmergingSkillCandidate[]; configVersion: string; retryOfRunId?: string }) {
  return call(secret, {
    mode: "skill.trend_scan.start", runId: payload.runId, retryOfRunId: payload.retryOfRunId,
    idempotencyKey: governedIdempotencyKey(payload.retryOfRunId ? "skill.trend_scan.retry" : "skill.trend_scan.start", payload.retryOfRunId || payload.runId),
    sourceCutoffAt: new Date().toISOString(), configVersion: payload.configVersion,
    workspace: governedWorkspaceInput(payload.workspace), baseline: { signals: payload.signals, candidates: payload.candidates },
  }, startUrl(), 20_000);
}

export const getTrendAnalysisStatus = (secret: string, runId: string) => call(secret, { mode: "skill.trend_scan.status", runId }, controlUrl(), 15_000);
export const getTrendAnalysisResult = (secret: string, runId: string) => call(secret, { mode: "skill.trend_scan.result", runId }, controlUrl(), 20_000);
export const interruptTrendAnalysis = (secret: string, runId: string) => call(secret, { mode: "skill.trend_scan.interrupt", runId, idempotencyKey: governedIdempotencyKey("skill.trend_scan.interrupt", runId) }, controlUrl(), 15_000);

