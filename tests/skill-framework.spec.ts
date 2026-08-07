import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapSkillWorkspace } from "../src/lib/skill-fixtures";
import { authorizeAgentToolCall, calculateMappingScore, decideReview, impactAnalysis, prepareRelease, requestRollback, sanitizeApprovedWorkspace } from "../src/lib/skill-governance";
import { migrateSkillWorkspace, validateWorkspace, type MappingScoreBreakdown, type ReleaseManifest } from "../src/lib/skill-schema";

test("models four factors, twelve clusters and all 38 assigned competencies", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  expect(workspace.kflaFactors).toHaveLength(4);
  expect(workspace.kflaClusters).toHaveLength(12);
  expect(workspace.kfla).toHaveLength(38);
  expect(new Set(workspace.kfla.map((item) => item.id)).size).toBe(38);
  expect(workspace.kfla.every((item) => workspace.kflaClusters.some((cluster) => cluster.id === item.clusterId && cluster.factorId === item.factorId))).toBe(true);
  expect(workspace.kfla.every((item) => item.sourceClassification && item.licenceStatus && item.sourceVersion && item.reviewDate && item.contentOwner)).toBe(true);
  expect([...workspace.kflaFactors, ...workspace.kflaClusters].every((item) => item.sourceClassification && item.licenceStatus && item.sourceVersion && item.reviewDate && item.contentOwner && item.status)).toBe(true);
});

test("migrates legacy KFLA factors and clusters with complete governance metadata", () => {
  const legacy = structuredClone(bootstrapSkillWorkspace) as unknown as Record<string, unknown> & { kflaFactors: Array<Record<string, unknown>>; kflaClusters: Array<Record<string, unknown>> };
  for (const item of [...legacy.kflaFactors, ...legacy.kflaClusters]) {
    delete item.licenceStatus;
    delete item.sourceVersion;
    delete item.reviewDate;
    delete item.contentOwner;
    delete item.status;
  }
  const migrated = migrateSkillWorkspace(legacy, bootstrapSkillWorkspace);
  expect([...migrated.kflaFactors, ...migrated.kflaClusters].every((item) => item.licenceStatus && item.sourceVersion && item.reviewDate && item.contentOwner && item.status)).toBe(true);
  expect(validateWorkspace(migrated).some((finding) => finding.ruleId === "KFLA-METADATA-001")).toBe(false);
});

test("migrates first-class proficiency, source and evidence collections", () => {
  const legacy = structuredClone(bootstrapSkillWorkspace) as unknown as Record<string, unknown>;
  delete legacy.proficiencyDefinitions;
  delete legacy.sources;
  delete legacy.evidenceRecords;
  const migrated = migrateSkillWorkspace(legacy, bootstrapSkillWorkspace);
  expect(migrated.proficiencyDefinitions).toHaveLength(4);
  expect(migrated.sources.length).toBeGreaterThan(0);
  expect(migrated.evidenceRecords.every((evidence) => migrated.sources.some((source) => source.id === evidence.sourceId))).toBe(true);
  expect(validateWorkspace(migrated).some((finding) => ["PROFICIENCY-INTEGRITY-001", "EVIDENCE-SOURCE-001"].includes(finding.ruleId))).toBe(false);
});

test("defines eleven permissioned and auditable agent tools", () => {
  const tools = bootstrapSkillWorkspace.agentTools;
  expect(tools).toHaveLength(11);
  expect(new Set(tools.map((tool) => tool.id)).size).toBe(11);
  for (const tool of tools) {
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.outputSchema.type).toBe("object");
    expect(tool.requiredPermission).toBeTruthy();
    expect(tool.allowedDataClassifications).not.toContain("licensed");
    expect(tool.timeoutMs).toBeGreaterThan(0);
    expect(tool.retryPolicy.maxAttempts).toBeGreaterThan(0);
    expect(tool.rateLimit.requests).toBeGreaterThan(0);
    expect(tool.errorContract.codes.length).toBeGreaterThan(0);
    expect(tool.auditRequirements).toContain("correlationId");
    expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/);
  }
});

test("publishes a fully expanded deny-by-default agent-tool registry", () => {
  const registry = JSON.parse(readFileSync(join(process.cwd(), "data", "agent-tool-registry.json"), "utf8"));
  expect(registry.policy.defaultAccess).toBe("deny");
  expect(registry.tools).toHaveLength(11);
  for (const tool of registry.tools) {
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.outputSchema.type).toBe("object");
    expect(tool.requiredPermission).toMatch(/^skill\./);
    expect(tool.allowedDataClassifications).not.toContain("licensed");
    expect(tool.timeoutMs).toBeGreaterThan(0);
    expect(tool.retryPolicy.maxAttempts).toBeGreaterThan(0);
    expect(tool.rateLimit.requests).toBeGreaterThan(0);
    expect(tool.errorContract.redactInputs).toBe(true);
    expect(tool.auditRequirements).toContain("correlationId");
    expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/);
  }
});

test("enforces agent-tool permissions, classifications, lifecycle and audit context", () => {
  const base = { action: "execute", actingUser: "mapping-agent", correlationId: "CORR-001", inputRef: "working://inputs/1", dataClassification: "internal" as const };
  const allowed = authorizeAgentToolCall(bootstrapSkillWorkspace, "mapping_scorer", { ...base, permissions: ["skill.mapping.score"] });
  expect(allowed).toMatchObject({ allowed: true, code: "ALLOWED" });
  expect(allowed.invocation).toMatchObject({ toolId: "mapping_scorer", actingUser: "mapping-agent", correlationId: "CORR-001", result: "success" });

  const missingPermission = authorizeAgentToolCall(bootstrapSkillWorkspace, "mapping_scorer", { ...base, permissions: [] });
  expect(missingPermission).toMatchObject({ allowed: false, code: "PERMISSION_DENIED" });
  expect(missingPermission.invocation.result).toBe("denied");

  const licensed = authorizeAgentToolCall(bootstrapSkillWorkspace, "kfla_lookup", { ...base, permissions: ["skill.kfla.read_public"], dataClassification: "licensed" });
  expect(licensed).toMatchObject({ allowed: false, code: "DATA_CLASSIFICATION_DENIED" });

  const inactiveWorkspace = structuredClone(bootstrapSkillWorkspace);
  inactiveWorkspace.agentTools = inactiveWorkspace.agentTools.map((tool) => tool.id === "mapping_scorer" ? { ...tool, lifecycleStatus: "disabled" as const } : tool);
  expect(authorizeAgentToolCall(inactiveWorkspace, "mapping_scorer", { ...base, permissions: ["skill.mapping.score"] })).toMatchObject({ allowed: false, code: "TOOL_INACTIVE" });
});

test("returns structured validation findings with release-gate metadata", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  workspace.skills[0].syntax = { action: "", object: "" };
  const finding = validateWorkspace(workspace).find((item) => item.ruleId === "SKILL-SYNTAX-001");
  expect(finding).toMatchObject({ severity: "error", affectedField: "syntax", blocking: true, frameworkVersion: "3.1.0" });
  expect(finding?.explanation).toBeTruthy();
  expect(finding?.suggestedCorrection).toBeTruthy();
});

test("calculates the transparent thirteen-part weighted score and penalties", () => {
  const base = Object.fromEntries(Object.keys(bootstrapSkillWorkspace.framework.mappingWeights).map((key) => [key, key.endsWith("Penalty") ? 0 : 80])) as MappingScoreBreakdown;
  const clean = calculateMappingScore(base, bootstrapSkillWorkspace.framework.mappingWeights);
  const penalized = calculateMappingScore({ ...base, duplicatePenalty: 100, contradictionPenalty: 100, missingEvidencePenalty: 100 }, bootstrapSkillWorkspace.framework.mappingWeights);
  expect(Object.keys(base)).toHaveLength(13);
  expect(clean).toBe(80);
  expect(penalized).toBeLessThan(clean);
});

test("requires accountable review decisions and supports approve, defer and merge", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  expect(() => decideReview(workspace, "REV-001", "accepted", "", "Evidence verified")).toThrow(/reviewer/i);
  const accepted = decideReview(workspace, "REV-001", "accepted", "Taxonomy Steward", "Evidence and granularity verified.");
  expect(accepted.reviewQueue.find((item) => item.id === "REV-001")?.status).toBe("accepted");
  expect(accepted.skills.find((item) => item.name === "Skill Taxonomy Design")?.status).toBe("approved");
  const deferred = decideReview(workspace, "REV-001", "deferred", "Taxonomy Steward", "Additional SME evidence required.");
  expect(deferred.reviewQueue.find((item) => item.id === "REV-001")?.status).toBe("deferred");
  const merged = decideReview(workspace, "REV-002", "merged", "Taxonomy Steward", "Use the approved canonical concept.", "SK-DV");
  expect(merged.reviewQueue.find((item) => item.id === "REV-002")?.mergeTargetId).toBe("SK-DV");
  expect(merged.objectVersions.length).toBeGreaterThan(0);
});

test("blocks publication until reviews resolve and protects optimistic concurrency", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  expect(() => prepareRelease(workspace, "Framework Owner", 0)).toThrow(/review/i);
  workspace.reviewQueue = workspace.reviewQueue.map((item) => ({ ...item, status: "deferred" as const, decisionBy: "Framework Owner", decisionReason: "Deferred outside release scope." }));
  workspace.skills = workspace.skills.map((skill) => skill.id === "SK-ST" ? { ...skill, status: "archived" as const } : skill);
  workspace.mappings = workspace.mappings.map((mapping) => mapping.id === "MAP-MC" ? { ...mapping, status: "deferred" as const } : mapping);
  expect(() => prepareRelease(workspace, "Framework Owner", 1)).toThrow(/conflict/i);
  const prepared = prepareRelease(workspace, "Framework Owner", 0);
  expect(prepared.manifest.revision).toBe(1);
  expect(prepared.manifest.expectedPreviousRevision).toBe(0);
  expect(prepared.manifest.idempotencyKey).toMatch(/^release-1-/);
  expect(prepared.manifest.promptVersion).toBe(workspace.framework.promptVersion);
  expect(prepared.manifest.mappingScoreVersion).toBe(workspace.framework.mappingScoreVersion);
  expect(prepared.manifest.objectCounts.skills).toBe(2);
  expect(prepared.manifest.objectCounts.mappings).toBe(1);
  expect(prepared.workspace.publication.state).toBe("publishing");
});

test("removes licensed definitions from public approved snapshots", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  workspace.kfla[0] = { ...workspace.kfla[0], source: "licensed", definition: "restricted-test-content", licensedDefinitionRef: "protected://definition/1", licenceStatus: "licensed_restricted" };
  const sanitized = sanitizeApprovedWorkspace(workspace);
  expect(sanitized.kfla[0].definition).toBe("");
  expect(sanitized.kfla[0].licensedDefinitionRef).toBeUndefined();
  expect(JSON.stringify(sanitized)).not.toContain("restricted-test-content");
  expect(sanitized.skills.every((skill) => skill.status === "approved")).toBe(true);
  expect(sanitized.mappings.every((mapping) => mapping.status === "approved")).toBe(true);
  expect(sanitized.tools.every((tool) => tool.status === "approved")).toBe(true);
  expect(sanitized.agentTools.every((tool) => tool.lifecycleStatus === "active")).toBe(true);
  expect(sanitized.skills.some((skill) => skill.id === "SK-ST")).toBe(false);
  expect(sanitized.interviews).toEqual([]);
  expect(sanitized.elicitationSessions).toEqual([]);
  expect(sanitized.agentRuns).toEqual([]);
  expect(sanitized.objectVersions).toEqual([]);
  expect(sanitized.proficiencyDefinitions).toHaveLength(4);
  expect(sanitized.evidenceRecords.every((evidence) => evidence.dataClassification === "public")).toBe(true);
  expect(sanitized.evidenceRecords.some((evidence) => evidence.id === "EVD-ST-001")).toBe(false);
  expect(sanitized.sources.every((source) => sanitized.evidenceRecords.some((evidence) => evidence.sourceId === source.id))).toBe(true);
});

test("performs dependency analysis and routes rollback through review", () => {
  const impact = impactAnalysis(bootstrapSkillWorkspace, "SK-DV");
  expect(impact.mappings.length).toBeGreaterThan(0);
  expect(impact.profiles.length).toBeGreaterThan(0);
  expect(impact.evidenceRecords.length).toBeGreaterThan(0);
  expect(impact.sources.length).toBeGreaterThan(0);
  const release: ReleaseManifest = { id: "REL-0001", revision: 1, schemaVersion: 3, frameworkVersion: "3.1.0", rulesVersion: "rules-3.1.0", promptVersion: "skill-agent-2.0.0", mappingScoreVersion: "mapping-2.0.0", state: "published", approvedAt: new Date().toISOString(), approvedBy: "Framework Owner", expectedPreviousRevision: 0, githubCommitSha: "abc123", githubPath: "data/skill-workspace.approved.json", idempotencyKey: "release-1-test", objectCounts: {}, validationSummary: { blocking: 0, warnings: 0 } };
  const rolledBack = requestRollback({ ...bootstrapSkillWorkspace, releaseHistory: [release] }, release, "Framework Owner");
  expect(rolledBack.reviewQueue[0].title).toBe("Rollback to revision 1");
  expect(rolledBack.reviewQueue[0].status).toBe("pending");
});
