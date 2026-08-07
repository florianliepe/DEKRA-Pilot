import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapSkillWorkspace } from "../src/lib/skill-fixtures";
import { applyControlledToolLifecycle, applyRelationshipLifecycle, applyRoleProfileLifecycle, applySkillLifecycle, authorizeAgentToolCall, calculateEvidenceCompleteness, calculateMappingScore, decideReview, impactAnalysis, mappingCalibrationSummary, prepareRelease, recordMappingFeedback, requestRollback, resolveLocalizedConcept, sanitizeApprovedWorkspace, saveLocalizedConceptLabel, saveTaxonomyRelationship, setLocalizedConceptLabelStatus } from "../src/lib/skill-governance";
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
  delete legacy.localizedLabels;
  const migrated = migrateSkillWorkspace(legacy, bootstrapSkillWorkspace);
  expect(migrated.proficiencyDefinitions).toHaveLength(4);
  expect(migrated.sources.length).toBeGreaterThan(0);
  expect(migrated.evidenceRecords.every((evidence) => migrated.sources.some((source) => source.id === evidence.sourceId))).toBe(true);
  expect(migrated.localizedLabels.length).toBeGreaterThan(0);
  expect(validateWorkspace(migrated).some((finding) => ["PROFICIENCY-INTEGRITY-001", "EVIDENCE-SOURCE-001"].includes(finding.ruleId))).toBe(false);
});

test("governs multilingual labels without duplicating canonical concepts", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const canonicalCount = workspace.skills.length;
  const saved = saveLocalizedConceptLabel(workspace, { id: "LBL-SK-ST-DE", entityType: "skill", entityId: "SK-ST", language: "de", label: "Skill-Taxonomie gestalten", description: "Gestaltet eine konsistente und kontrollierte Skill-Taxonomie.", sourceClassification: "organization_authored", licenceStatus: "internal_explanation", status: "draft" }, "Taxonomy Steward", "Add a reviewed German label for pilot navigation.");
  expect(saved.skills).toHaveLength(canonicalCount);
  expect(resolveLocalizedConcept(saved, "skill", "SK-ST", "de")).toMatchObject({ entityId: "SK-ST", label: "Skill-Taxonomie gestalten", fallback: false });
  expect(resolveLocalizedConcept(saved, "skill", "SK-ST", "fr")).toMatchObject({ entityId: "SK-ST", label: "Skill Taxonomy Design", fallback: true });
  expect(saved.objectVersions[0]).toMatchObject({ entityType: "localized_label", entityId: "LBL-SK-ST-DE", action: "localized_label.created" });
  const archived = setLocalizedConceptLabelStatus(saved, "LBL-SK-ST-DE", "archived", "Taxonomy Steward", "Translation is being replaced.");
  expect(resolveLocalizedConcept(archived, "skill", "SK-ST", "de")).toMatchObject({ label: "Skill Taxonomy Design", fallback: true });
});

test("rejects duplicate, unsupported and orphaned localized labels", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  expect(() => saveLocalizedConceptLabel(workspace, { ...workspace.localizedLabels[0], id: "LBL-DUPLICATE" }, "Taxonomy Steward", "Duplicate test.")).toThrow(/already has an active label/);
  expect(() => saveLocalizedConceptLabel(workspace, { ...workspace.localizedLabels[0], id: "LBL-FR", language: "fr" }, "Taxonomy Steward", "Unsupported language test.")).toThrow(/not enabled/);
  const invalid = { ...workspace, localizedLabels: [{ ...workspace.localizedLabels[0], id: "LBL-ORPHAN", entityId: "SK-MISSING" }] };
  expect(validateWorkspace(invalid).some((finding) => finding.ruleId === "MULTILINGUAL-REFERENCE-001")).toBe(true);
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

test("records accountable mapping feedback without changing approval status", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  expect(calculateEvidenceCompleteness(workspace.mappings[0], workspace)).toBe(100);
  expect(() => recordMappingFeedback(workspace, { mappingId: "MAP-DV", decision: "confirmed", reviewer: "", reason: "Evidence verified." })).toThrow(/reviewer/i);
  const reviewed = recordMappingFeedback(workspace, { mappingId: "MAP-DV", decision: "adjusted", reviewer: "Mapping Steward", reason: "Direct evidence is strong, but confidence is reduced pending a second role sample.", confidenceAfter: 86 });
  expect(reviewed.mappings.find((mapping) => mapping.id === "MAP-DV")).toMatchObject({ status: "approved", confidence: 86, evidenceCompleteness: 100 });
  expect(reviewed.mappingFeedback[0]).toMatchObject({ mappingId: "MAP-DV", decision: "adjusted", reviewer: "Mapping Steward", confidenceBefore: 92, confidenceAfter: 86, evidenceCompleteness: 100 });
  expect(reviewed.objectVersions[0]).toMatchObject({ entityType: "mapping_feedback", action: "mapping.feedback_recorded" });
  expect(mappingCalibrationSummary(reviewed)).toMatchObject({ sampleSize: 1, predicted: 92, observed: 0, calibrationGap: -92, evidenceCompleteness: 100 });
  expect(sanitizeApprovedWorkspace(reviewed).mappingFeedback).toEqual([]);
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
  workspace.relationships = workspace.relationships.map((relationship) => relationship.sourceId === "SK-ST" || relationship.targetId === "SK-ST" ? { ...relationship, status: "archived" as const } : relationship);
  workspace.mappings = workspace.mappings.map((mapping) => mapping.id === "MAP-MC" ? { ...mapping, status: "deferred" as const } : mapping);
  workspace.profiles = workspace.profiles.map((profile) => ({ ...profile, skills: profile.skills.filter((link) => link.skillId !== "SK-ST") }));
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
  expect(sanitized.localizedLabels.every((label) => label.status === "approved" && ["public", "organization_authored"].includes(label.sourceClassification))).toBe(true);
  expect(sanitized.localizedLabels.some((label) => label.id === "LBL-SK-DV-DE")).toBe(true);
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

test("governs skill lifecycle changes and rewires merge dependencies", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  expect(() => applySkillLifecycle(workspace, { action: "archive", skillId: "SK-DV", actor: "", reason: "Obsolete" })).toThrow(/actor/i);
  expect(() => applySkillLifecycle(workspace, { action: "archive", skillId: "SK-DV", actor: "Taxonomy Steward", reason: "" })).toThrow(/reason/i);

  const moved = applySkillLifecycle(workspace, { action: "move", skillId: "SK-DV", targetGroupId: "GRP-SBO", actor: "Taxonomy Steward", reason: "Align with the governed architecture group." });
  expect(moved.skills.find((skill) => skill.id === "SK-DV")?.groupId).toBe("GRP-SBO");
  expect(moved.objectVersions[0]).toMatchObject({ entityType: "skill", entityId: "SK-DV", action: "skill.moved" });

  const merged = applySkillLifecycle(workspace, { action: "merge", skillId: "SK-DV", targetSkillId: "SK-MC", actor: "Taxonomy Steward", reason: "Validated overlap; retain one canonical skill." });
  expect(merged.skills.find((skill) => skill.id === "SK-DV")?.status).toBe("archived");
  expect(merged.skills.find((skill) => skill.id === "SK-DV")?.governance?.replacedById).toBe("SK-MC");
  expect(merged.skills.find((skill) => skill.id === "SK-MC")?.aliases).toContain("Data Visualization");
  expect(merged.mappings.some((mapping) => mapping.skillId === "SK-DV")).toBe(false);
  expect(merged.mappings.filter((mapping) => mapping.jobDescriptionId === "JD-DATA" && mapping.skillId === "SK-MC")).toHaveLength(1);
  expect(merged.mappings.find((mapping) => mapping.jobDescriptionId === "JD-DATA" && mapping.skillId === "SK-MC")?.evidence).toHaveLength(2);
  expect(merged.profiles.some((profile) => profile.skills.some((link) => link.skillId === "SK-DV"))).toBe(false);
  expect(merged.profiles[0].skills.find((link) => link.skillId === "SK-MC")).toMatchObject({ targetLevel: 3, weight: 30, critical: true });
  expect(merged.tools.some((tool) => tool.skillIds.includes("SK-DV"))).toBe(false);
  expect(merged.strategicVectors.some((vector) => vector.skillIds.includes("SK-DV"))).toBe(false);
  expect(merged.evidenceRecords.some((evidence) => evidence.supportedEntityIds.includes("SK-DV"))).toBe(false);
  expect(merged.relationships.some((relationship) => relationship.sourceId === "SK-DV" && relationship.targetId === "SK-MC" && relationship.type === "synonym")).toBe(true);
  expect(merged.objectVersions.filter((version) => ["SK-DV", "SK-MC"].includes(version.entityId))).toHaveLength(2);
  expect(merged.auditLog.filter((event) => event.action.startsWith("skill.merge"))).toHaveLength(2);
});

test("governs relationship CRUD, lifecycle and graph integrity", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  expect(() => saveTaxonomyRelationship(workspace, { id: "REL-SELF", sourceId: "SK-DV", targetId: "SK-DV", type: "related", rationale: "Invalid self edge.", status: "draft" }, "Taxonomy Steward", "Integrity test.")).toThrow(/same concept/i);
  const created = saveTaxonomyRelationship(workspace, { id: "REL-DV-MC", sourceId: "SK-DV", targetId: "SK-MC", type: "prerequisite", rationale: "Complexity framing supports interpretation of non-routine visual signals.", status: "draft" }, "Taxonomy Steward", "Add an evidence-grounded prerequisite edge.");
  expect(created.relationships[0]).toMatchObject({ id: "REL-DV-MC", status: "draft" });
  expect(created.objectVersions[0]).toMatchObject({ entityType: "relationship", action: "relationship.created" });
  const archived = applyRelationshipLifecycle(created, "REL-DV-MC", "archive", "Taxonomy Steward", "The relationship needs replacement evidence.");
  expect(archived.relationships.find((item) => item.id === "REL-DV-MC")?.status).toBe("archived");
  const restored = applyRelationshipLifecycle(archived, "REL-DV-MC", "restore", "Taxonomy Steward", "New evidence permits re-evaluation.");
  expect(restored.relationships.find((item) => item.id === "REL-DV-MC")?.status).toBe("draft");
  const invalid = { ...workspace, relationships: [...workspace.relationships, { ...workspace.relationships[0], id: "REL-DUPLICATE" }] };
  expect(validateWorkspace(invalid).some((finding) => finding.ruleId === "RELATIONSHIP-INTEGRITY-001")).toBe(true);
});

test("governs role-profile lifecycle with dependency evidence and immutable history", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const impact = impactAnalysis(workspace, "ROLE-DATA");
  expect(impact.profileJobs.map((job) => job.id)).toContain("JD-DATA");
  expect(impact.profileMappings.length).toBeGreaterThan(0);
  expect(() => applyRoleProfileLifecycle(workspace, { action: "archive", profileId: "ROLE-DATA", actor: "", reason: "Superseded" })).toThrow(/actor/i);
  expect(() => applyRoleProfileLifecycle(workspace, { action: "archive", profileId: "ROLE-DATA", actor: "Profile Owner", reason: "" })).toThrow(/reason/i);

  const duplicated = applyRoleProfileLifecycle(workspace, { action: "duplicate", profileId: "ROLE-DATA", newProfileId: "ROLE-DATA-NEXT", actor: "Profile Owner", reason: "Create the governed successor draft." });
  expect(duplicated.profiles.find((profile) => profile.id === "ROLE-DATA-NEXT")).toMatchObject({ title: "Global Reporting Analyst copy", status: "draft" });
  expect(duplicated.objectVersions[0]).toMatchObject({ entityType: "role_profile", entityId: "ROLE-DATA-NEXT", action: "profile.duplicated" });

  const merged = applyRoleProfileLifecycle(duplicated, { action: "merge", profileId: "ROLE-DATA", targetProfileId: "ROLE-DATA-NEXT", actor: "Profile Owner", reason: "Consolidate the calibrated profile into its successor." });
  expect(merged.profiles.find((profile) => profile.id === "ROLE-DATA")?.status).toBe("archived");
  expect(merged.profiles.find((profile) => profile.id === "ROLE-DATA")?.governance?.replacedById).toBe("ROLE-DATA-NEXT");
  expect(merged.profiles.find((profile) => profile.id === "ROLE-DATA-NEXT")?.status).toBe("in_review");
  expect(merged.profiles.find((profile) => profile.id === "ROLE-DATA-NEXT")?.skills).toHaveLength(workspace.profiles[0].skills.length);
  expect(merged.objectVersions.filter((version) => ["ROLE-DATA", "ROLE-DATA-NEXT"].includes(version.entityId)).length).toBeGreaterThanOrEqual(3);
  expect(merged.auditLog.filter((event) => event.action.startsWith("profile.merge"))).toHaveLength(2);
});

test("governs controlled-tool lifecycle and migrates job-mapping references", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const impact = impactAnalysis(workspace, "TOOL-POWERBI");
  expect(impact.toolSkills.map((skill) => skill.id)).toContain("SK-DV");
  expect(impact.toolMappings.map((mapping) => mapping.id)).toContain("MAP-DV");
  expect(() => applyControlledToolLifecycle(workspace, { action: "archive", toolId: "TOOL-POWERBI", actor: "", reason: "Superseded" })).toThrow(/actor/i);

  const duplicated = applyControlledToolLifecycle(workspace, { action: "duplicate", toolId: "TOOL-POWERBI", newToolId: "TOOL-POWERBI-NEXT", actor: "Tool Steward", reason: "Create a governed comparison record." });
  expect(duplicated.tools.find((tool) => tool.id === "TOOL-POWERBI-NEXT")).toMatchObject({ name: "Power BI copy", status: "draft" });

  const merged = applyControlledToolLifecycle(duplicated, { action: "merge", toolId: "TOOL-POWERBI", targetToolId: "TOOL-POWERBI-NEXT", actor: "Tool Steward", reason: "Consolidate aliases and governed mapping references." });
  expect(merged.tools.find((tool) => tool.id === "TOOL-POWERBI")?.status).toBe("archived");
  expect(merged.tools.find((tool) => tool.id === "TOOL-POWERBI")?.governance?.replacedById).toBe("TOOL-POWERBI-NEXT");
  expect(merged.tools.find((tool) => tool.id === "TOOL-POWERBI-NEXT")?.aliases).toContain("Power BI");
  expect(merged.mappings.find((mapping) => mapping.id === "MAP-DV")?.toolIds).toEqual(["TOOL-POWERBI-NEXT"]);
  expect(merged.mappings.find((mapping) => mapping.id === "MAP-DV")?.status).toBe("proposed");
  expect(merged.objectVersions.filter((version) => ["TOOL-POWERBI", "TOOL-POWERBI-NEXT"].includes(version.entityId)).length).toBeGreaterThanOrEqual(3);
});
