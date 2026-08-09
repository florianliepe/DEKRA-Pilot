import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapSkillWorkspace } from "../src/lib/skill-fixtures";
import { applyAgentToolLifecycle, applyControlledToolLifecycle, applyReferenceLifecycle, applyRelationshipLifecycle, applyReleaseReceiptToWorkingWorkspace, applyRoleProfileLifecycle, applySkillLifecycle, authorizeAgentToolCall, calculateEvidenceCompleteness, calculateMappingScore, decideReview, detectReleaseDrift, impactAnalysis, mappingCalibrationSummary, prepareGovernedExport, prepareRelease, previewGovernedImport, proposeKflaLifecycle, recordMappingFeedback, requestGovernedImport, requestKflaMetadataReview, requestRollback, requestTaxonomyNodeDefinition, requestTaxonomyNodeLifecycle, resolveLocalizedConcept, sanitizeApprovedWorkspace, saveAgentToolDefinition, saveLocalizedConceptLabel, saveTaxonomyRelationship, setLocalizedConceptLabelStatus } from "../src/lib/skill-governance";
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

test("previews KFLA structural impact and applies lifecycle changes only after human approval", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const original = workspace.kfla.find((item) => item.id === "KFLA-08")!;
  const destination = workspace.kflaClusters.find((item) => item.id !== original.clusterId && item.factorId !== original.factorId)!;
  const proposed = proposeKflaLifecycle(workspace, { kind: "competency", action: "move", entityId: original.id, parentId: destination.id, actor: "KFLA Steward", reason: "Correct the governed navigation assignment using reviewed evidence." });
  expect(proposed.kfla.find((item) => item.id === original.id)?.clusterId).toBe(original.clusterId);
  const review = proposed.reviewQueue.find((item) => item.payload?.operation === "kfla_lifecycle")!;
  expect(review.summary).toMatch(/competencies.*skills.*mappings.*jobs/);

  const approved = decideReview(proposed, review.id, "accepted", "Framework Owner", "The proposed assignment and impact evidence are approved.");
  expect(approved.kfla.find((item) => item.id === original.id)).toMatchObject({ clusterId: destination.id, factorId: destination.factorId, reviewStatus: "internal_review" });
  expect(approved.objectVersions.some((item) => item.entityId === original.id && item.action === "kfla.move.approved")).toBe(true);
  expect(validateWorkspace(approved).some((finding) => finding.ruleId.startsWith("KFLA-HIERARCHY"))).toBe(false);
});

test("keeps a rejected KFLA lifecycle proposal non-mutating", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const proposed = proposeKflaLifecycle(workspace, { kind: "cluster", action: "archive", entityId: "KFLA-CL-T1", actor: "KFLA Steward", reason: "Test an archival proposal without applying it." });
  const review = proposed.reviewQueue.find((item) => item.payload?.operation === "kfla_lifecycle")!;
  const rejected = decideReview(proposed, review.id, "rejected", "Framework Owner", "The canonical cluster must remain active.");
  expect(rejected.kflaClusters.find((item) => item.id === "KFLA-CL-T1")?.status).toBe("approved");
});

test("keeps KFLA metadata candidates non-mutating until accountable approval", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const source = workspace.kfla[0];
  const candidate = { ...source, publicSummary: `${source.publicSummary} Reviewed boundary guidance.` };
  const proposed = requestKflaMetadataReview(workspace, { kind: "competency", entityId: source.id, candidate, actor: "KFLA Steward", reason: "Refresh the public-safe interpretation using reviewed research evidence." });
  expect(proposed.kfla[0].publicSummary).toBe(source.publicSummary);
  const review = proposed.reviewQueue.find((item) => item.payload?.operation === "kfla_metadata_review")!;
  expect(review.summary).toMatch(/competencies.*skills.*mappings.*jobs/);
  const approved = decideReview(proposed, review.id, "accepted", "Framework Owner", "The public-safe content and provenance boundary are approved.");
  expect(approved.kfla.find((item) => item.id === source.id)?.publicSummary).toBe(candidate.publicSummary);
  expect(approved.objectVersions.some((item) => item.entityId === source.id && item.action === "kfla.metadata_updated.approved")).toBe(true);
});

test("governs KFLA factor and cluster metadata without bypassing review", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const factor = workspace.kflaFactors[0];
  const factorProposal = requestKflaMetadataReview(workspace, { kind: "factor", entityId: factor.id, candidate: { ...factor, description: "Reviewed public-safe factor navigation guidance." }, actor: "KFLA Steward", reason: "Refresh the public navigation description." });
  const factorReview = factorProposal.reviewQueue.find((item) => item.payload?.operation === "kfla_metadata_review")!;
  const rejected = decideReview(factorProposal, factorReview.id, "rejected", "Framework Owner", "The evidence package does not support this wording yet.");
  expect(rejected.kflaFactors.find((item) => item.id === factor.id)?.description).toBe(factor.description);

  const cluster = workspace.kflaClusters[0];
  const targetFactor = workspace.kflaFactors.find((item) => item.id !== cluster.factorId)!;
  const clusterProposal = requestKflaMetadataReview(workspace, { kind: "cluster", entityId: cluster.id, candidate: { ...cluster, factorId: targetFactor.id, description: "Reviewed cluster boundary and navigation guidance." }, actor: "KFLA Steward", reason: "Align the cluster with the reviewed navigation model." });
  expect(clusterProposal.kflaClusters.find((item) => item.id === cluster.id)?.factorId).toBe(cluster.factorId);
  const clusterReview = clusterProposal.reviewQueue.find((item) => item.payload?.operation === "kfla_metadata_review")!;
  const approved = decideReview(clusterProposal, clusterReview.id, "accepted", "Framework Owner", "The dependency impact and navigation assignment are approved.");
  expect(approved.kflaClusters.find((item) => item.id === cluster.id)?.factorId).toBe(targetFactor.id);
  expect(approved.kfla.filter((item) => item.clusterId === cluster.id).every((item) => item.factorId === targetFactor.id && item.factor === targetFactor.name)).toBe(true);
});

test("governs taxonomy group moves through impact review before migration", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const proposed = requestTaxonomyNodeLifecycle(workspace, { kind: "group", action: "move", entityId: "GRP-DA", parentId: "DOM-PC", actor: "Taxonomy Steward", reason: "Align the governed group with its accountable domain owner." });
  expect(proposed.groups.find((item) => item.id === "GRP-DA")?.domainId).toBe("DOM-DT");
  const review = proposed.reviewQueue.find((item) => item.payload?.operation === "taxonomy_node_lifecycle")!;
  expect(review.summary).toMatch(/skills.*mappings.*profiles.*tools.*relationships.*jobs/);
  const approved = decideReview(proposed, review.id, "accepted", "Framework Owner", "Dependencies and target ownership are approved.");
  expect(approved.groups.find((item) => item.id === "GRP-DA")).toMatchObject({ domainId: "DOM-PC", status: "approved" });
  expect(approved.objectVersions.some((item) => item.entityId === "GRP-DA" && item.action === "taxonomy.move.approved")).toBe(true);
});

test("duplicates taxonomy nodes as drafts and keeps rejected structural requests non-mutating", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const duplicated = requestTaxonomyNodeLifecycle(workspace, { kind: "domain", action: "duplicate", entityId: "DOM-DT", newId: "DOM-DT-COPY", actor: "Taxonomy Steward", reason: "Create a governed comparison draft." });
  expect(duplicated.domains.find((item) => item.id === "DOM-DT-COPY")).toMatchObject({ name: "Digital & Technology copy", status: "draft" });
  const proposed = requestTaxonomyNodeLifecycle(workspace, { kind: "domain", action: "merge", entityId: "DOM-DT", targetId: "DOM-PC", actor: "Taxonomy Steward", reason: "Test a structural consolidation proposal." });
  const review = proposed.reviewQueue.find((item) => item.payload?.operation === "taxonomy_node_lifecycle")!;
  const rejected = decideReview(proposed, review.id, "rejected", "Framework Owner", "The domain boundaries remain materially distinct.");
  expect(rejected.domains.find((item) => item.id === "DOM-DT")?.status).toBe("approved");
  expect(rejected.groups.find((item) => item.id === "GRP-DA")?.domainId).toBe("DOM-DT");
});

test("keeps taxonomy definition candidates out of the active hierarchy until approval", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const proposed = requestTaxonomyNodeDefinition(workspace, { kind: "group", name: "Safety Analytics", description: "Governed capabilities for safety-data interpretation and decision support.", domainId: "DOM-DT", actor: "Taxonomy Steward", reason: "Add an evidence-backed capability group for the pilot." });
  expect(proposed.groups.some((item) => item.name === "Safety Analytics")).toBe(false);
  const review = proposed.reviewQueue.find((item) => item.payload?.operation === "taxonomy_node_definition")!;
  const approved = decideReview(proposed, review.id, "accepted", "Framework Owner", "The proposed scope and parent assignment are approved.");
  expect(approved.groups.find((item) => item.name === "Safety Analytics")).toMatchObject({ domainId: "DOM-DT", status: "approved" });
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

test("blocks release when a canonical agent-tool contract is missing or incomplete", () => {
  const missing = structuredClone(bootstrapSkillWorkspace);
  missing.agentTools = missing.agentTools.filter((tool) => tool.id !== "mapping_scorer");
  expect(validateWorkspace(missing).some((finding) => finding.ruleId === "AGENT-REGISTRY-001" && finding.entityId === "AGENT-REGISTRY")).toBe(true);

  const incomplete = structuredClone(bootstrapSkillWorkspace);
  incomplete.agentTools[0].auditRequirements = [];
  expect(validateWorkspace(incomplete).some((finding) => finding.ruleId === "AGENT-REGISTRY-001" && finding.entityId === incomplete.agentTools[0].id)).toBe(true);
  expect(validateWorkspace(bootstrapSkillWorkspace).some((finding) => finding.ruleId === "AGENT-REGISTRY-001")).toBe(false);
});

test("routes agent-tool edits and restorations through review while preserving historical invocation identity", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  workspace.agentRuns[0].tools = ["mapping_scorer"];
  workspace.agentRuns[0].invocations = [{ toolId: "mapping_scorer", toolVersion: "1.0.0", inputRef: "working://input/1", outputRef: "working://output/1", durationMs: 42, result: "success", retryCount: 0, rulesVersion: workspace.framework.rulesVersion, frameworkVersion: workspace.framework.version, actingUser: "mapping-agent", correlationId: "CORR-TOOL-1" }];
  const edited = saveAgentToolDefinition(workspace, { ...workspace.agentTools.find((tool) => tool.id === "mapping_scorer")!, version: "1.1.0" }, "Agent Platform Owner", "Expand the governed scoring contract.");
  expect(edited.agentTools.find((tool) => tool.id === "mapping_scorer")?.lifecycleStatus).toBe("draft");
  const editReview = edited.reviewQueue.find((item) => item.entityId === "mapping_scorer" && item.status === "pending")!;
  const approved = decideReview(edited, editReview.id, "accepted", "Framework Owner", "Contract and evidence approved.");
  expect(approved.agentTools.find((tool) => tool.id === "mapping_scorer")?.lifecycleStatus).toBe("active");

  const disabled = applyAgentToolLifecycle(approved, { action: "disable", toolId: "mapping_scorer", actor: "Agent Platform Owner", reason: "Suspend execution during contract review." });
  expect(disabled.agentTools.find((tool) => tool.id === "mapping_scorer")?.lifecycleStatus).toBe("disabled");
  expect(disabled.agentRuns[0].invocations?.[0]).toMatchObject({ toolId: "mapping_scorer", toolVersion: "1.0.0", correlationId: "CORR-TOOL-1" });
  expect(impactAnalysis(disabled, "mapping_scorer")).toMatchObject({ agentToolRuns: [{ id: "RUN-001" }], agentToolInvocations: [{ correlationId: "CORR-TOOL-1" }] });

  const restored = applyAgentToolLifecycle(disabled, { action: "restore", toolId: "mapping_scorer", actor: "Agent Platform Owner", reason: "Corrective controls verified." });
  expect(restored.agentTools.find((tool) => tool.id === "mapping_scorer")?.lifecycleStatus).toBe("draft");
  expect(restored.reviewQueue.some((item) => item.entityId === "mapping_scorer" && item.status === "pending")).toBe(true);
});

test("merges agent-tool policy contracts without rewriting recorded calls", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const merged = applyAgentToolLifecycle(workspace, { action: "merge", toolId: "skill_similarity_search", targetToolId: "taxonomy_search", actor: "Agent Platform Owner", reason: "Consolidate overlapping read-only search capabilities." });
  expect(merged.agentTools.find((tool) => tool.id === "skill_similarity_search")).toMatchObject({ lifecycleStatus: "disabled", replacementToolId: "taxonomy_search" });
  expect(merged.agentTools.find((tool) => tool.id === "taxonomy_search")).toMatchObject({ lifecycleStatus: "draft", supersedesToolIds: ["skill_similarity_search"] });
  expect(merged.reviewQueue.some((item) => item.entityId === "taxonomy_search" && item.status === "pending")).toBe(true);
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

test("keeps agent mapping proposals traceable to normalized job evidence and explains omissions", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const job = workspace.jobDescriptions.find((item) => item.id === "JD-DATA")!;
  const segmentIds = new Set(job.evidenceSegments.map((segment) => segment.id));
  const proposals = workspace.mappings.filter((mapping) => mapping.jobDescriptionId === job.id && mapping.source === "agent");
  expect(job.sourceFiles[0]).toMatchObject({ name: expect.any(String), contentHash: expect.any(String) });
  expect(job.evidenceSegments.length).toBeGreaterThanOrEqual(4);
  expect(proposals.every((mapping) => mapping.evidenceRefs?.length && mapping.evidenceRefs.every((id) => segmentIds.has(id) || workspace.evidenceRecords.some((record) => record.id === id)))).toBe(true);
  expect(proposals.every((mapping) => Object.keys(mapping.scoreBreakdown || {}).length === 13)).toBe(true);
  expect(workspace.mappingOmissions.find((item) => item.jobDescriptionId === job.id)).toMatchObject({ status: "explained", agentRunId: "RUN-001" });
  expect(validateWorkspace(workspace).some((finding) => ["MAPPING-EVIDENCE-REF-001", "MAPPING-OMISSION-001"].includes(finding.ruleId))).toBe(false);
});

test("persists job clarification answers as governed evidence and supports save resume", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const session = workspace.jobClarifications.find((item) => item.jobDescriptionId === "JD-DATA")!;
  const answered = session.questions.find((question) => question.status === "answered")!;
  expect(session).toMatchObject({ status: "in_progress", idempotencyKey: expect.stringContaining("clarification") });
  expect(answered.answer).toBeTruthy();
  expect(workspace.evidenceRecords.find((record) => record.id === answered.evidenceRecordId)).toMatchObject({ sourceId: "SRC-JD-DATA" });
  expect(validateWorkspace(workspace).some((finding) => finding.ruleId === "JOB-CLARIFICATION-001")).toBe(false);
});

test("excludes working clarifications, omissions and non-approved links from public releases", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const sanitized = sanitizeApprovedWorkspace(workspace);
  expect(sanitized.jobClarifications).toEqual([]);
  expect(sanitized.mappingOmissions).toEqual([]);
  expect(sanitized.mappings.every((mapping) => mapping.status === "approved")).toBe(true);
  expect(sanitized.profiles.every((profile) => profile.status === "approved" && profile.skills.every((link) => sanitized.skills.some((skill) => skill.id === link.skillId)))).toBe(true);
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

test("routes every seeded AI profile and mapping proposal to human review", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const profileReview = workspace.reviewQueue.find((item) => item.entityId === "ROLE-DATA");
  const mappingReview = workspace.reviewQueue.find((item) => item.entityId === "MAP-MC");

  expect(workspace.profiles.find((profile) => profile.id === "ROLE-DATA")?.status).toBe("in_review");
  expect(profileReview).toMatchObject({ id: "REV-003", type: "profile", status: "pending" });
  expect(workspace.mappings.find((mapping) => mapping.id === "MAP-MC")).toMatchObject({ source: "agent", status: "proposed" });
  expect(mappingReview).toMatchObject({ id: "REV-004", type: "mapping", status: "pending" });
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

test("records a published receipt in the full n8n working state without losing drafts", () => {
  const working = structuredClone(bootstrapSkillWorkspace);
  const approved = sanitizeApprovedWorkspace(working);
  approved.revision = 1;
  approved.publication = { ...approved.publication, revision: 1, state: "approved_release", approvedAt: "2026-08-08T10:00:00.000Z", approvedBy: "Framework Owner", expectedGitHubSha: "approved-blob-sha" };
  const manifest: ReleaseManifest = { id: "REL-0001", revision: 1, schemaVersion: 3, frameworkVersion: working.framework.version, rulesVersion: working.framework.rulesVersion, promptVersion: working.framework.promptVersion, mappingScoreVersion: working.framework.mappingScoreVersion, state: "published", approvedAt: "2026-08-08T10:00:00.000Z", approvedBy: "Framework Owner", expectedPreviousRevision: 0, expectedGitHubSha: "bootstrap-blob-sha", githubPath: "data/skill-workspace.approved.json", idempotencyKey: "release-1-receipt", objectCounts: {}, validationSummary: { blocking: 0, warnings: 0 } };
  const received = applyReleaseReceiptToWorkingWorkspace(working, approved, manifest, "commit-sha-1");
  expect(received.skills).toHaveLength(working.skills.length);
  expect(received.skills.some((skill) => skill.status === "draft")).toBe(true);
  expect(received.publication).toMatchObject({ revision: 1, state: "working", githubCommitSha: "commit-sha-1", expectedGitHubSha: "approved-blob-sha" });
  expect(received.releaseHistory[0]).toMatchObject({ revision: 1, state: "published", githubCommitSha: "commit-sha-1" });
  expect(received.objectVersions[0]).toMatchObject({ entityType: "release", entityId: "REL-0001", action: "release.receipt_recorded" });
  const retried = applyReleaseReceiptToWorkingWorkspace(received, approved, manifest, "commit-sha-1");
  expect(retried.objectVersions.filter((item) => item.action === "release.receipt_recorded")).toHaveLength(1);
});

test("reports collection-level drift against the GitHub-approved snapshot", () => {
  const working = structuredClone(bootstrapSkillWorkspace);
  const approved = sanitizeApprovedWorkspace(working);
  approved.revision = 0;
  const drift = detectReleaseDrift(working, approved);
  expect(drift.drifted).toBe(true);
  expect(drift.revisionDelta).toBe(1);
  expect(drift.changedCollections).toEqual(expect.arrayContaining(["skills", "mappings", "evidenceRecords"]));
  expect(drift.workingCounts.skills).toBeGreaterThan(drift.approvedCounts.skills);
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
  expect(() => requestRollback({ ...bootstrapSkillWorkspace, releaseHistory: [release] }, release, "Framework Owner")).toThrow(/reason/i);
  const rolledBack = requestRollback({ ...bootstrapSkillWorkspace, releaseHistory: [release] }, release, "Framework Owner", "Restore the last verified release after a confirmed regression.");
  expect(rolledBack.reviewQueue[0].title).toBe("Rollback to revision 1");
  expect(rolledBack.reviewQueue[0].status).toBe("pending");
  expect(rolledBack.reviewQueue[0].payload).toMatchObject({ operation: "release_rollback", rollbackOfRevision: 1, targetCommitSha: "abc123" });
  expect(() => requestRollback(rolledBack, release, "Framework Owner", "Submit the same rollback twice.")).toThrow(/already pending/i);
});

test("previews and reviews governed imports before replacing working data", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const candidate = structuredClone(workspace);
  candidate.framework = { ...candidate.framework, supportedLanguages: [...candidate.framework.supportedLanguages, "fr"] };
  const preview = previewGovernedImport(workspace, candidate, "candidate.json");
  expect(preview.changes).toContainEqual({ collection: "framework", current: 1, incoming: 1, delta: 0 });
  expect(preview.protectedContentDetected).toBe(false);
  const proposed = requestGovernedImport(workspace, preview, "Data Steward", "Import the reviewed multilingual framework candidate.");
  expect(proposed.framework.supportedLanguages).not.toContain("fr");
  const review = proposed.reviewQueue.find((item) => item.payload?.operation === "workspace_import")!;
  const approved = decideReview(proposed, review.id, "accepted", "Framework Owner", "The preview, schema and validation consequences are approved.");
  expect(approved.framework.supportedLanguages).toContain("fr");
  expect(approved.revision).toBe(workspace.revision + 1);
  expect(approved.objectVersions.some((item) => item.action === "workspace.import_applied")).toBe(true);
});

test("blocks protected browser imports and records accountable exports", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  const candidate = structuredClone(workspace);
  candidate.kfla[0] = { ...candidate.kfla[0], source: "licensed", definition: "Restricted definition", licensedDefinitionRef: "protected:KFLA-01" };
  const preview = previewGovernedImport(workspace, candidate, "restricted.json");
  expect(preview.protectedContentDetected).toBe(true);
  expect(() => requestGovernedImport(workspace, preview, "Data Steward", "Attempt protected import.")).toThrow(/licensed definitions/i);
  const credentialCandidate = structuredClone(workspace);
  credentialCandidate.skills[0].description = "github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
  const credentialPreview = previewGovernedImport(workspace, credentialCandidate, "credential.json");
  expect(credentialPreview.credentialLikeContentDetected).toBe(true);
  expect(() => requestGovernedImport(workspace, credentialPreview, "Data Steward", "Attempt credential import.")).toThrow(/credential-like/i);
  expect(() => prepareGovernedExport(workspace, "", "Evidence package")).toThrow(/exporter/i);
  const exported = prepareGovernedExport(workspace, "Data Steward", "Share a traceable working-state backup for review.");
  expect(exported.fileName).toContain(`r${workspace.revision}`);
  expect(exported.workspace.auditLog[0]).toMatchObject({ action: "workspace.exported", actorId: "Data Steward" });
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

test("governs source, evidence and validation-rule lifecycle with reference migration", () => {
  const workspace = structuredClone(bootstrapSkillWorkspace);
  expect(() => applyReferenceLifecycle(workspace, { kind: "source", id: "SRC-JD-DATA", action: "archive", actor: "", reason: "Test" })).toThrow(/actor/i);
  const duplicated = applyReferenceLifecycle(workspace, { kind: "source", id: "SRC-JD-DATA", action: "duplicate", actor: "Evidence Steward", reason: "Create a governed working copy.", newId: "SRC-JD-DATA-COPY" });
  expect(duplicated.sources.find((source) => source.id === "SRC-JD-DATA-COPY")?.status).toBe("draft");
  const merged = applyReferenceLifecycle(duplicated, { kind: "source", id: "SRC-JD-DATA", targetId: "SRC-JD-DATA-COPY", action: "merge", actor: "Evidence Steward", reason: "Consolidate provenance under the reviewed source record." });
  expect(merged.sources.find((source) => source.id === "SRC-JD-DATA")?.status).toBe("archived");
  expect(merged.evidenceRecords.find((evidence) => evidence.id === "EVD-DV-001")).toMatchObject({ sourceId: "SRC-JD-DATA-COPY", status: "in_review" });
  const evidenceDuplicate = applyReferenceLifecycle(workspace, { kind: "evidence", id: "EVD-DV-001", action: "duplicate", actor: "Evidence Steward", reason: "Create calibration evidence.", newId: "EVD-DV-COPY" });
  const evidenceMerged = applyReferenceLifecycle(evidenceDuplicate, { kind: "evidence", id: "EVD-DV-001", targetId: "EVD-DV-COPY", action: "merge", actor: "Evidence Steward", reason: "Consolidate supported entity references." });
  expect(evidenceMerged.evidenceRecords.find((evidence) => evidence.id === "EVD-DV-COPY")?.supportedEntityIds).toContain("MAP-DV");
  const ruleDeprecated = applyReferenceLifecycle(workspace, { kind: "validation_rule", id: "MAPPING-EVIDENCE-001", action: "deprecate", actor: "Framework Owner", reason: "Prepare a versioned replacement contract." });
  expect(ruleDeprecated.validationRules.find((rule) => rule.id === "MAPPING-EVIDENCE-001")?.status).toBe("deprecated");
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
