const endpoint = process.env.N8N_SKILL_WEBHOOK_URL || "https://eraneos-agentic-platform.azurewebsites.net/webhook/skill-designer-orchestrator-v3-governed";
const secret = process.env["x-n8n-webhook-secret"] || process.env.APP_SHARED_SECRET;
if (!secret) throw new Error("x-n8n-webhook-secret is required.");

const request = async (body) => {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-n8n-webhook-secret": secret }, body: JSON.stringify(body) });
  const payload = await response.json();
  return { status: response.status, payload };
};
const expectOk = async (body) => {
  const result = await request(body);
  if (!result.status.toString().startsWith("2") || result.payload.ok === false) throw new Error(`Live ZM-11 request failed with ${result.status}: ${result.payload.error || "unknown error"}`);
  return result.payload;
};

const baseline = (await expectOk({ mode: "skill.read" })).workspace;
if (!baseline) throw new Error("No governed workspace is available for ZM-11 UAT.");
let current = structuredClone(baseline);
const suffix = Date.now();
const jobId = `UAT-ZM11-${suffix}`;
current.jobDescriptions = [{
  id: jobId,
  title: "ZM-11 Contradiction Resolution UAT",
  jobFamily: "Quality Engineering",
  country: "Global",
  language: "English",
  purpose: "Make accountable safety decisions and improve inspection quality outcomes.",
  sourceText: "The role works independently with full authority. Every decision requires approval and must always escalate. It improves inspection quality and resolves corrective actions with stakeholders.",
  responsibilities: ["Make inspection decisions independently.", "Escalate every decision for approval.", "Resolve corrective actions with stakeholders."],
  outcomes: ["Improve inspection quality outcomes."],
  activities: [], tools: [], qualifications: [], context: [], constraints: [], evidenceSegments: [], sourceFiles: [], intakeFindings: [], status: "analysed", version: 1, updatedAt: new Date().toISOString(),
}, ...current.jobDescriptions];

try {
  const seeded = await expectOk({ mode: "skill.save", workspace: current, expectedRevision: baseline.revision, idempotencyKey: `uat-zm11-seed-${suffix}` });
  current = seeded.workspace;
  const started = await expectOk({ mode: "skill.clarify_job", action: "start", jobDescriptionId: jobId, workspace: current, expectedSessionVersion: 0, idempotencyKey: `uat-zm11-start-${suffix}` });
  current = started.workspace;
  let session = current.jobClarifications.find((item) => item.jobDescriptionId === jobId);
  if (!session || session.status !== "needs_resolution" || session.canMap || session.questions[0]?.gapType !== "contradictory" || session.questions[0]?.priority !== "critical" || !session.questions[0]?.sourceExcerpts?.length || !session.questions[0]?.affectedMappingDimensions?.includes("contradictionPenalty")) {
    console.error("ZM-11 contract mismatch", { status: session?.status, canMap: session?.canMap, gapType: session?.questions?.[0]?.gapType, priority: session?.questions?.[0]?.priority, excerpts: session?.questions?.[0]?.sourceExcerpts?.length || 0, affected: session?.questions?.[0]?.affectedMappingDimensions || [] });
    throw new Error("Critical contradiction was not surfaced with the ZM-11 explainability contract.");
  }

  const bypass = await request({ mode: "skill.map_job", jobDescriptionId: jobId, workspace: current, idempotencyKey: `uat-zm11-bypass-${suffix}` });
  if (![bypass.status, bypass.payload.statusCode].includes(409) || !String(bypass.payload.error).includes("critical evidence contradiction")) throw new Error("Server-side mapping readiness gate did not reject unresolved critical evidence.");

  const skipped = await request({ mode: "skill.clarify_job", action: "skip", questionId: session.questions[0].id, jobDescriptionId: jobId, workspace: current, expectedSessionVersion: session.sessionVersion, idempotencyKey: `uat-zm11-skip-${suffix}` });
  if (![skipped.status, skipped.payload.statusCode].includes(409) || !String(skipped.payload.error).includes("cannot be deferred")) throw new Error("Critical contradiction could be deferred unexpectedly.");

  let step = 0;
  while (!session.canMap && step < 8) {
    const open = session.questions.find((item) => item.status === "open");
    if (!open) throw new Error("Clarification stopped below the sufficiency threshold without an open question.");
    const answer = open.contradictionId
      ? "Independent inspection decisions are permitted within approved tolerances; deviations and safety-critical exceptions require accountable manager approval."
      : `Observable ${open.dimension.replaceAll("_", " ")} evidence is recorded through governed review outcomes, decision logs and measurable quality indicators.`;
    const answered = await expectOk({ mode: "skill.clarify_job", action: "answer", questionId: open.id, answer, jobDescriptionId: jobId, workspace: current, expectedSessionVersion: session.sessionVersion, idempotencyKey: `uat-zm11-answer-${suffix}-${step}` });
    current = answered.workspace;
    session = current.jobClarifications.find((item) => item.jobDescriptionId === jobId);
    step += 1;
  }
  if (!session?.canMap || session.sufficiencyScore < session.sufficiencyThreshold || session.contradictions.some((item) => item.severity === "critical" && item.status === "open")) throw new Error("Clarification did not reach the governed stopping condition after explicit resolution.");

  const extra = await expectOk({ mode: "skill.clarify_job", action: "ask_more", jobDescriptionId: jobId, workspace: current, expectedSessionVersion: session.sessionVersion, idempotencyKey: `uat-zm11-more-${suffix}` });
  current = extra.workspace;
  session = current.jobClarifications.find((item) => item.jobDescriptionId === jobId);
  if (!session?.questions.some((item) => item.status === "open") || !session.canMap || session.stopReason !== "user_requested_more") throw new Error("The user-requested additional question did not preserve governed mapping readiness.");

  console.log(`ZM-11 live UAT passed: contradiction blocked, explicit resolution accepted, sufficiency ${session.sufficiencyScore}/${session.sufficiencyThreshold}, and ask-more remained available.`);
} finally {
  const latest = (await expectOk({ mode: "skill.read" })).workspace;
  const cleanup = { ...baseline, revision: latest.revision };
  await expectOk({ mode: "skill.save", workspace: cleanup, expectedRevision: latest.revision, idempotencyKey: `uat-zm11-cleanup-${suffix}` });
}
