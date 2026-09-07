const base = "https://eraneos-agentic-platform.azurewebsites.net/webhook";
const orchestrator = process.env.N8N_SKILL_WEBHOOK_URL || `${base}/skill-designer-orchestrator-v3-governed`;
const startUrl = `${base}/skill-designer-mapping-async-v1`;
const controlUrl = `${base}/skill-designer-mapping-control-v1`;
const secret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
if (!secret) throw new Error("x-n8n-webhook-secret is required.");
const call = async (url, body) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(`${body.mode} failed: ${payload.error || response.status}`);
  return payload;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseline = (await call(orchestrator, { mode: "skill.read" })).workspace;
const stamp = Date.now();
const jobId = `UAT-ZM15-${stamp}`;
const statements = [
  "Design governed cloud platform foundations that enable reliable and secure product onboarding.",
  "Automate repeatable infrastructure provisioning with reviewed infrastructure-as-code modules.",
  "Resolve complex service incidents and restore platform availability within agreed recovery objectives.",
  "Prioritize competing platform demands and communicate evidence-based trade-offs to accountable stakeholders.",
  "Collaborate with product and security teams to align standards, exceptions and delivery outcomes.",
  "Improve cloud cost transparency and capacity decisions through observable consumption evidence.",
];
const segments = statements.map((quotation, index) => ({ id: `SEG-${jobId}-${index + 1}`, sourceId: `SRC-${jobId}`, sourceName: "zm15-uat.md", section: "Responsibilities", location: `row ${index + 1}`, quotation, normalizedType: "responsibility", normalizedValue: quotation, confidence: 99 }));
let seeded = structuredClone(baseline);
seeded.jobDescriptions.unshift({ id: jobId, title: "ZM-15 Platform Role UAT", jobFamily: "Corporate IT", country: "Germany", language: "English", purpose: "Operate a secure and reliable cloud platform.", sourceText: statements.join("\n"), responsibilities: statements, outcomes: ["Reliable product onboarding", "Recoverable services", "Transparent platform decisions"], activities: [], tools: ["Microsoft Azure", "Terraform"], qualifications: [], context: ["Regulated enterprise"], constraints: ["Governed security and architecture controls"], evidenceSegments: segments, sourceFiles: [{ name: "zm15-uat.md", mediaType: "text/markdown", size: statements.join("\n").length }], intakeFindings: [], status: "analysed", version: 1, updatedAt: new Date().toISOString() });
seeded.jobClarifications.unshift({ id: `CLAR-${jobId}`, jobDescriptionId: jobId, status: "complete", currentQuestion: 0, questions: [], startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), idempotencyKey: `uat-zm15-ready-${stamp}`, sessionVersion: 1, sufficiencyScore: 95, sufficiencyThreshold: 80, canMap: true, stopReason: "threshold_met", contradictions: [] });

try {
  seeded = (await call(orchestrator, { mode: "skill.save", workspace: seeded, expectedRevision: baseline.revision, idempotencyKey: `uat-zm15-seed-${stamp}` })).workspace;
  const runId = `RUN-ZM15-${stamp}`;
  await call(startUrl, { mode: "skill.map_job.start", runId, jobDescriptionId: jobId, workspace: seeded, idempotencyKey: `uat-zm15-map-${stamp}` });
  let status;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await sleep(attempt < 5 ? 2000 : 5000);
    status = await call(controlUrl, { mode: "skill.map_job.status", runId });
    if (["needs_review", "failed", "interrupted", "stale"].includes(status.mappingRun?.status)) break;
  }
  if (status?.mappingRun?.status !== "needs_review") throw new Error(`Run ended as ${status?.mappingRun?.status || "timeout"}: ${status?.mappingRun?.error?.message || "no result"}`);
  const workspace = (await call(controlUrl, { mode: "skill.map_job.result", runId })).workspace;
  const mappings = workspace.mappings.filter((item) => item.jobDescriptionId === jobId && item.status === "proposed");
  const gaps = workspace.reviewQueue.filter((item) => item.type === "new_skill" && item.status === "pending" && item.payload?.jobDescriptionId === jobId);
  const skills = new Map(workspace.skills.map((skill) => [skill.id, skill]));
  const groups = new Map(workspace.groups.map((group) => [group.id, group]));
  const technical = mappings.filter((mapping) => skills.get(mapping.skillId)?.dimension === "technical").length + gaps.filter((gap) => skills.get(gap.entityId)?.dimension === "technical").length;
  const behavioral = mappings.filter((mapping) => skills.get(mapping.skillId)?.dimension === "competency").length + gaps.filter((gap) => skills.get(gap.entityId)?.dimension === "competency").length;
  if (!mappings.length && !gaps.length || mappings.length + gaps.length > 10 || technical > 5 || behavioral > 5 || technical + behavioral !== mappings.length + gaps.length) throw new Error(`Invalid composition: ${technical} technical, ${behavioral} behavioral, ${mappings.length + gaps.length} total.`);
  for (const mapping of mappings) {
    const skill = skills.get(mapping.skillId); const group = groups.get(skill?.groupId); const path = mapping.taxonomyPath;
    if (!path || path.skillId !== skill?.id || path.groupId !== group?.id || path.domainId !== group?.domainId || path.inherited !== true) throw new Error(`Invalid taxonomy path on ${mapping.id}.`);
    if (mapping.classification?.type !== skill?.dimension) throw new Error(`Invalid classification on ${mapping.id}.`);
    if (skill.dimension === "technical" && (mapping.primaryKflaCompetencyId || mapping.secondaryKflaCompetencyIds?.length)) throw new Error(`Technical mapping ${mapping.id} carries KFLA links.`);
    if (skill.dimension === "competency" && !mapping.primaryKflaCompetencyId) throw new Error(`Behavioral mapping ${mapping.id} lacks a primary KFLA link.`);
  }
  for (const gap of gaps) {
    const placement = gap.payload?.taxonomyPlacement;
    if (!placement?.domainId || !placement?.groupId || !placement?.rationale) throw new Error(`Taxonomy gap ${gap.id} lacks governed placement evidence.`);
  }
  const weight = mappings.reduce((sum, item) => sum + Number(item.weight || 0), 0) + gaps.reduce((sum, item) => sum + Number(item.payload?.profileWeight || 0), 0);
  if (Math.round(weight) !== 100) throw new Error(`Profile weight is ${weight}, not 100.`);
  if (mappings.some((item) => item.status !== "proposed")) throw new Error("The UAT crossed the human approval boundary.");
  console.log(`ZM-15 live UAT passed: ${technical} technical, ${behavioral} behavioral, ${mappings.length + gaps.length} total, 100% weight, taxonomy/KFLA contracts valid, stopped at needs_review.`);
} finally {
  const latest = (await call(orchestrator, { mode: "skill.read" })).workspace;
  await call(orchestrator, { mode: "skill.save", workspace: { ...baseline, revision: latest.revision }, expectedRevision: latest.revision, idempotencyKey: `uat-zm15-cleanup-${stamp}` });
}
