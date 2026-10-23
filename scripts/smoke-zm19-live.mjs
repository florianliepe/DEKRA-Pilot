import { randomUUID } from "node:crypto";

const secret = process.env["x-n8n-webhook-secret"];
const baseUrl = process.env.N8N_BASE_URL || "https://eraneos-agentic-platform.azurewebsites.net";
if (!secret) throw new Error("x-n8n-webhook-secret is required.");
const headers = { "Content-Type": "application/json", "x-n8n-webhook-secret": secret };
const runId = randomUUID();
const startUrl = `${baseUrl}/webhook/skill-designer-trend-radar-async-v1`;
const controlUrl = `${baseUrl}/webhook/skill-designer-trend-radar-control-v1`;
const post = async (url, body, timeout = 30000) => {
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
  if (!response.ok) throw new Error(`Live ZM-19 request returned HTTP ${response.status}; response content intentionally suppressed.`);
  return payload;
};
const baseline = {
  signals: [{ id: "UAT-SIGNAL", title: "Governed AI assurance", summary: "UAT baseline for agent runtime validation.", horizon: "now", strategicFit: 90, urgency: 85, valueImpact: 90, sourceLabel: "European Commission — Artificial Intelligence", sourceUrl: "https://commission.europa.eu/topics/artificial-intelligence_en", valueChain: ["Certification"] }],
  candidates: [{ id: "UAT-CANDIDATE", name: "AI assurance orchestration", category: "technical", definition: "Applies governed methods and tools to orchestrate evidence-based AI assurance workflows.", trendIds: ["UAT-SIGNAL"], horizon: "now", strategyFit: 90, upskillingNeed: 85, roleChangeIntensity: 80, jobFamilies: ["Digital & Information Technology"], targetLevel: 2 }],
};
await post(startUrl, { mode: "skill.trend_scan.start", runId, idempotencyKey: `uat-zm19:${runId}`, sourceCutoffAt: new Date().toISOString(), configVersion: "DEKRA-emerging-skills-1.1.0", workspace: { revision: 1, frameworkVersion: "UAT", rulesVersion: "UAT", skills: [], jobs: [] }, baseline });
let run;
for (let attempt = 0; attempt < 45; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const status = await post(controlUrl, { mode: "skill.trend_scan.status", runId });
  run = status.trendRun;
  if (!run) throw new Error("The live ZM-19 status response omitted the governed run.");
  if (["completed", "failed", "interrupted", "stale"].includes(run.status)) break;
}
if (run?.status !== "completed") throw new Error(`Live ZM-19 run did not complete successfully (terminal status: ${run?.status || "timeout"}).`);
const result = await post(controlUrl, { mode: "skill.trend_scan.result", runId });
if (!result.snapshot?.signals?.length || !result.snapshot?.candidates?.length || result.snapshot.configVersion !== "DEKRA-emerging-skills-1.1.0") throw new Error("Live ZM-19 completed without a valid governed snapshot.");
console.log(`ZM-19 live UAT passed for run ${runId}; candidate snapshot remained unapproved.`);
