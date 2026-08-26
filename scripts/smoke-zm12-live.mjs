const base = "https://eraneos-agentic-platform.azurewebsites.net/webhook";
const orchestrator = process.env.N8N_SKILL_WEBHOOK_URL || `${base}/skill-designer-orchestrator-v3-governed`;
const startUrl = `${base}/skill-designer-mapping-async-v1`;
const controlUrl = `${base}/skill-designer-mapping-control-v1`;
const secret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
if (!secret) throw new Error("x-n8n-webhook-secret is required.");
const call = async (url, body) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(`${body.mode} failed: ${payload.error || response.status}`);
  return payload;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseline = (await call(orchestrator, { mode: "skill.read" })).workspace;
const stamp = Date.now();
const jobId = `UAT-ZM12-${stamp}`;
const segmentId = `SEG-${jobId}-01`;
let seededWorkspace = structuredClone(baseline);
seededWorkspace.jobDescriptions.unshift({
  id: jobId, title: "Explainable Reporting Analyst UAT", jobFamily: "Finance", country: "Global", language: "English",
  purpose: "Turn operational data into decision-ready management insight.", sourceText: "Build interactive dashboards to report weekly revenue metrics and explain material movements to senior stakeholders.",
  responsibilities: ["Build interactive dashboards to report weekly revenue metrics."], outcomes: ["Decision-ready management insight."], activities: ["Analyse material movements."],
  tools: ["Power BI"], qualifications: [], context: ["Global weekly reporting"], constraints: ["Trusted definitions"],
  evidenceSegments: [{ id: segmentId, sourceId: `SRC-${jobId}`, sourceName: "zm12-uat.md", section: "Responsibilities", location: "responsibility 1", quotation: "Build interactive dashboards to report weekly revenue metrics.", normalizedType: "responsibility", normalizedValue: "Build interactive dashboards for weekly revenue reporting.", confidence: 99 }],
  sourceFiles: [{ name: "zm12-uat.md", mediaType: "text/markdown", size: 190, contentHash: `synthetic-${stamp}` }], intakeFindings: [], status: "analysed", version: 1, updatedAt: new Date().toISOString(),
});
seededWorkspace.jobClarifications.unshift({ id: `CLAR-${jobId}`, jobDescriptionId: jobId, status: "complete", currentQuestion: 0, questions: [], startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), idempotencyKey: `uat-zm12-ready-${stamp}`, sessionVersion: 1, sufficiencyScore: 90, sufficiencyThreshold: 80, canMap: true, stopReason: "threshold_met", contradictions: [] });
try {
  const seeded = await call(orchestrator, { mode: "skill.save", workspace: seededWorkspace, expectedRevision: baseline.revision, idempotencyKey: `uat-zm12-seed-${stamp}` });
  seededWorkspace = seeded.workspace;
  const runId = `RUN-ZM12-${stamp}`;
  await call(startUrl, { mode: "skill.map_job.start", runId, jobDescriptionId: jobId, workspace: seededWorkspace, idempotencyKey: `uat-zm12-map-${stamp}` });
  let status;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(attempt < 5 ? 2000 : 5000);
    status = await call(controlUrl, { mode: "skill.map_job.status", runId });
    if (["needs_review", "failed", "interrupted", "stale"].includes(status.mappingRun?.status)) break;
  }
  if (status?.mappingRun?.status !== "needs_review") throw new Error(`ZM-12 async run ended as ${status?.mappingRun?.status || "timeout"}: ${status?.mappingRun?.error?.message || "no result"}`);
  const result = await call(controlUrl, { mode: "skill.map_job.result", runId });
  const mappings = result.workspace.mappings.filter((item) => item.jobDescriptionId === jobId && item.status === "proposed");
  if (!mappings.length) throw new Error("ZM-12 produced no reviewer mapping proposal.");
  for (const mapping of mappings) {
    const explanation = mapping.explanation;
    if (!explanation?.evidenceAssessments?.some((item) => item.classification === "direct" && item.excerpt && item.evidenceRef === segmentId)) throw new Error("A proposal lacks direct governed evidence explainability.");
    if (explanation.evidenceAssessments.some((item) => item.classification === "unsupported")) throw new Error("Unsupported evidence reached the review queue.");
    if (explanation.scoreNarrative?.length !== 13) throw new Error("A proposal lacks the thirteen score explanations.");
  }
  console.log(`ZM-12 live UAT passed: ${mappings.length} explainable proposal(s), async status needs_review, no approval or publication.`);
} finally {
  const latest = (await call(orchestrator, { mode: "skill.read" })).workspace;
  await call(orchestrator, { mode: "skill.save", workspace: { ...baseline, revision: latest.revision }, expectedRevision: latest.revision, idempotencyKey: `uat-zm12-cleanup-${stamp}` });
}
