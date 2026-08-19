import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const url = process.env.NEXT_PUBLIC_N8N_SKILL_WEBHOOK_URL || "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-orchestrator-v3-governed";
const secret = process.env.APP_SHARED_SECRET;
if (!url || !secret) throw new Error("N8N_WEBHOOK_URL and APP_SHARED_SECRET are required in .env.local.");

async function call(body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-n8n-webhook-secret": secret },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Webhook returned ${response.status}.`);
  return payload;
}

const loaded = await call({ mode: "skill.read" });
const workspace = loaded.workspace;
const fixtureName = /^(0[1-4]_legacy_|uat\b)/i;
const jobIds = new Set(workspace.jobDescriptions.filter((job) => fixtureName.test(job.title) || job.sourceFiles?.some((file) => fixtureName.test(file.name))).map((job) => job.id));
const mappingIds = new Set(workspace.mappings.filter((mapping) => jobIds.has(mapping.jobDescriptionId)).map((mapping) => mapping.id));
const profileIds = new Set(workspace.profiles.filter((profile) => jobIds.has(profile.jobDescriptionId)).map((profile) => profile.id));
const runIds = new Set(workspace.agentRuns.filter((run) => jobIds.has(run.jobDescriptionId)).map((run) => run.id));

const cleaned = {
  ...workspace,
  jobDescriptions: workspace.jobDescriptions.filter((job) => !jobIds.has(job.id)),
  mappings: workspace.mappings.filter((mapping) => !mappingIds.has(mapping.id)),
  profiles: workspace.profiles.filter((profile) => !profileIds.has(profile.id)),
  jobClarifications: workspace.jobClarifications.filter((session) => !jobIds.has(session.jobDescriptionId)),
  mappingOmissions: workspace.mappingOmissions.filter((item) => !jobIds.has(item.jobDescriptionId)),
  mappingFeedback: workspace.mappingFeedback.filter((item) => !mappingIds.has(item.mappingId)),
  agentRuns: workspace.agentRuns.filter((run) => !runIds.has(run.id)),
  evidenceRecords: workspace.evidenceRecords.filter((record) => !(record.supportedEntityIds || []).some((id) => jobIds.has(id) || mappingIds.has(id) || profileIds.has(id))),
  reviewQueue: workspace.reviewQueue.filter((review) => !mappingIds.has(review.entityId) && !profileIds.has(review.entityId) && !jobIds.has(review.entityId)),
  objectVersions: workspace.objectVersions.filter((version) => !jobIds.has(version.entityId) && !mappingIds.has(version.entityId) && !profileIds.has(version.entityId)),
  auditLog: workspace.auditLog.filter((event) => !jobIds.has(event.entityId) && !mappingIds.has(event.entityId) && !profileIds.has(event.entityId) && !runIds.has(event.entityId)),
};

if (!jobIds.size) {
  console.log("No synthetic UAT job records were present.");
  process.exit(0);
}

const saved = await call({
  mode: "skill.save",
  workspace: cleaned,
  expectedRevision: workspace.revision,
  idempotencyKey: `uat-cleanup-${workspace.revision}-${Date.now()}`,
});

console.log(`Removed ${jobIds.size} UAT job(s), ${mappingIds.size} mapping(s), ${profileIds.size} profile(s), and ${runIds.size} agent run(s); working revision is ${saved.workspace.revision}.`);
