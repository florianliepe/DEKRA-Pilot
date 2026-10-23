import { readFileSync } from "node:fs";

const apiKey = process.env.N8N_API_KEY;
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
if (!apiKey) throw new Error("N8N_API_KEY is required.");
const headers = { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" };
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, signal: AbortSignal.timeout(45000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}; response content intentionally suppressed.`);
  return body;
};

const local = JSON.parse(readFileSync("docs/n8n-zm19-emerging-skills-runtime.workflow.json", "utf8"));
const list = await request("/api/v1/workflows?limit=100");
const matches = (list.data || []).filter((item) => item.name === local.name);
if (matches.length > 1) throw new Error("More than one live ZM-19 runtime exists; refusing to choose automatically.");
let workflowId = process.env.N8N_TREND_WORKFLOW_ID || matches[0]?.id;
const payload = { name: local.name, nodes: local.nodes, connections: local.connections, settings: local.settings };
if (workflowId) {
  const current = await request(`/api/v1/workflows/${workflowId}`);
  const executions = await request(`/api/v1/executions?workflowId=${encodeURIComponent(workflowId)}&limit=20&includeData=false`);
  if (executions.data?.some((item) => item.status === "running" || item.status === "waiting")) throw new Error("The live trend runtime has an active execution; retry after it reaches a terminal state.");
  await request(`/api/v1/workflows/${workflowId}`, { method: "PUT", body: JSON.stringify(payload) });
  if (current.active) await request(`/api/v1/workflows/${workflowId}/deactivate`, { method: "POST", body: "{}" });
} else {
  const created = await request("/api/v1/workflows", { method: "POST", body: JSON.stringify(payload) });
  workflowId = created.id;
}
await request(`/api/v1/workflows/${workflowId}/activate`, { method: "POST", body: "{}" });
const verified = await request(`/api/v1/workflows/${workflowId}`);
const start = verified.nodes.find((node) => node.name === "Trend Radar Start API");
const control = verified.nodes.find((node) => node.name === "Trend Radar Control API");
const terminal = verified.nodes.find((node) => node.name === "Persist Terminal Trend Run");
if (!verified.active || start?.parameters?.path !== "skill-designer-trend-radar-async-v1" || control?.parameters?.path !== "skill-designer-trend-radar-control-v1" || !terminal) throw new Error("Live ZM-19 post-deployment verification failed.");
console.log(`ZM-19 trend runtime ${workflowId} is active and verified.`);
