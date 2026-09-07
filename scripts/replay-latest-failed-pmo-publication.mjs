const apiKey = process.env.N8N_API_KEY;
const secret = process.env["x-n8n-webhook-secret"];
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
const workflowId = process.env.N8N_PMO_WORKFLOW_ID || "aA9gavf37yDFW6fl";
const webhookUrl = process.env.NEXT_PUBLIC_N8N_PMO_WEBHOOK_URL || `${baseUrl}/webhook/7666d3c6-b63f-4e79-b10a-82a002a9cf47`;
if (!apiKey || !secret) throw new Error("N8N_API_KEY and x-n8n-webhook-secret are required.");

const apiHeaders = { "X-N8N-API-KEY": apiKey };
const api = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, { headers: apiHeaders });
  if (!response.ok) throw new Error(`n8n API ${path} returned ${response.status}.`);
  return response.json();
};
const webhook = async (body) => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`PMO webhook returned non-JSON content (${response.status}).`); }
  if (Array.isArray(payload)) payload = payload[0]?.json ?? payload[0] ?? {};
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `PMO webhook returned ${response.status}.`);
  return payload;
};

const findSaveRequest = (value, seen = new Set()) => {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (value.mode === "pmo.save" && value.document && typeof value.document === "object") return value;
  for (const child of Object.values(value)) {
    const found = findSaveRequest(child, seen);
    if (found) return found;
  }
  return null;
};

const executions = await api(`/api/v1/executions?workflowId=${encodeURIComponent(workflowId)}&status=error&limit=10&includeData=false`);
let failedRequest;
let executionId;
for (const execution of executions.data || []) {
  const detail = await api(`/api/v1/executions/${encodeURIComponent(execution.id)}?includeData=true`);
  const candidate = findSaveRequest(detail.data?.resultData?.runData);
  if (candidate) {
    failedRequest = candidate;
    executionId = execution.id;
    break;
  }
}
if (!failedRequest) throw new Error("No recoverable failed PMO publication was found.");

const current = await webhook({ mode: "pmo.read" });
if (!current.document) throw new Error("Canonical PMO document could not be loaded.");
const attemptedRevision = Number(failedRequest.document.revision);
const currentRevision = Number(current.document.revision);
if (!Number.isInteger(attemptedRevision) || attemptedRevision !== currentRevision) {
  throw new Error(`Replay stopped safely: failed publication revision ${attemptedRevision} no longer matches canonical revision ${currentRevision}.`);
}

const published = await webhook({
  mode: "pmo.save",
  document: failedRequest.document,
  expectedRevision: attemptedRevision,
});
if (!published.ok || Number(published.document?.revision) !== attemptedRevision + 1 || !published.commit?.sha) {
  throw new Error("PMO publication did not return the expected revision and GitHub commit receipt.");
}
const verified = await webhook({ mode: "pmo.read" });
if (!verified.ok || Number(verified.document?.revision) !== attemptedRevision + 1) {
  throw new Error("Published PMO revision could not be verified from canonical storage.");
}
console.log(`Recovered failed execution ${executionId}; PMO revision ${attemptedRevision + 1} is verified with a GitHub commit receipt.`);
