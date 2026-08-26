import { readFileSync } from "node:fs";

const apiKey = process.env.N8N_API_KEY;
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
const workflowId = process.env.N8N_WORKFLOW_ID || "etuCxjr2u5bPYqP2";
if (!apiKey) throw new Error("N8N_API_KEY is required.");

const local = JSON.parse(readFileSync("docs/n8n-skill-designer-v3.workflow.json", "utf8"));
const headers = { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" };
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${body.message || body.error || "unknown error"}`);
  return body;
};

const live = await request(`/api/v1/workflows/${workflowId}`);
const parameterMappings = [
  { liveNames: ["Request Governor v3", "Request Governor"], localName: "Request Governor v3" },
  { liveNames: ["Build Governed Agent Context", "Build Agent Context"], localName: "Build Governed Agent Context" },
  { liveNames: ["Governed Skill Design Agent", "Skill Design Agent"], localName: "Governed Skill Design Agent" },
  { liveNames: ["Deterministic Tool Policy Executor", "Controlled Tool Executor"], localName: "Deterministic Tool Policy Executor" },
  { liveNames: ["Governance Gate and v3 Store", "Governance Gate & Store"], localName: "Governance Gate and v3 Store" },
];
for (const { liveNames, localName } of parameterMappings) {
  const liveNode = live.nodes.find((item) => liveNames.includes(item.name));
  const localNode = local.nodes.find((item) => item.name === localName);
  if (!liveNode || !localNode) throw new Error(`Unable to map ${liveNames.join(" or ")} to ${localName}.`);
  let serializedParameters = JSON.stringify(localNode.parameters);
  for (const mapping of parameterMappings) {
    const targetName = live.nodes.find((item) => mapping.liveNames.includes(item.name))?.name || mapping.localName;
    serializedParameters = serializedParameters.replaceAll(mapping.localName, targetName);
  }
  liveNode.parameters = JSON.parse(serializedParameters);
}

await request(`/api/v1/workflows/${workflowId}`, {
  method: "PUT",
  body: JSON.stringify({ name: live.name, nodes: live.nodes, connections: live.connections, settings: { executionOrder: live.settings?.executionOrder || "v1" } }),
});
await request(`/api/v1/workflows/${workflowId}/deactivate`, { method: "POST", body: "{}" });
await request(`/api/v1/workflows/${workflowId}/activate`, { method: "POST", body: "{}" });
console.log(`Updated and reactivated workflow ${workflowId}; ${parameterMappings.length} governed nodes synchronized.`);
