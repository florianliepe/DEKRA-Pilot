const apiKey = process.env.N8N_API_KEY;
const workflowId = process.env.N8N_MAPPING_WORKFLOW_ID || "YBLQaErerqwNmC97";
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
if (!apiKey) throw new Error("N8N_API_KEY is required.");

const headers = { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" };
const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${body.message || body.error || "unknown error"}`);
  return body;
};

const workflow = await request(`/api/v1/workflows/${workflowId}`);
const upserts = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.dataTable" && node.parameters?.operation === "upsert");
if (!upserts.length) throw new Error("No mapping runtime Data Table upserts were found.");
for (const node of upserts) {
  node.parameters.columns = { ...node.parameters.columns, matchingColumns: ["runId"] };
}

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

console.log(`Repaired ${upserts.length} mapping-runtime upserts to match by runId in workflow ${workflowId}.`);
