const endpoint = process.env.N8N_SKILL_WEBHOOK_URL || "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-orchestrator-v3-governed";
const secret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
if (!secret) throw new Error("x-n8n-webhook-secret is required.");
const post = async (body) => {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(`Live workflow returned ${response.status}: ${payload.error || "unknown error"}`);
  return payload;
};

const before = await post({ mode: "skill.read" });
const session = before.workspace?.elicitationSessions?.[0];
if (!session) throw new Error("No governed elicitation session is available for the live smoke test.");
const evidenceBefore = JSON.stringify(session.fieldEvidence || {});
const idempotencyKey = `zm03-live-${Date.now()}`;
const request = { mode: "skill.elicitation", action: "validate", sessionId: session.id, workspace: before.workspace, idempotencyKey };
const first = await post(request);
const replay = await post(request);
const afterSession = first.workspace?.elicitationSessions?.find((item) => item.id === session.id);
if (JSON.stringify(afterSession?.fieldEvidence || {}) !== evidenceBefore) throw new Error("Live AI validation changed protected evidence lineage.");
if (!replay.replayed || replay.workspace?.revision !== first.workspace?.revision) throw new Error("Live elicitation idempotency replay did not preserve the revision.");
if (!first.workspace?.objectVersions?.some((item) => item.entityId === session.id && item.action === "elicitation.ai_validate")) throw new Error("Live elicitation validation did not record immutable history.");
const invocations = first.agentRun?.invocations || [];
if (!invocations.length || invocations.some((item) => item.result !== "success" || !item.outputRef?.startsWith("working://agent-tools/"))) throw new Error("Live agent-tool implementations did not return successful opaque output references.");
console.log(`ZM-03/04 live smoke passed at revision ${first.workspace.revision}; ${invocations.length} tool implementations succeeded, evidence was protected and the duplicate request replayed.`);
