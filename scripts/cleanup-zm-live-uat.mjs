const endpoint = process.env.N8N_SKILL_WEBHOOK_URL || "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-orchestrator-v3-governed";
const secret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
if (!secret) throw new Error("x-n8n-webhook-secret is required.");

const call = async (body) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Webhook returned ${response.status}.`);
  return payload;
};

const workspace = (await call({ mode: "skill.read" })).workspace;
const jobIds = new Set((workspace.jobDescriptions || []).filter((job) => /^UAT-ZM\d+-/.test(job.id)).map((job) => job.id));
if (!jobIds.size) {
  console.log("No ZM UAT job records were present.");
  process.exit(0);
}

const mappingIds = new Set((workspace.mappings || []).filter((item) => jobIds.has(item.jobDescriptionId)).map((item) => item.id));
const profileIds = new Set((workspace.profiles || []).filter((item) => jobIds.has(item.jobDescriptionId)).map((item) => item.id));
const runIds = new Set((workspace.agentRuns || []).filter((item) => jobIds.has(item.jobDescriptionId)).map((item) => item.id));
const reviewIds = new Set((workspace.reviewQueue || []).filter((item) => jobIds.has(item.payload?.jobDescriptionId)).map((item) => item.id));
const draftSkillIds = new Set((workspace.reviewQueue || []).filter((item) => reviewIds.has(item.id) && item.type === "new_skill").map((item) => item.entityId));
const linked = (id) => jobIds.has(id) || mappingIds.has(id) || profileIds.has(id) || runIds.has(id) || draftSkillIds.has(id);

const cleaned = {
  ...workspace,
  jobDescriptions: (workspace.jobDescriptions || []).filter((item) => !jobIds.has(item.id)),
  jobClarifications: (workspace.jobClarifications || []).filter((item) => !jobIds.has(item.jobDescriptionId)),
  mappings: (workspace.mappings || []).filter((item) => !mappingIds.has(item.id)),
  mappingOmissions: (workspace.mappingOmissions || []).filter((item) => !jobIds.has(item.jobDescriptionId)),
  mappingFeedback: (workspace.mappingFeedback || []).filter((item) => !mappingIds.has(item.mappingId)),
  profiles: (workspace.profiles || []).filter((item) => !profileIds.has(item.id)),
  agentRuns: (workspace.agentRuns || []).filter((item) => !runIds.has(item.id)),
  skills: (workspace.skills || []).filter((item) => !draftSkillIds.has(item.id)),
  reviewQueue: (workspace.reviewQueue || []).filter((item) => !reviewIds.has(item.id) && !linked(item.entityId)),
  evidenceRecords: (workspace.evidenceRecords || []).filter((item) => !(item.supportedEntityIds || []).some(linked)),
  objectVersions: (workspace.objectVersions || []).filter((item) => !linked(item.entityId)),
  auditLog: (workspace.auditLog || []).filter((item) => !linked(item.entityId)),
};

const saved = await call({
  mode: "skill.save",
  workspace: cleaned,
  expectedRevision: workspace.revision,
  idempotencyKey: `uat-zm-cleanup-${workspace.revision}-${Date.now()}`,
});
console.log(`Removed ${jobIds.size} ZM UAT job(s) and linked draft artifacts; working revision is ${saved.workspace.revision}.`);
