import { readFileSync } from "node:fs";

const url = process.env.N8N_SKILL_WEBHOOK_URL || "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-orchestrator-v3-governed";
const secret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
if (!url || !secret) throw new Error("N8N_WEBHOOK_URL and x-n8n-webhook-secret are required.");
const headers = { "Content-Type": "application/json", "x-n8n-webhook-secret": secret };
const call = async (body) => {
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Workflow request failed (${response.status}).`);
  return payload;
};

const governed = await call({ mode: "skill.read" });
if (!governed.workspace) throw new Error("The live workflow returned no working state.");
const registry = JSON.parse(readFileSync("data/agent-tool-registry.json", "utf8")).tools;
const required = new Set(["taxonomy_hierarchy_resolver", "skill_type_classifier", "kfla_relationship_mapper", "profile_composition_validator"]);
const additions = registry.filter((tool) => required.has(tool.id) && !governed.workspace.agentTools?.some((existing) => existing.id === tool.id));
if (!additions.length) {
  console.log("Live ZM-15 tool registry is already synchronized.");
  process.exit(0);
}
const workspace = { ...governed.workspace, agentTools: [...(governed.workspace.agentTools || []), ...additions] };
await call({ mode: "skill.save", workspace, expectedRevision: governed.workspace.revision, idempotencyKey: `zm15-registry-${governed.workspace.revision}` });
console.log(`Synchronized ${additions.length} ZM-15 mapping tool contracts to the n8n working state; no approval or publication performed.`);
