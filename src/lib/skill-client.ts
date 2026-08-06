import { extractEvidence } from "./n8n-client";
import type { SkillWorkspace } from "./skill-schema";

const DEFAULT_SKILL_WEBHOOK_URL =
  "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-orchestrator";

export type SkillWorkflowResponse = {
  ok?: boolean;
  error?: string;
  workspace?: SkillWorkspace;
  proposals?: SkillWorkspace["reviewQueue"];
  interview?: SkillWorkspace["interviews"][number];
  message?: string;
};

function url() {
  return process.env.NEXT_PUBLIC_N8N_SKILL_WEBHOOK_URL?.trim() || DEFAULT_SKILL_WEBHOOK_URL;
}

function unwrap(raw: unknown): SkillWorkflowResponse {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && "json" in first) return (first as { json: SkillWorkflowResponse }).json;
    return (first || {}) as SkillWorkflowResponse;
  }
  return (raw || {}) as SkillWorkflowResponse;
}

async function call(secret: string, body: unknown) {
  const response = await fetch(url(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret.trim() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const raw = (response.headers.get("content-type") || "").includes("application/json") ? await response.json() : await response.text();
  const payload = unwrap(raw);
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Skill workflow returned HTTP ${response.status}.`);
  return payload;
}

export const loadSkillWorkspace = (secret: string) => call(secret, { mode: "skill.read" });
export const saveSkillWorkspace = (secret: string, workspace: SkillWorkspace) => call(secret, { mode: "skill.save", workspace });

export async function ingestSkillEvidence(secret: string, files: File[], brief: string, roleTitle: string) {
  const extracted = await extractEvidence(files);
  if (brief.trim()) extracted.unshift({ name: "skill-brief.md", type: "text_update", content: brief.trim() });
  if (!extracted.length) throw new Error("Add at least one document or written role brief.");
  return call(secret, { mode: "skill.ingest", roleTitle, extracted });
}

export const runSkillInterview = (secret: string, payload: Record<string, unknown>) => call(secret, { mode: "skill.interview", ...payload });
