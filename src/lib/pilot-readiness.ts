import { governanceDiagnostics } from "./governance-analytics";
import { requiredAgentToolIds, validateWorkspace, type SkillWorkspace } from "./skill-schema";

export type ReadinessStatus = "pass" | "attention" | "blocked";
export type PilotReadinessCheck = { id: string; objective: string; status: ReadinessStatus; evidence: string; owner: "Taxonomy steward" | "Job architect" | "Platform owner" };

export function assessPilotReadiness(workspace: SkillWorkspace): PilotReadinessCheck[] {
  const findings = validateWorkspace(workspace);
  const diagnostics = governanceDiagnostics(workspace, findings);
  const activeToolIds = new Set(workspace.agentTools.filter((tool) => tool.lifecycleStatus === "active").map((tool) => tool.id));
  const missingAgentTools = requiredAgentToolIds.filter((id) => !activeToolIds.has(id));
  const failedRuns = workspace.agentRuns.filter((run) => run.status === "failed").length;
  const approvedJobs = workspace.jobDescriptions.filter((job) => job.status === "approved").length;
  const approvedMappings = workspace.mappings.filter((mapping) => mapping.status === "approved").length;
  const latestRelease = workspace.releaseHistory.find((release) => release.state === "published");
  return [
    { id: "schema", objective: "Canonical schema and KFLA hierarchy", status: workspace.schemaVersion === 3 && workspace.kflaFactors.length === 4 && workspace.kflaClusters.length === 12 && workspace.kfla.length === 38 ? "pass" : "blocked", evidence: `Schema v${workspace.schemaVersion} · ${workspace.kflaFactors.length}/4 factors · ${workspace.kflaClusters.length}/12 clusters · ${workspace.kfla.length}/38 competencies`, owner: "Taxonomy steward" },
    { id: "validation", objective: "Release-gate validation", status: diagnostics.blockingFindings ? "blocked" : diagnostics.advisoryFindings ? "attention" : "pass", evidence: `${diagnostics.blockingFindings} blocking · ${diagnostics.advisoryFindings} advisory findings`, owner: "Taxonomy steward" },
    { id: "review", objective: "Accountable human decisions", status: diagnostics.pendingReviews ? "blocked" : "pass", evidence: `${diagnostics.pendingReviews} pending decisions`, owner: "Taxonomy steward" },
    { id: "agent-tools", objective: "Deny-by-default agent tool registry", status: missingAgentTools.length ? "blocked" : "pass", evidence: missingAgentTools.length ? `Missing active tools: ${missingAgentTools.join(", ")}` : `${requiredAgentToolIds.length} required tools active`, owner: "Platform owner" },
    { id: "mapping", objective: "Approved job-to-skill baseline", status: approvedJobs && approvedMappings ? "pass" : "attention", evidence: `${approvedJobs} approved jobs · ${approvedMappings} approved mappings`, owner: "Job architect" },
    { id: "operations", objective: "Agent execution stability", status: failedRuns ? "attention" : "pass", evidence: `${failedRuns} failed of ${workspace.agentRuns.length} retained runs`, owner: "Platform owner" },
    { id: "release", objective: "Verifiable approved GitHub release", status: latestRelease?.githubCommitSha ? "pass" : "attention", evidence: latestRelease?.githubCommitSha ? `${latestRelease.id} · ${latestRelease.githubCommitSha.slice(0, 8)}` : "No published release receipt in working history", owner: "Platform owner" },
    { id: "localization", objective: "Configured-language coverage", status: diagnostics.localizationCoverage === 100 ? "pass" : "attention", evidence: `${diagnostics.localizationCoverage}% non-English label coverage`, owner: "Taxonomy steward" },
  ];
}

export function pilotReadinessSummary(checks: PilotReadinessCheck[]) {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    attention: checks.filter((check) => check.status === "attention").length,
    blocked: checks.filter((check) => check.status === "blocked").length,
    ready: checks.every((check) => check.status !== "blocked"),
  };
}
