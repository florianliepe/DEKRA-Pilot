import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const apiKey = process.env.N8N_API_KEY;
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
const workflowId = process.env.N8N_PMO_WORKFLOW_ID || "aA9gavf37yDFW6fl";
if (!apiKey) throw new Error("N8N_API_KEY is required.");

const headers = { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" };
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${body.message || body.error || "unknown error"}`);
  return body;
};

const local = JSON.parse(readFileSync(resolve("docs/n8n-pmo-production.workflow.json"), "utf8"));
const desired = local.nodes.find((node) => node.name === "PrepareSave");
if (!desired?.parameters?.jsCode) throw new Error("Local PrepareSave implementation was not found.");

const live = await request(`/api/v1/workflows/${workflowId}`);
const target = live.nodes.find((node) => node.name === "PrepareSave");
if (!target) throw new Error("Live PrepareSave node was not found.");
target.parameters = desired.parameters;

await request(`/api/v1/workflows/${workflowId}`, {
  method: "PUT",
  body: JSON.stringify({
    name: live.name,
    nodes: live.nodes,
    connections: live.connections,
    settings: { executionOrder: live.settings?.executionOrder || "v1" },
  }),
});
if (live.active) {
  await request(`/api/v1/workflows/${workflowId}/deactivate`, { method: "POST", body: "{}" });
  await request(`/api/v1/workflows/${workflowId}/activate`, { method: "POST", body: "{}" });
}

const verified = await request(`/api/v1/workflows/${workflowId}`);
const deployedCode = verified.nodes.find((node) => node.name === "PrepareSave")?.parameters?.jsCode || "";
if (deployedCode !== desired.parameters.jsCode) throw new Error("Live PMO PrepareSave verification failed.");
console.log("Live PMO publisher updated and verified without exposing credentials.");
