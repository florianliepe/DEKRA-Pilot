const apiKey = process.env.N8N_API_KEY;
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
if (!apiKey) throw new Error("N8N_API_KEY is required.");

const headers = { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" };
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${body.message || body.error || "unknown error"}`);
  return body;
};

const sourceId = process.env.N8N_WORKFLOW_ID || "fveyWpcJhgxGLXxZ";
const targets = [
  { id: "aA9gavf37yDFW6fl", path: "7666d3c6-b63f-4e79-b10a-82a002a9cf47", label: "PMO publisher" },
  { id: "d8RFwzlJJHxBv2HI", path: "skill-designer-publisher-v3", label: "Skill release publisher" },
  { id: "g7bV6VDG49KS5SV2", path: "dekra-steerco-v1", label: "SteerCo publisher" },
];

const source = await request(`/api/v1/workflows/${sourceId}`);
const sourceWebhook = source.nodes.find((node) => node.parameters?.path === "skill-designer-orchestrator-v3-governed");
const sharedCredential = sourceWebhook?.credentials?.httpHeaderAuth;
if (!sharedCredential?.id) throw new Error("The active Skill Designer webhook has no shared Header Auth credential.");

for (const target of targets) {
  const workflow = await request(`/api/v1/workflows/${target.id}`);
  const webhook = workflow.nodes.find((node) => node.parameters?.path === target.path);
  if (!webhook) throw new Error(`${target.label} webhook ${target.path} was not found.`);
  webhook.credentials = { ...(webhook.credentials || {}), httpHeaderAuth: sharedCredential };
  await request(`/api/v1/workflows/${target.id}`, {
    method: "PUT",
    body: JSON.stringify({ name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: { executionOrder: workflow.settings?.executionOrder || "v1" } }),
  });
  if (workflow.active) {
    await request(`/api/v1/workflows/${target.id}/deactivate`, { method: "POST", body: "{}" });
    await request(`/api/v1/workflows/${target.id}/activate`, { method: "POST", body: "{}" });
  }
  console.log(`${target.label} now references the shared protected webhook credential (${sharedCredential.id}).`);
}

console.log("Shared webhook authentication synchronized without reading or exposing the secret value.");
