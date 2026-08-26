const base = "https://eraneos-agentic-platform.azurewebsites.net/webhook";
const orchestrator = process.env.N8N_SKILL_WEBHOOK_URL || `${base}/skill-designer-orchestrator-v3-governed`;
const startUrl = `${base}/skill-designer-mapping-async-v1`;
const controlUrl = `${base}/skill-designer-mapping-control-v1`;
const secret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
if (!secret) throw new Error("x-n8n-webhook-secret is required.");

const call = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(`${body.mode} failed: ${payload.error || response.status}`);
  return payload;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baseline = (await call(orchestrator, { mode: "skill.read" })).workspace;
const stamp = Date.now();
const jobId = `UAT-ZM13-${stamp}`;
const statements = [
  "Build governed Azure landing zones and subscription foundations for reliable product onboarding.",
  "Automate repeatable cloud infrastructure provisioning with reviewed infrastructure-as-code modules.",
  "Secure cloud identities, privileged access and platform configuration against approved controls.",
  "Monitor platform availability, capacity and performance to detect degradation before customer impact.",
  "Resolve cloud incidents and restore services within accountable recovery objectives.",
  "Optimise cloud consumption and capacity to improve cost transparency and sustainable utilisation.",
  "Govern cloud architecture standards and exceptions to maintain a coherent platform landscape.",
  "Communicate operational decisions, risks and trade-offs to product teams and accountable stakeholders.",
];
const segments = statements.map((quotation, index) => ({
  id: `SEG-${jobId}-${String(index + 1).padStart(2, "0")}`,
  sourceId: `SRC-${jobId}`,
  sourceName: "zm13-cloud-platform-engineer-uat.md",
  section: "Responsibilities",
  location: `responsibility ${index + 1}`,
  quotation,
  normalizedType: "responsibility",
  normalizedValue: quotation,
  confidence: 99,
}));

let seededWorkspace = structuredClone(baseline);
seededWorkspace.jobDescriptions.unshift({
  id: jobId,
  title: "ZM-13 Cloud Platform Engineer UAT",
  jobFamily: "Corporate IT / Infrastructure and Cloud",
  country: "Germany",
  language: "English",
  purpose: "Provide a secure, reliable and cost-transparent cloud platform for product teams.",
  sourceText: statements.join("\n"),
  responsibilities: statements,
  outcomes: ["Reliable product onboarding", "Secure and recoverable cloud services", "Transparent cloud cost and risk decisions"],
  activities: [],
  tools: ["Microsoft Azure", "Terraform", "Azure Monitor"],
  qualifications: [],
  context: ["Regulated enterprise cloud platform"],
  constraints: ["Approved architecture, security and cost controls"],
  evidenceSegments: segments,
  sourceFiles: [{ name: "zm13-cloud-platform-engineer-uat.md", mediaType: "text/markdown", size: statements.join("\n").length, contentHash: `synthetic-${stamp}` }],
  intakeFindings: [],
  status: "analysed",
  version: 1,
  updatedAt: new Date().toISOString(),
});
seededWorkspace.jobClarifications.unshift({
  id: `CLAR-${jobId}`,
  jobDescriptionId: jobId,
  status: "complete",
  currentQuestion: 0,
  questions: [],
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  idempotencyKey: `uat-zm13-ready-${stamp}`,
  sessionVersion: 1,
  sufficiencyScore: 95,
  sufficiencyThreshold: 80,
  canMap: true,
  stopReason: "threshold_met",
  contradictions: [],
});

try {
  const seeded = await call(orchestrator, {
    mode: "skill.save",
    workspace: seededWorkspace,
    expectedRevision: baseline.revision,
    idempotencyKey: `uat-zm13-seed-${stamp}`,
  });
  seededWorkspace = seeded.workspace;
  const runId = `RUN-ZM13-${stamp}`;
  await call(startUrl, {
    mode: "skill.map_job.start",
    runId,
    jobDescriptionId: jobId,
    workspace: seededWorkspace,
    idempotencyKey: `uat-zm13-map-${stamp}`,
  });

  let status;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(attempt < 5 ? 2000 : 5000);
    status = await call(controlUrl, { mode: "skill.map_job.status", runId });
    if (["needs_review", "failed", "interrupted", "stale"].includes(status.mappingRun?.status)) break;
  }
  if (status?.mappingRun?.status !== "needs_review") {
    throw new Error(`ZM-13 async run ended as ${status?.mappingRun?.status || "timeout"}: ${status?.mappingRun?.error?.message || "no result"}`);
  }

  const result = await call(controlUrl, { mode: "skill.map_job.result", runId });
  const workspace = result.workspace;
  const mappings = workspace.mappings.filter((item) => item.jobDescriptionId === jobId && item.status === "proposed");
  const gaps = workspace.reviewQueue.filter((item) => item.type === "new_skill" && item.status === "pending" && item.payload?.jobDescriptionId === jobId);
  const candidateCount = mappings.length + gaps.length;
  if (candidateCount < 8 || candidateCount > 10) throw new Error(`Role profile contains ${candidateCount} skills/gaps instead of 8–10.`);
  const weight = mappings.reduce((sum, item) => sum + Number(item.weight || 0), 0) + gaps.reduce((sum, item) => sum + Number(item.payload?.profileWeight || 0), 0);
  if (Math.round(weight) !== 100) throw new Error(`Role profile weight is ${weight}, not 100.`);
  const ownership = new Map(segments.map((item) => [item.id, []]));
  for (const mapping of mappings) for (const ref of mapping.evidenceRefs || []) if (ownership.has(ref)) ownership.get(ref).push(mapping.id);
  for (const gap of gaps) for (const ref of gap.payload?.evidenceRefs || []) if (ownership.has(ref)) ownership.get(ref).push(gap.id);
  const invalid = [...ownership].filter(([, owners]) => owners.length !== 1);
  if (invalid.length) throw new Error(`MECE ownership failed for ${invalid.map(([id, owners]) => `${id}:${owners.length}`).join(", ")}.`);
  if (mappings.some((item) => item.status !== "proposed") || gaps.some((item) => item.status !== "pending")) throw new Error("UAT output crossed the human approval boundary.");

  console.log(`ZM-13 live UAT passed: ${candidateCount} draft skills/gaps, ${weight}% weight, ${segments.length}/${segments.length} evidence statements have one owner, status needs_review, no approval or publication.`);
} finally {
  const latest = (await call(orchestrator, { mode: "skill.read" })).workspace;
  await call(orchestrator, {
    mode: "skill.save",
    workspace: { ...baseline, revision: latest.revision },
    expectedRevision: latest.revision,
    idempotencyKey: `uat-zm13-cleanup-${stamp}`,
  });
}
