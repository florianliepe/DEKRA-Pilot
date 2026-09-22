const base = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
const orchestrator = process.env.N8N_SKILL_WEBHOOK_URL || `${base}/webhook/skill-designer-orchestrator-v3-governed`;
const startUrl = process.env.N8N_SKILL_MAPPING_START_URL || `${base}/webhook/skill-designer-mapping-async-v1`;
const controlUrl = process.env.N8N_SKILL_MAPPING_CONTROL_URL || `${base}/webhook/skill-designer-mapping-control-v1`;
const secret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
if (!secret) throw new Error("A shared webhook secret is required.");
const headers = { "Content-Type": "application/json", "x-n8n-webhook-secret": secret };
async function call(url, body, timeoutMs = 90000) {
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(`${body.mode} returned HTTP ${response.status}: ${String(payload.error || "unspecified").slice(0, 220)}`);
  return payload;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = Date.now();
const jobId = `UAT-ZM17-${stamp}`;
const runId = `RUN-ZM17-${stamp}`;
const groupIds = new Set(["UAT-ZM17-GRP-CLOUD", "UAT-ZM17-GRP-RELIABILITY", "UAT-ZM17-GRP-COLLAB"]);
const baseline = (await call(orchestrator, { mode: "skill.read" })).workspace;
if (!baseline || baseline.jobDescriptions.some((item) => item.id.startsWith("UAT-ZM17-")) || baseline.groups.some((item) => groupIds.has(item.id))) throw new Error("The working state already contains ZM-17 fixtures.");
const sourceStatements = [
  "Design governed Azure landing zones that enable secure and reliable product onboarding.",
  "Automate repeatable infrastructure provisioning through reviewed infrastructure-as-code modules.",
  "Restore platform services after complex incidents within agreed recovery objectives.",
  "Use cloud-consumption evidence to explain cost and capacity trade-offs to accountable stakeholders.",
  "Coordinate product and security teams to resolve exceptions and deliver agreed outcomes.",
  "Adapt communication to build commitment across technical and business audiences.",
];
const sourceText = sourceStatements.join("\n");
const evidenceSegments = sourceStatements.map((quotation, index) => ({ id: `SEG-${jobId}-${index + 1}`, sourceId: `SRC-${jobId}`, sourceName: "zm17-cloud-platform-role.txt", section: "Responsibilities", location: `line ${index + 1}`, quotation, normalizedType: "responsibility", normalizedValue: quotation, confidence: 99 }));
const seeded = structuredClone(baseline);
seeded.groups.push(
  { id: "UAT-ZM17-GRP-CLOUD", domainId: "DOM-DT", name: "UAT · Cloud Platform Engineering", description: "Temporary group for isolated platform-engineering UAT only.", status: "approved" },
  { id: "UAT-ZM17-GRP-RELIABILITY", domainId: "DOM-DT", name: "UAT · Service Reliability", description: "Temporary group for isolated reliability UAT only.", status: "approved" },
  { id: "UAT-ZM17-GRP-COLLAB", domainId: "DOM-PC", name: "UAT · Collaboration & Stakeholder Alignment", description: "Temporary group for isolated behavioral UAT only.", status: "approved" },
);
seeded.jobDescriptions.unshift({ id: jobId, title: "ZM-17 Cloud Platform Role UAT", jobFamily: "Corporate IT", country: "Germany", language: "English", purpose: "Operate a secure, reliable and economical cloud platform.", sourceText, responsibilities: sourceStatements, outcomes: ["Secure product onboarding", "Recoverable platform services", "Transparent platform decisions"], activities: [], tools: ["Microsoft Azure", "Terraform"], qualifications: [], context: ["Regulated enterprise"], constraints: ["Governed security and architecture controls"], evidenceSegments, sourceFiles: [{ name: "zm17-cloud-platform-role.txt", mediaType: "text/plain", size: Buffer.byteLength(sourceText) }], intakeFindings: [], status: "analysed", version: 1, updatedAt: new Date().toISOString() });
seeded.jobClarifications.unshift({ id: `CLAR-${jobId}`, jobDescriptionId: jobId, status: "complete", currentQuestion: 0, questions: [], startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), idempotencyKey: `uat-zm17-ready-${stamp}`, sessionVersion: 1, sufficiencyScore: 95, sufficiencyThreshold: 80, canMap: true, stopReason: "threshold_met", contradictions: [] });
let seededRevision;
try {
  const saved = await call(orchestrator, { mode: "skill.save", workspace: seeded, expectedRevision: baseline.revision, idempotencyKey: `uat-zm17-seed-${stamp}` });
  seededRevision = saved.workspace.revision;
  console.log(`ZM-17 fixture seeded at working revision ${seededRevision}; async run ${runId} starting.`);
  await call(startUrl, { mode: "skill.map_job.start", runId, jobDescriptionId: jobId, workspace: saved.workspace, idempotencyKey: `uat-zm17-map-${stamp}` }, 30000);
  let status;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(attempt < 6 ? 3000 : 6000);
    status = await call(controlUrl, { mode: "skill.map_job.status", runId }, 30000);
    const state = status.mappingRun?.status;
    if (attempt % 5 === 0) console.log(`ZM-17 mapping status: ${state || "unknown"}; ${status.mappingRun?.progress ?? 0}%.`);
    if (["needs_review", "completed", "failed", "interrupted", "stale"].includes(state)) break;
  }
  if (!["needs_review", "completed"].includes(status?.mappingRun?.status)) throw new Error(`Async mapping ended as ${status?.mappingRun?.status || "timeout"}: ${status?.mappingRun?.error?.message || "no result"}`);
  const result = await call(controlUrl, { mode: "skill.map_job.result", runId }, 30000);
  const workspace = result.workspace;
  if (!workspace) throw new Error("Async result did not include a workspace.");
  const job = workspace.jobDescriptions.find((item) => item.id === jobId);
  if (!job || job.sourceText !== sourceText) throw new Error("The immutable job-description source changed during mapping.");
  const mappings = workspace.mappings.filter((item) => item.jobDescriptionId === jobId && item.status === "proposed");
  const gaps = workspace.reviewQueue.filter((item) => item.type === "new_skill" && item.status === "pending" && item.payload?.jobDescriptionId === jobId);
  const skills = new Map(workspace.skills.map((item) => [item.id, item]));
  const groups = new Map(workspace.groups.map((item) => [item.id, item]));
  const technicalMappings = mappings.filter((item) => skills.get(item.skillId)?.dimension === "technical");
  const behavioralMappings = mappings.filter((item) => skills.get(item.skillId)?.dimension === "competency");
  const technicalGaps = gaps.filter((item) => skills.get(item.entityId)?.dimension === "technical");
  const behavioralGaps = gaps.filter((item) => skills.get(item.entityId)?.dimension === "competency");
  const technical = technicalMappings.length + technicalGaps.length;
  const behavioral = behavioralMappings.length + behavioralGaps.length;
  if (!technical && !behavioral || technical > 5 || behavioral > 5 || technical + behavioral > 10) throw new Error(`Invalid composition: ${technical} technical, ${behavioral} behavioral.`);
  if (technicalGaps.some((item) => !["hard", "technical", "functional", "interface"].includes(skills.get(item.entityId)?.capabilityType))) throw new Error("A technical draft lacks its governed subtype.");
  if (behavioralGaps.some((item) => !skills.get(item.entityId)?.kflaCompetencyId)) throw new Error("A behavioral draft lacks its KFLA allocation.");
  if (mappings.some((item) => !item.evidenceRefs?.length) || gaps.some((item) => !item.payload?.evidenceRefs?.length)) throw new Error("A proposal lacks source evidence.");
  for (const item of gaps) {
    const placement = item.payload?.taxonomyPlacement;
    const group = groups.get(placement?.groupId);
    if (!placement?.domainId || !group || group.domainId !== placement.domainId || !groupIds.has(group.id)) throw new Error(`Draft ${item.entityId} does not resolve through a temporary UAT group.`);
  }
  const weight = mappings.reduce((sum, item) => sum + Number(item.weight || 0), 0) + gaps.reduce((sum, item) => sum + Number(item.payload?.profileWeight || 0), 0);
  if (Math.round(weight) !== 100) throw new Error(`Profile weight is ${weight}, not 100.`);
  if (mappings.some((item) => item.status !== "proposed") || gaps.some((item) => item.status !== "pending")) throw new Error("The run crossed the human approval boundary.");
  if (workspace.publication?.state === "approved_release" && workspace.publication?.revision !== baseline.publication?.revision) throw new Error("The run changed publication state.");
  console.log(JSON.stringify({ status: "passed", runStatus: status.mappingRun.status, technical, behavioral, total: technical + behavioral, approvedMappings: mappings.length, draftGaps: gaps.length, weight, sourceUnchanged: true, temporaryGroupsResolved: gaps.length, approval: "not performed", publication: "not performed" }));
} finally {
  const latest = (await call(orchestrator, { mode: "skill.read" })).workspace;
  const unrelated = latest.jobDescriptions.filter((item) => item.id !== jobId).map((item) => item.id).sort().join("|") !== baseline.jobDescriptions.map((item) => item.id).sort().join("|")
    || latest.groups.filter((item) => !groupIds.has(item.id)).map((item) => item.id).sort().join("|") !== baseline.groups.map((item) => item.id).sort().join("|");
  if (unrelated) throw new Error("Concurrent non-UAT structural changes detected; cleanup was stopped to avoid overwriting them.");
  const restored = await call(orchestrator, { mode: "skill.save", workspace: { ...baseline, revision: latest.revision }, expectedRevision: latest.revision, idempotencyKey: `uat-zm17-cleanup-${stamp}` });
  if (restored.workspace.jobDescriptions.some((item) => item.id.startsWith("UAT-ZM17-")) || restored.workspace.groups.some((item) => groupIds.has(item.id))) throw new Error("ZM-17 cleanup did not remove all fixtures.");
  console.log(`ZM-17 cleanup complete at revision ${restored.workspace.revision}; ${restored.workspace.jobDescriptions.length} original jobs and ${restored.workspace.reviewQueue.filter((item) => item.status === "pending").length} pending reviews remain.`);
}
