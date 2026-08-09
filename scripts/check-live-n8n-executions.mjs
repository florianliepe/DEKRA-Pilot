const apiKey = process.env.N8N_API_KEY;
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
const workflowId = process.env.N8N_WORKFLOW_ID || "etuCxjr2u5bPYqP2";
if (!apiKey) throw new Error("N8N_API_KEY is required.");
const response = await fetch(`${baseUrl}/api/v1/executions?workflowId=${encodeURIComponent(workflowId)}&limit=5&includeData=false`, { headers: { "X-N8N-API-KEY": apiKey } });
if (!response.ok) throw new Error(`Execution lookup returned ${response.status}.`);
const payload = await response.json();
console.log((payload.data || []).map(({ id, status, startedAt, stoppedAt }) => ({ id, status, startedAt, stoppedAt })));
if (process.env.N8N_EXECUTION_ID) {
  const detailResponse = await fetch(`${baseUrl}/api/v1/executions/${encodeURIComponent(process.env.N8N_EXECUTION_ID)}?includeData=true`, { headers: { "X-N8N-API-KEY": apiKey } });
  if (!detailResponse.ok) throw new Error(`Execution detail lookup returned ${detailResponse.status}.`);
  const detail = await detailResponse.json();
  const error = detail.data?.resultData?.error;
  console.log({ id: detail.id, status: detail.status, lastNodeExecuted: detail.data?.resultData?.lastNodeExecuted, error: error ? { name: error.name, message: error.message, description: error.description } : undefined });
}
