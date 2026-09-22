import { readFileSync } from "node:fs";
import { applyZm16Contract } from "./zm16-agent-contract.mjs";

const apiKey = process.env.N8N_API_KEY;
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
const workflowId = process.env.N8N_WORKFLOW_ID;
if (!apiKey || !workflowId) throw new Error("N8N_API_KEY and N8N_WORKFLOW_ID are required.");
const headers = { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" };
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}; no response body printed.`);
  return body;
};

const local = JSON.parse(readFileSync("docs/n8n-skill-designer-v3.workflow.json", "utf8"));
const live = await request(`/api/v1/workflows/${workflowId}`);
const workingBefore = live.staticData?.global?.workspace;
if (!live.active || live.nodes.length !== local.nodes.length) throw new Error("Live workflow shape or active state differs from the reviewed baseline.");
for (const name of ["Governed Skill Design Agent", "Governance Gate and v3 Store"]) {
  const a = local.nodes.find((node) => node.name === name);
  const b = live.nodes.find((node) => node.name === name);
  if (!a || !b || JSON.stringify(a.parameters) !== JSON.stringify(b.parameters)) {
    const alreadyPatched = name === "Governed Skill Design Agent"
      ? b?.parameters?.options?.systemMessage?.includes("ZM-16 DEKRA JOB-FIRST DESIGN CONTRACT")
      : b?.parameters?.jsCode?.includes("capabilityType:item.dimension==='technical'");
    if (!alreadyPatched)
      throw new Error(`${name} has drifted from the reviewed baseline; refusing overwrite.`);
  }
}
const running = await request(`/api/v1/executions?workflowId=${encodeURIComponent(workflowId)}&limit=20&includeData=false`);
if (running.data?.some((run) => run.status === "running" || run.status === "waiting")) throw new Error("Workflow has an active execution; retry after it finishes.");
applyZm16Contract(live);
if (process.argv.includes("--check")) {
  console.log("ZM-16 live workflow contract is compatible; no changes made.");
} else {
  await request(`/api/v1/workflows/${workflowId}`, {
    method: "PUT",
    body: JSON.stringify({ name: live.name, nodes: live.nodes, connections: live.connections, settings: { executionOrder: live.settings?.executionOrder || "v1" }, staticData: live.staticData }),
  });
  const verified = await request(`/api/v1/workflows/${workflowId}`);
  const workingAfter = verified.staticData?.global?.workspace;
  if (JSON.stringify(workingBefore) !== JSON.stringify(workingAfter)) throw new Error("Workflow update altered working data; stop and restore the pre-update snapshot before proceeding.");
  const agent = verified.nodes.find((node) => node.name === "Governed Skill Design Agent");
  const gate = verified.nodes.find((node) => node.name === "Governance Gate and v3 Store");
  if (!verified.active || !agent?.parameters?.options?.systemMessage?.includes("ZM-16 DEKRA JOB-FIRST DESIGN CONTRACT") || !gate?.parameters?.jsCode?.includes("capabilityType:item.dimension==='technical'")) {
    throw new Error("Post-update verification failed; inspect the live workflow before further action.");
  }
  console.log("ZM-16 agent and draft-persistence contract updated and verified; workflow remains active.");
}
