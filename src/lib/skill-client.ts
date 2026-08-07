import { extractEvidence } from "./n8n-client";
import type { ReleaseManifest, SkillWorkspace } from "./skill-schema";

const DEFAULT_SKILL_WEBHOOK_URL =
  "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-orchestrator-v3";

export type SkillWorkflowResponse = {
  ok?: boolean;
  error?: string;
  workspace?: SkillWorkspace;
  manifest?: ReleaseManifest;
  commit?: string;
  findings?: Array<{ ruleId?: string; explanation?: string; blocking?: boolean }>;
  recovery?: { idempotencyKey?: string; expectedPreviousRevision?: number };
  proposals?: SkillWorkspace["reviewQueue"];
  interview?: SkillWorkspace["interviews"][number];
  message?: string;
  agentRun?: SkillWorkspace["agentRuns"][number];
};

export class SkillWorkflowError extends Error {
  status: number;
  payload: SkillWorkflowResponse;

  constructor(message: string, status: number, payload: SkillWorkflowResponse) {
    super(message);
    this.name = "SkillWorkflowError";
    this.status = status;
    this.payload = payload;
  }
}

function url() {
  return process.env.NEXT_PUBLIC_N8N_SKILL_WEBHOOK_URL?.trim() || DEFAULT_SKILL_WEBHOOK_URL;
}
function publishUrl() {
  return process.env.NEXT_PUBLIC_N8N_SKILL_PUBLISH_WEBHOOK_URL?.trim() ||
    "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-publisher-v3";
}

function unwrap(raw: unknown): SkillWorkflowResponse {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && "json" in first) return (first as { json: SkillWorkflowResponse }).json;
    return (first || {}) as SkillWorkflowResponse;
  }
  return (raw || {}) as SkillWorkflowResponse;
}

async function call(secret: string, body: unknown, endpoint = url()) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret.trim() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const raw = (response.headers.get("content-type") || "").includes("application/json") ? await response.json() : await response.text();
  const payload = unwrap(raw);
  if (!response.ok || payload.ok === false) throw new SkillWorkflowError(payload.error || `Skill workflow returned HTTP ${response.status}.`, response.status, payload);
  return payload;
}

const APPROVED_WORKSPACE_URL = "https://api.github.com/repos/florianliepe/DEKRA-Pilot/contents/data/skill-workspace.approved.json?ref=main";

export async function loadApprovedSkillWorkspace(): Promise<SkillWorkspace> {
  const response = await fetch(`${APPROVED_WORKSPACE_URL}&t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Approved GitHub snapshot returned HTTP ${response.status}.`);
  const envelope = await response.json() as { content?: string; encoding?: string; sha?: string };
  if (envelope.encoding !== "base64" || !envelope.content || !envelope.sha) throw new Error("Approved GitHub snapshot did not include a verifiable blob SHA.");
  const decoded = atob(envelope.content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  const workspace = JSON.parse(new TextDecoder().decode(bytes)) as SkillWorkspace;
  return { ...workspace, publication: { ...workspace.publication, expectedGitHubSha: envelope.sha } };
}

export const loadSkillWorkspace = (secret: string) => call(secret, { mode: "skill.read" });
export const saveSkillWorkspace = (secret: string, workspace: SkillWorkspace) => call(secret, { mode: "skill.save", workspace: { ...workspace, schemaVersion: 3 } });
export const publishSkillWorkspace = (secret: string, workspace: SkillWorkspace, approvedBy: string, manifest?: ReleaseManifest) => call(secret, { mode: "skill.publish", workspace, approvedBy, manifest, expectedPreviousRevision: workspace.publication.revision, expectedGitHubSha: manifest?.expectedGitHubSha || workspace.publication.expectedGitHubSha }, publishUrl());

export async function ingestSkillEvidence(secret: string, files: File[], brief: string, roleTitle: string) {
  const extracted = await extractEvidence(files);
  if (brief.trim()) extracted.unshift({ name: "skill-brief.md", type: "text_update", content: brief.trim() });
  if (!extracted.length) throw new Error("Add at least one document or written role brief.");
  return call(secret, { mode: "skill.ingest", roleTitle, extracted });
}

export const runSkillInterview = (secret: string, payload: Record<string, unknown>) => call(secret, { mode: "skill.interview", ...payload });
export const runJobMapping = (secret: string, jobDescriptionId: string, workspace: SkillWorkspace) =>
  call(secret, { mode: "skill.map_job", jobDescriptionId, workspace });
export const runTaxonomyRegression = (secret: string, workspace: SkillWorkspace) =>
  call(secret, { mode: "skill.regression", workspace });
export const runSkillElicitation = (secret: string, sessionId: string, action: "rewrite" | "validate", workspace: SkillWorkspace) =>
  call(secret, { mode: "skill.elicitation", sessionId, action, workspace });
