const apiKey = process.env.N8N_API_KEY;
const workflowId = process.env.N8N_WORKFLOW_ID;
const mappingWorkflowId = process.env.N8N_MAPPING_WORKFLOW_ID || "YBLQaErerqwNmC97";
const webhookSecret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
const credentialName = "DEKRA Skill Designer Webhook Auth";

if (!apiKey || !workflowId || !webhookSecret) {
  throw new Error("N8N_API_KEY, N8N_WORKFLOW_ID and x-n8n-webhook-secret are required.");
}

const headers = { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" };
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${body.message || body.error || "unknown error"}`);
  }
  return body;
};

const workflow = await request(`/api/v1/workflows/${workflowId}`);
const webhook = workflow.nodes.find((node) => node.type === "n8n-nodes-base.webhook" && node.parameters?.path === "skill-designer-orchestrator-v3-governed");
if (!webhook) throw new Error("The governed Skill Designer webhook node was not found.");
let credential = webhook.credentials?.httpHeaderAuth?.name === credentialName
  ? webhook.credentials.httpHeaderAuth
  : null;
const data = {
  name: "x-n8n-webhook-secret",
  value: webhookSecret,
  allowedHttpRequestDomains: "all",
  allowedDomains: "",
};

if (!credential) {
  const listResponse = await fetch(`${baseUrl}/api/v1/credentials?limit=100`, { headers });
  const listed = listResponse.ok ? await listResponse.json() : { data: [] };
  if (!listResponse.ok && listResponse.status !== 403) {
    throw new Error(`GET /api/v1/credentials failed (${listResponse.status}).`);
  }
  credential = (listed.data || []).find((item) => item.name === credentialName && item.type === "httpHeaderAuth");
}
if (!credential) {
  credential = await request("/api/v1/credentials", {
    method: "POST",
    body: JSON.stringify({ name: credentialName, type: "httpHeaderAuth", data }),
  });
}

if (!credential.id) throw new Error("n8n did not return the dedicated credential ID.");

webhook.credentials = { ...(webhook.credentials || {}), httpHeaderAuth: { id: credential.id, name: credentialName } };

await request(`/api/v1/workflows/${workflowId}`, {
  method: "PUT",
  body: JSON.stringify({
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: { executionOrder: workflow.settings?.executionOrder || "v1" },
  }),
});
await request(`/api/v1/workflows/${workflowId}/deactivate`, { method: "POST", body: "{}" });
await request(`/api/v1/workflows/${workflowId}/activate`, { method: "POST", body: "{}" });

const mappingWorkflow = await request(`/api/v1/workflows/${mappingWorkflowId}`);
const mappingWebhooks = mappingWorkflow.nodes.filter((node) => node.type === "n8n-nodes-base.webhook");
if (mappingWebhooks.length !== 2) throw new Error("The asynchronous mapping runtime must expose exactly two governed webhooks.");
for (const node of mappingWebhooks) {
  node.credentials = { ...(node.credentials || {}), httpHeaderAuth: { id: credential.id, name: credentialName } };
}
await request(`/api/v1/workflows/${mappingWorkflowId}`, {
  method: "PUT",
  body: JSON.stringify({
    name: mappingWorkflow.name,
    nodes: mappingWorkflow.nodes,
    connections: mappingWorkflow.connections,
    settings: { executionOrder: mappingWorkflow.settings?.executionOrder || "v1" },
  }),
});
await request(`/api/v1/workflows/${mappingWorkflowId}/deactivate`, { method: "POST", body: "{}" });
await request(`/api/v1/workflows/${mappingWorkflowId}/activate`, { method: "POST", body: "{}" });

console.log(`Attached dedicated webhook credential ${credentialName} to workflow ${workflowId} and mapping runtime ${mappingWorkflowId}.`);
