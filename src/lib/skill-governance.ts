import { validateWorkspace, type AgentToolDefinition, type AgentToolInvocation, type AuditEvent, type ControlledTool, type DataClassification, type EvidenceRecord, type JobSkillMapping, type KflaCluster, type KflaCompetency, type KflaFactor, type LocalizedConceptLabel, type MappingFeedback, type MappingScoreBreakdown, type ObjectVersion, type ReleaseManifest, type ReviewItem, type RoleProfile, type SkillWorkspace, type SourceRecord, type TaxonomyRelationship, type ValidationRule } from "./skill-schema";

const penaltyKeys: Array<keyof MappingScoreBreakdown> = ["duplicatePenalty", "contradictionPenalty", "missingEvidencePenalty"];

export type AgentToolCallContext = {
  permissions: string[];
  dataClassification: DataClassification;
  action: string;
  actingUser: string;
  correlationId: string;
  inputRef: string;
};

export type AgentToolAuthorization = {
  allowed: boolean;
  code: "ALLOWED" | "TOOL_NOT_FOUND" | "TOOL_INACTIVE" | "PERMISSION_DENIED" | "DATA_CLASSIFICATION_DENIED" | "ACTION_DENIED" | "INVALID_CONTEXT";
  reason: string;
  invocation: AgentToolInvocation;
};

export function authorizeAgentToolCall(workspace: SkillWorkspace, toolId: string, context: AgentToolCallContext): AgentToolAuthorization {
  const tool = workspace.agentTools.find((candidate) => candidate.id === toolId);
  const base = {
    toolId,
    toolVersion: tool?.version || "unknown",
    inputRef: context.inputRef,
    durationMs: 0,
    retryCount: 0,
    rulesVersion: workspace.framework.rulesVersion,
    frameworkVersion: workspace.framework.version,
    actingUser: context.actingUser,
    correlationId: context.correlationId,
  };
  const denied = (code: Exclude<AgentToolAuthorization["code"], "ALLOWED">, reason: string): AgentToolAuthorization => ({
    allowed: false,
    code,
    reason,
    invocation: { ...base, result: "denied", errorCode: code },
  });
  if (!context.actingUser.trim() || !context.correlationId.trim() || !context.inputRef.trim()) return denied("INVALID_CONTEXT", "Acting user, correlation ID and an opaque input reference are required.");
  if (!tool) return denied("TOOL_NOT_FOUND", "The tool is not present in the allowlisted registry.");
  if (tool.lifecycleStatus !== "active") return denied("TOOL_INACTIVE", `Tool lifecycle is ${tool.lifecycleStatus}.`);
  if (!context.permissions.includes(tool.requiredPermission)) return denied("PERMISSION_DENIED", `Missing permission ${tool.requiredPermission}.`);
  if (context.dataClassification === "licensed" || !tool.allowedDataClassifications.includes(context.dataClassification)) return denied("DATA_CLASSIFICATION_DENIED", `${context.dataClassification} data is outside the tool contract.`);
  if (!tool.allowedAgentActions.includes(context.action)) return denied("ACTION_DENIED", `Action ${context.action} is not allowlisted.`);
  return { allowed: true, code: "ALLOWED", reason: "Tool contract permits this invocation.", invocation: { ...base, result: "success" } };
}

export function calculateMappingScore(breakdown: MappingScoreBreakdown, weights: SkillWorkspace["framework"]["mappingWeights"]) {
  const weighted = (Object.keys(weights) as Array<keyof MappingScoreBreakdown>).reduce((sum, key) => {
    const direction = penaltyKeys.includes(key) ? -1 : 1;
    return sum + direction * Math.max(0, Math.min(100, breakdown[key])) * weights[key];
  }, 0);
  const positiveWeight = (Object.keys(weights) as Array<keyof MappingScoreBreakdown>)
    .filter((key) => !penaltyKeys.includes(key))
    .reduce((sum, key) => sum + weights[key], 0);
  return Math.max(0, Math.min(100, Math.round(weighted / positiveWeight)));
}

export function impactAnalysis(workspace: SkillWorkspace, entityId: string) {
  const skills = workspace.skills.filter((skill) => skill.groupId === entityId || skill.id === entityId);
  const skillIds = new Set(skills.map((skill) => skill.id));
  if (workspace.skills.some((skill) => skill.id === entityId)) skillIds.add(entityId);
  const mappings = workspace.mappings.filter((mapping) => skillIds.has(mapping.skillId));
  const profiles = workspace.profiles.filter((profile) => profile.skills.some((skill) => skillIds.has(skill.skillId)));
  const tools = workspace.tools.filter((tool) => tool.skillIds.some((id) => skillIds.has(id)));
  const relationships = workspace.relationships.filter((relationship) => relationship.sourceId === entityId || relationship.targetId === entityId || skillIds.has(relationship.sourceId) || skillIds.has(relationship.targetId));
  const jobs = workspace.jobDescriptions.filter((job) => mappings.some((mapping) => mapping.jobDescriptionId === job.id));
  const evidenceRecords = workspace.evidenceRecords.filter((evidence) => evidence.id === entityId || evidence.sourceId === entityId || evidence.supportedEntityIds.includes(entityId) || evidence.supportedEntityIds.some((id) => skillIds.has(id)));
  const sourceIds = new Set(evidenceRecords.map((evidence) => evidence.sourceId));
  const sources = workspace.sources.filter((source) => source.id === entityId || sourceIds.has(source.id));
  const selectedProfile = workspace.profiles.find((profile) => profile.id === entityId);
  const profileSkillIds = new Set(selectedProfile?.skills.map((link) => link.skillId) || []);
  const profileJobs = selectedProfile
    ? workspace.jobDescriptions.filter((job) => job.id === selectedProfile.jobDescriptionId)
    : [];
  const profileMappings = selectedProfile
    ? workspace.mappings.filter((mapping) => mapping.jobDescriptionId === selectedProfile.jobDescriptionId || profileSkillIds.has(mapping.skillId))
    : [];
  const selectedTool = workspace.tools.find((tool) => tool.id === entityId);
  const toolSkills = selectedTool ? workspace.skills.filter((skill) => selectedTool.skillIds.includes(skill.id)) : [];
  const toolMappings = selectedTool ? workspace.mappings.filter((mapping) => (mapping.toolIds || []).includes(selectedTool.id)) : [];
  const selectedAgentTool = workspace.agentTools.find((tool) => tool.id === entityId);
  const agentToolRuns = selectedAgentTool ? workspace.agentRuns.filter((run) => run.tools.includes(selectedAgentTool.id) || (run.invocations || []).some((invocation) => invocation.toolId === selectedAgentTool.id)) : [];
  const agentToolInvocations = selectedAgentTool ? workspace.agentRuns.flatMap((run) => run.invocations || []).filter((invocation) => invocation.toolId === selectedAgentTool.id) : [];
  const selectedKflaFactor = workspace.kflaFactors.find((item) => item.id === entityId);
  const selectedKflaCluster = workspace.kflaClusters.find((item) => item.id === entityId);
  const selectedKflaCompetency = workspace.kfla.find((item) => item.id === entityId);
  const kflaClusters = selectedKflaFactor ? workspace.kflaClusters.filter((item) => item.factorId === selectedKflaFactor.id) : selectedKflaCluster ? [selectedKflaCluster] : [];
  const clusterIds = new Set(kflaClusters.map((item) => item.id));
  const kflaCompetencies = selectedKflaCompetency ? [selectedKflaCompetency] : workspace.kfla.filter((item) => clusterIds.has(item.clusterId));
  const kflaCompetencyIds = new Set(kflaCompetencies.map((item) => item.id));
  const kflaSkills = workspace.skills.filter((skill) => Boolean(skill.kflaCompetencyId && kflaCompetencyIds.has(skill.kflaCompetencyId)));
  const kflaSkillIds = new Set(kflaSkills.map((skill) => skill.id));
  const kflaMappings = workspace.mappings.filter((mapping) => kflaSkillIds.has(mapping.skillId));
  const kflaJobIds = new Set(kflaMappings.map((mapping) => mapping.jobDescriptionId));
  const kflaJobs = workspace.jobDescriptions.filter((job) => kflaJobIds.has(job.id));
  const selectedDomain = workspace.domains.find((item) => item.id === entityId);
  const selectedGroup = workspace.groups.find((item) => item.id === entityId);
  const taxonomyGroups = selectedDomain ? workspace.groups.filter((item) => item.domainId === selectedDomain.id) : selectedGroup ? [selectedGroup] : [];
  const taxonomyGroupIds = new Set(taxonomyGroups.map((item) => item.id));
  const taxonomySkills = workspace.skills.filter((skill) => taxonomyGroupIds.has(skill.groupId));
  const taxonomySkillIds = new Set(taxonomySkills.map((skill) => skill.id));
  const taxonomyMappings = workspace.mappings.filter((mapping) => taxonomySkillIds.has(mapping.skillId));
  const taxonomyProfiles = workspace.profiles.filter((profile) => profile.skills.some((link) => taxonomySkillIds.has(link.skillId)));
  const taxonomyTools = workspace.tools.filter((tool) => tool.skillIds.some((id) => taxonomySkillIds.has(id)));
  const taxonomyRelationships = workspace.relationships.filter((relationship) => taxonomySkillIds.has(relationship.sourceId) || taxonomySkillIds.has(relationship.targetId));
  const taxonomyJobIds = new Set(taxonomyMappings.map((mapping) => mapping.jobDescriptionId));
  const taxonomyJobs = workspace.jobDescriptions.filter((job) => taxonomyJobIds.has(job.id));
  return {
    skills,
    mappings,
    profiles,
    tools,
    relationships,
    jobs,
    evidenceRecords,
    sources,
    selectedProfile,
    profileJobs,
    profileMappings,
    selectedTool,
    toolSkills,
    toolMappings,
    selectedAgentTool,
    agentToolRuns,
    agentToolInvocations,
    selectedKflaFactor,
    selectedKflaCluster,
    selectedKflaCompetency,
    kflaClusters,
    kflaCompetencies,
    kflaSkills,
    kflaMappings,
    kflaJobs,
    selectedDomain,
    selectedGroup,
    taxonomyGroups,
    taxonomySkills,
    taxonomyMappings,
    taxonomyProfiles,
    taxonomyTools,
    taxonomyRelationships,
    taxonomyJobs,
    dependencyCount: skills.length + mappings.length + profiles.length + tools.length + relationships.length + jobs.length + evidenceRecords.length + sources.length + profileJobs.length + profileMappings.length + toolSkills.length + toolMappings.length + agentToolRuns.length + agentToolInvocations.length + kflaClusters.length + kflaCompetencies.length + kflaSkills.length + kflaMappings.length + kflaJobs.length + (selectedDomain ? taxonomyGroups.length + taxonomySkills.length + taxonomyMappings.length + taxonomyProfiles.length + taxonomyTools.length + taxonomyRelationships.length + taxonomyJobs.length : 0),
  };
}

export type TaxonomyNodeKind = "domain" | "group";
export type TaxonomyNodeLifecycleAction = "duplicate" | "archive" | "restore" | "deprecate" | "replace" | "merge" | "move";
export type TaxonomyNodeLifecycleRequest = { kind: TaxonomyNodeKind; action: TaxonomyNodeLifecycleAction; entityId: string; actor: string; reason: string; targetId?: string; parentId?: string; newId?: string };
export type TaxonomyNodeDefinitionRequest = { kind: TaxonomyNodeKind; entityId?: string; name: string; description: string; domainId?: string; actor: string; reason: string };

function executeTaxonomyNodeDefinition(workspace: SkillWorkspace, request: TaxonomyNodeDefinitionRequest, reviewer: string, decisionReason: string): SkillWorkspace {
  const id = request.entityId!;
  const exists = request.kind === "domain" ? workspace.domains.some((item) => item.id === id) : workspace.groups.some((item) => item.id === id);
  const at = new Date().toISOString();
  const current = request.kind === "domain" ? workspace.domains.find((item) => item.id === id) : workspace.groups.find((item) => item.id === id);
  const governance = { version: (current?.governance?.version || 0) + 1, createdAt: current?.governance?.createdAt || at, updatedAt: at, createdBy: current?.governance?.createdBy || request.actor, updatedBy: reviewer };
  const record = { id, name: request.name.trim(), description: request.description.trim(), status: "approved" as const, governance };
  const next = request.kind === "domain"
    ? { ...workspace, domains: exists ? workspace.domains.map((item) => item.id === id ? record : item) : [...workspace.domains, record] }
    : { ...workspace, groups: exists ? workspace.groups.map((item) => item.id === id ? { ...record, domainId: request.domainId! } : item) : [...workspace.groups, { ...record, domainId: request.domainId! }] };
  return recordGovernedVersion(next, request.kind, id, exists ? "taxonomy.definition_updated.approved" : "taxonomy.created.approved", reviewer, { requestedBy: request.actor, requestReason: request.reason, decisionReason, name: record.name, description: record.description, domainId: request.domainId });
}

export function requestTaxonomyNodeDefinition(workspace: SkillWorkspace, request: TaxonomyNodeDefinitionRequest): SkillWorkspace {
  if (!request.actor.trim()) throw new Error("An accountable actor is required.");
  if (!request.reason.trim()) throw new Error("A governance reason is required.");
  if (!request.name.trim() || !request.description.trim()) throw new Error("Canonical name and definition are required.");
  if (request.kind === "group" && !workspace.domains.some((item) => item.id === request.domainId && !["archived", "retired"].includes(item.status))) throw new Error("An active parent domain is required.");
  const id = request.entityId || `${request.kind === "domain" ? "DOM" : "GRP"}-${Date.now()}`;
  if (!request.entityId && [...workspace.domains, ...workspace.groups].some((item) => item.id === id)) throw new Error(`Taxonomy node ${id} already exists.`);
  const normalized = { ...request, entityId: id };
  const review: ReviewItem = { id: `REV-TAXONOMY-DEFINITION-${id}-${Date.now()}`, title: `${request.entityId ? "Update" : "Create"} taxonomy ${request.kind}: ${request.name.trim()}`, type: "taxonomy_change", summary: `${request.entityId ? "Definition change" : "New canonical node"} requires accountable approval before it enters the active hierarchy.`, confidence: 100, evidence: request.reason.trim(), explanation: "The candidate definition is stored in the review payload; the active taxonomy is unchanged until approval.", frameworkVersion: workspace.framework.version, rulesVersion: workspace.framework.rulesVersion, status: "pending", entityId: id, payload: { operation: "taxonomy_node_definition", ...normalized } };
  return recordGovernedVersion({ ...workspace, reviewQueue: [review, ...workspace.reviewQueue] }, request.kind, id, "taxonomy.definition_requested", request.actor.trim(), { ...review.payload, reviewId: review.id });
}

function assertTaxonomyNodeLifecycle(workspace: SkillWorkspace, request: TaxonomyNodeLifecycleRequest) {
  if (!request.actor.trim()) throw new Error("An accountable actor is required.");
  if (!request.reason.trim()) throw new Error("A governance reason is required.");
  const exists = request.kind === "domain" ? workspace.domains.some((item) => item.id === request.entityId) : workspace.groups.some((item) => item.id === request.entityId);
  if (!exists) throw new Error("Taxonomy node not found.");
  if (request.action === "move" && request.kind === "domain") throw new Error("A domain has no movable parent.");
  if (["replace", "merge"].includes(request.action) && (!request.targetId || request.targetId === request.entityId)) throw new Error("A distinct governed target is required.");
  if (request.action === "move" && !request.parentId) throw new Error("A destination domain is required.");
}

function executeTaxonomyNodeLifecycle(workspace: SkillWorkspace, request: TaxonomyNodeLifecycleRequest, reviewer: string, decisionReason: string): SkillWorkspace {
  const at = new Date().toISOString();
  const governance = (current: { governance?: { version: number; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; replacedById?: string } }, replacementId?: string) => ({ version: (current.governance?.version || 0) + 1, createdAt: current.governance?.createdAt || workspace.updatedAt, updatedAt: at, createdBy: current.governance?.createdBy || request.actor, updatedBy: reviewer, replacedById: replacementId });
  let next = workspace;
  if (request.kind === "domain") {
    const source = workspace.domains.find((item) => item.id === request.entityId)!;
    if (["replace", "merge"].includes(request.action)) {
      const target = workspace.domains.find((item) => item.id === request.targetId && item.id !== source.id && !["archived", "retired"].includes(item.status));
      if (!target) throw new Error("Target domain not found.");
      next = { ...workspace, domains: workspace.domains.map((item) => item.id === source.id ? { ...item, status: request.action === "merge" ? "archived" : "retired", governance: governance(item, target.id) } : item.id === target.id ? { ...item, status: "approved" } : item), groups: workspace.groups.map((item) => item.domainId === source.id ? { ...item, domainId: target.id } : item) };
    } else {
      const status = request.action === "archive" ? "archived" as const : request.action === "deprecate" ? "deprecated" as const : "approved" as const;
      next = { ...workspace, domains: workspace.domains.map((item) => item.id === source.id ? { ...item, status, governance: governance(item) } : item) };
    }
  } else {
    const source = workspace.groups.find((item) => item.id === request.entityId)!;
    if (request.action === "move") {
      const parent = workspace.domains.find((item) => item.id === request.parentId && !["archived", "retired"].includes(item.status));
      if (!parent) throw new Error("Destination domain not found.");
      next = { ...workspace, groups: workspace.groups.map((item) => item.id === source.id ? { ...item, domainId: parent.id, status: "approved", governance: governance(item) } : item) };
    } else if (["replace", "merge"].includes(request.action)) {
      const target = workspace.groups.find((item) => item.id === request.targetId && item.id !== source.id && !["archived", "retired"].includes(item.status));
      if (!target) throw new Error("Target group not found.");
      next = { ...workspace, groups: workspace.groups.map((item) => item.id === source.id ? { ...item, status: request.action === "merge" ? "archived" : "retired", governance: governance(item, target.id) } : item.id === target.id ? { ...item, status: "approved" } : item), skills: workspace.skills.map((skill) => skill.groupId === source.id ? { ...skill, groupId: target.id } : skill) };
    } else {
      const status = request.action === "archive" ? "archived" as const : request.action === "deprecate" ? "deprecated" as const : "approved" as const;
      next = { ...workspace, groups: workspace.groups.map((item) => item.id === source.id ? { ...item, status, governance: governance(item) } : item) };
    }
  }
  const impact = impactAnalysis(workspace, request.entityId);
  return recordGovernedVersion(next, request.kind, request.entityId, `taxonomy.${request.action}.approved`, reviewer, { requestedBy: request.actor, requestReason: request.reason, decisionReason, targetId: request.targetId, parentId: request.parentId, affectedGroups: impact.taxonomyGroups.length, affectedSkills: impact.taxonomySkills.length, affectedMappings: impact.taxonomyMappings.length, affectedProfiles: impact.taxonomyProfiles.length, affectedTools: impact.taxonomyTools.length, affectedRelationships: impact.taxonomyRelationships.length, affectedJobs: impact.taxonomyJobs.length });
}

export function requestTaxonomyNodeLifecycle(workspace: SkillWorkspace, request: TaxonomyNodeLifecycleRequest): SkillWorkspace {
  assertTaxonomyNodeLifecycle(workspace, request);
  const source = request.kind === "domain" ? workspace.domains.find((item) => item.id === request.entityId)! : workspace.groups.find((item) => item.id === request.entityId)!;
  const impact = impactAnalysis(workspace, request.entityId);
  if (request.action === "duplicate") {
    const id = request.newId?.trim() || `${request.kind === "domain" ? "DOM" : "GRP"}-${Date.now()}`;
    if ([...workspace.domains, ...workspace.groups].some((item) => item.id === id)) throw new Error(`Taxonomy node ${id} already exists.`);
    const duplicate = { ...source, id, name: `${source.name} copy`, status: "draft" as const, governance: undefined };
    const next = request.kind === "domain" ? { ...workspace, domains: [...workspace.domains, duplicate] } : { ...workspace, groups: [...workspace.groups, duplicate as typeof workspace.groups[number]] };
    return recordGovernedVersion(next, request.kind, id, "taxonomy.duplicated", request.actor.trim(), { ...duplicate, sourceId: source.id, reason: request.reason.trim(), affectedSkills: impact.taxonomySkills.length } as unknown as Record<string, unknown>);
  }
  const review: ReviewItem = { id: `REV-TAXONOMY-${request.kind}-${request.entityId}-${Date.now()}`, title: `${request.action} taxonomy ${request.kind} ${source.name}`, type: "taxonomy_change", summary: `${impact.taxonomyGroups.length} groups, ${impact.taxonomySkills.length} skills, ${impact.taxonomyMappings.length} mappings, ${impact.taxonomyProfiles.length} profiles, ${impact.taxonomyTools.length} tools, ${impact.taxonomyRelationships.length} relationships and ${impact.taxonomyJobs.length} jobs are in scope.`, confidence: 100, evidence: request.reason.trim(), explanation: "The structural mutation is not applied until an accountable reviewer approves this request.", frameworkVersion: workspace.framework.version, rulesVersion: workspace.framework.rulesVersion, status: "pending", entityId: request.entityId, payload: { operation: "taxonomy_node_lifecycle", ...request } };
  return recordGovernedVersion({ ...workspace, reviewQueue: [review, ...workspace.reviewQueue] }, request.kind, request.entityId, "taxonomy.lifecycle_requested", request.actor.trim(), { ...review.payload, reviewId: review.id, impact: review.summary });
}

export type KflaLifecycleKind = "factor" | "cluster" | "competency";
export type KflaLifecycleAction = "archive" | "restore" | "deprecate" | "replace" | "move";
export type KflaLifecycleRequest = { kind: KflaLifecycleKind; action: KflaLifecycleAction; entityId: string; actor: string; reason: string; targetId?: string; parentId?: string };
export type KflaMetadataRequest = {
  kind: KflaLifecycleKind;
  entityId: string;
  candidate: KflaFactor | KflaCluster | KflaCompetency;
  actor: string;
  reason: string;
};

function kflaMetadataRecord(workspace: SkillWorkspace, kind: KflaLifecycleKind, entityId: string) {
  return kind === "factor"
    ? workspace.kflaFactors.find((item) => item.id === entityId)
    : kind === "cluster"
      ? workspace.kflaClusters.find((item) => item.id === entityId)
      : workspace.kfla.find((item) => item.id === entityId);
}

function assertKflaMetadataRequest(workspace: SkillWorkspace, request: KflaMetadataRequest) {
  if (!request.actor.trim()) throw new Error("An accountable proposer is required.");
  if (!request.reason.trim()) throw new Error("An evidence-based governance reason is required.");
  const current = kflaMetadataRecord(workspace, request.kind, request.entityId);
  if (!current) throw new Error("KFLA record not found.");
  if (request.candidate.id !== request.entityId || request.candidate.name !== current.name) throw new Error("Canonical KFLA identity cannot be changed through metadata review.");
  if (request.kind === "cluster") {
    const candidate = request.candidate as KflaCluster;
    if (!workspace.kflaFactors.some((item) => item.id === candidate.factorId && !["archived", "retired"].includes(item.status))) throw new Error("An active KFLA factor is required.");
  }
  if (request.kind === "competency") {
    const candidate = request.candidate as KflaCompetency;
    const currentCompetency = current as KflaCompetency;
    if (candidate.number !== currentCompetency.number) throw new Error("Canonical KFLA number cannot be changed through metadata review.");
    if (!workspace.kflaClusters.some((item) => item.id === candidate.clusterId && !["archived", "retired"].includes(item.status))) throw new Error("An active KFLA cluster is required.");
  }
}

export function requestKflaMetadataReview(workspace: SkillWorkspace, request: KflaMetadataRequest): SkillWorkspace {
  assertKflaMetadataRequest(workspace, request);
  const impact = impactAnalysis(workspace, request.entityId);
  const review: ReviewItem = {
    id: `REV-KFLA-METADATA-${request.kind}-${request.entityId}-${Date.now()}`,
    title: `Update KFLA ${request.kind} metadata: ${request.candidate.name}`,
    type: "taxonomy_change",
    summary: `${impact.kflaClusters.length} clusters, ${impact.kflaCompetencies.length} competencies, ${impact.kflaSkills.length} skills, ${impact.kflaMappings.length} mappings and ${impact.kflaJobs.length} jobs are in scope.`,
    confidence: 100,
    evidence: request.reason.trim(),
    explanation: "The complete public-safe candidate is retained in the review payload; the active KFLA reference remains unchanged until approval.",
    frameworkVersion: workspace.framework.version,
    rulesVersion: workspace.framework.rulesVersion,
    status: "pending",
    entityId: request.entityId,
    payload: { operation: "kfla_metadata_review", ...request, candidate: request.candidate as unknown as Record<string, unknown> },
  };
  return recordGovernedVersion({ ...workspace, reviewQueue: [review, ...workspace.reviewQueue] }, `kfla_${request.kind}`, request.entityId, "kfla.metadata_review_requested", request.actor.trim(), { reviewId: review.id, reason: request.reason.trim(), candidate: request.candidate as unknown as Record<string, unknown> });
}

function executeKflaMetadataReview(workspace: SkillWorkspace, request: KflaMetadataRequest, reviewer: string, decisionReason: string): SkillWorkspace {
  assertKflaMetadataRequest(workspace, request);
  const current = kflaMetadataRecord(workspace, request.kind, request.entityId)!;
  const at = new Date().toISOString();
  const governance = { version: (current.governance?.version || 0) + 1, createdAt: current.governance?.createdAt || workspace.updatedAt, updatedAt: at, createdBy: current.governance?.createdBy || request.actor.trim(), updatedBy: reviewer };
  let next = workspace;
  if (request.kind === "factor") {
    const candidate = request.candidate as KflaFactor;
    next = { ...workspace, kflaFactors: workspace.kflaFactors.map((item) => item.id === request.entityId ? { ...candidate, governance } : item) };
  } else if (request.kind === "cluster") {
    const candidate = request.candidate as KflaCluster;
    const factor = workspace.kflaFactors.find((item) => item.id === candidate.factorId)!;
    next = {
      ...workspace,
      kflaClusters: workspace.kflaClusters.map((item) => item.id === request.entityId ? { ...candidate, governance } : item),
      kfla: workspace.kfla.map((item) => item.clusterId === request.entityId ? { ...item, factorId: factor.id, factor: factor.name } : item),
    };
  } else {
    const candidate = request.candidate as KflaCompetency;
    const cluster = workspace.kflaClusters.find((item) => item.id === candidate.clusterId)!;
    const factor = workspace.kflaFactors.find((item) => item.id === cluster.factorId)!;
    next = { ...workspace, kfla: workspace.kfla.map((item) => item.id === request.entityId ? { ...candidate, factorId: factor.id, factor: factor.name, governance } : item) };
  }
  return recordGovernedVersion(next, `kfla_${request.kind}`, request.entityId, "kfla.metadata_updated.approved", reviewer, { requestedBy: request.actor.trim(), requestReason: request.reason.trim(), decisionReason, candidate: request.candidate as unknown as Record<string, unknown> });
}

function assertKflaLifecycle(workspace: SkillWorkspace, request: KflaLifecycleRequest) {
  if (!request.actor.trim()) throw new Error("An accountable actor is required.");
  if (!request.reason.trim()) throw new Error("A governance reason is required.");
  const exists = request.kind === "factor" ? workspace.kflaFactors.some((item) => item.id === request.entityId) : request.kind === "cluster" ? workspace.kflaClusters.some((item) => item.id === request.entityId) : workspace.kfla.some((item) => item.id === request.entityId);
  if (!exists) throw new Error("KFLA record not found.");
  if (request.action === "move" && request.kind === "factor") throw new Error("A canonical KFLA factor has no movable parent.");
  if (request.action === "replace" && (!request.targetId || request.targetId === request.entityId)) throw new Error("A distinct replacement is required.");
  if (request.action === "move" && !request.parentId) throw new Error("A governed destination is required.");
}

function executeKflaLifecycle(workspace: SkillWorkspace, request: KflaLifecycleRequest, reviewer: string, decisionReason: string): SkillWorkspace {
  const at = new Date().toISOString();
  const governance = (current: { governance?: { version: number; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; replacedById?: string } }, replacementId?: string) => ({ version: (current.governance?.version || 0) + 1, createdAt: current.governance?.createdAt || workspace.updatedAt, updatedAt: at, createdBy: current.governance?.createdBy || request.actor, updatedBy: reviewer, replacedById: replacementId });
  let next = workspace;
  if (request.kind === "factor") {
    const source = workspace.kflaFactors.find((item) => item.id === request.entityId)!;
    if (request.action === "replace") {
      const target = workspace.kflaFactors.find((item) => item.id === request.targetId);
      if (!target) throw new Error("Replacement factor not found.");
      next = { ...workspace, kflaFactors: workspace.kflaFactors.map((item) => item.id === source.id ? { ...item, status: "approved", governance: governance(item, target.id) } : item.id === target.id ? { ...item, status: "approved" } : item), kflaClusters: workspace.kflaClusters.map((item) => item.factorId === source.id ? { ...item, factorId: target.id, status: "approved" } : item), kfla: workspace.kfla.map((item) => item.factorId === source.id ? { ...item, factorId: target.id, factor: target.name, reviewStatus: "internal_review" } : item) };
    } else {
      const status = request.action === "archive" ? "archived" as const : request.action === "deprecate" ? "deprecated" as const : "approved" as const;
      next = { ...workspace, kflaFactors: workspace.kflaFactors.map((item) => item.id === source.id ? { ...item, status, governance: governance(item) } : item) };
    }
  } else if (request.kind === "cluster") {
    const source = workspace.kflaClusters.find((item) => item.id === request.entityId)!;
    if (request.action === "move") {
      const targetFactor = workspace.kflaFactors.find((item) => item.id === request.parentId && !["archived", "retired"].includes(item.status));
      if (!targetFactor) throw new Error("Destination factor not found.");
      next = { ...workspace, kflaClusters: workspace.kflaClusters.map((item) => item.id === source.id ? { ...item, factorId: targetFactor.id, status: "approved", governance: governance(item) } : item), kfla: workspace.kfla.map((item) => item.clusterId === source.id ? { ...item, factorId: targetFactor.id, factor: targetFactor.name, reviewStatus: "internal_review" } : item) };
    } else if (request.action === "replace") {
      const target = workspace.kflaClusters.find((item) => item.id === request.targetId);
      const targetFactor = workspace.kflaFactors.find((item) => item.id === target?.factorId);
      if (!target || !targetFactor) throw new Error("Replacement cluster not found.");
      next = { ...workspace, kflaClusters: workspace.kflaClusters.map((item) => item.id === source.id ? { ...item, status: "approved", governance: governance(item, target.id) } : item.id === target.id ? { ...item, status: "approved" } : item), kfla: workspace.kfla.map((item) => item.clusterId === source.id ? { ...item, clusterId: target.id, factorId: targetFactor.id, factor: targetFactor.name, reviewStatus: "internal_review" } : item) };
    } else {
      const status = request.action === "archive" ? "archived" as const : request.action === "deprecate" ? "deprecated" as const : "approved" as const;
      next = { ...workspace, kflaClusters: workspace.kflaClusters.map((item) => item.id === source.id ? { ...item, status, governance: governance(item) } : item) };
    }
  } else {
    const source = workspace.kfla.find((item) => item.id === request.entityId)!;
    if (request.action === "move") {
      const targetCluster = workspace.kflaClusters.find((item) => item.id === request.parentId && !["archived", "retired"].includes(item.status));
      const targetFactor = workspace.kflaFactors.find((item) => item.id === targetCluster?.factorId);
      if (!targetCluster || !targetFactor) throw new Error("Destination cluster not found.");
      next = { ...workspace, kfla: workspace.kfla.map((item) => item.id === source.id ? { ...item, clusterId: targetCluster.id, factorId: targetFactor.id, factor: targetFactor.name, reviewStatus: "internal_review", governance: governance(item) } : item) };
    } else if (request.action === "replace") {
      const target = workspace.kfla.find((item) => item.id === request.targetId);
      if (!target) throw new Error("Replacement competency not found.");
      next = { ...workspace, kfla: workspace.kfla.map((item) => item.id === source.id ? { ...item, enabled: true, reviewStatus: "internal_review", governance: governance(item, target.id) } : item.id === target.id ? { ...item, enabled: true, reviewStatus: "internal_review", relatedCompetencyIds: unique([...item.relatedCompetencyIds, source.id]) } : item), skills: workspace.skills.map((skill) => skill.kflaCompetencyId === source.id ? { ...skill, kflaCompetencyId: target.id, status: "in_review" } : skill) };
    } else {
      const enabled = request.action === "restore";
      next = { ...workspace, kfla: workspace.kfla.map((item) => item.id === source.id ? { ...item, enabled, reviewStatus: "internal_review", governance: governance(item) } : item) };
    }
  }
  const impact = impactAnalysis(workspace, request.entityId);
  return recordGovernedVersion(next, `kfla_${request.kind}`, request.entityId, `kfla.${request.action}.approved`, reviewer, { requestedBy: request.actor, requestReason: request.reason, decisionReason, targetId: request.targetId, parentId: request.parentId, affectedClusters: impact.kflaClusters.length, affectedCompetencies: impact.kflaCompetencies.length, affectedSkills: impact.kflaSkills.length, affectedMappings: impact.kflaMappings.length, affectedJobs: impact.kflaJobs.length });
}

export function proposeKflaLifecycle(workspace: SkillWorkspace, request: KflaLifecycleRequest): SkillWorkspace {
  assertKflaLifecycle(workspace, request);
  const impact = impactAnalysis(workspace, request.entityId);
  const review: ReviewItem = { id: `REV-KFLA-${request.kind}-${request.entityId}-${Date.now()}`, title: `${request.action} KFLA ${request.kind} ${request.entityId}`, type: "taxonomy_change", summary: `${impact.kflaClusters.length} clusters, ${impact.kflaCompetencies.length} competencies, ${impact.kflaSkills.length} skills, ${impact.kflaMappings.length} mappings and ${impact.kflaJobs.length} jobs are in scope.`, confidence: 100, evidence: request.reason.trim(), explanation: "The structural mutation is not applied until an accountable reviewer approves this request.", frameworkVersion: workspace.framework.version, rulesVersion: workspace.framework.rulesVersion, status: "pending", entityId: request.entityId, payload: { operation: "kfla_lifecycle", ...request } };
  return recordGovernedVersion({ ...workspace, reviewQueue: [review, ...workspace.reviewQueue] }, `kfla_${request.kind}`, request.entityId, "kfla.lifecycle_requested", request.actor.trim(), { ...review.payload, reviewId: review.id, impact: review.summary });
}

function agentToolReview(workspace: SkillWorkspace, tool: AgentToolDefinition, actor: string, reason: string): ReviewItem {
  return {
    id: `REV-AGENT-${tool.id}-${Date.now()}`,
    title: `Approve agent tool: ${tool.name}`,
    type: "taxonomy_change",
    summary: `Review callable contract ${tool.id} v${tool.version} before activation.`,
    confidence: 100,
    evidence: reason,
    explanation: `Submitted by ${actor}. Activation remains human-controlled.`,
    frameworkVersion: workspace.framework.version,
    rulesVersion: workspace.framework.rulesVersion,
    status: "pending",
    entityId: tool.id,
    payload: { lifecycleStatus: tool.lifecycleStatus, requiredPermission: tool.requiredPermission, version: tool.version },
  };
}

export function saveAgentToolDefinition(workspace: SkillWorkspace, tool: AgentToolDefinition, actor: string, reason: string): SkillWorkspace {
  if (!actor.trim()) throw new Error("An accountable actor is required.");
  if (!reason.trim()) throw new Error("A governance reason is required.");
  const exists = workspace.agentTools.some((candidate) => candidate.id === tool.id);
  const value = { ...tool, lifecycleStatus: "draft" as const };
  const review = agentToolReview(workspace, value, actor.trim(), reason.trim());
  const next = {
    ...workspace,
    agentTools: exists ? workspace.agentTools.map((candidate) => candidate.id === value.id ? value : candidate) : [value, ...workspace.agentTools],
    reviewQueue: [review, ...workspace.reviewQueue],
  };
  return recordGovernedVersion(next, "agent_tool", value.id, exists ? "agent_tool.updated_for_review" : "agent_tool.registered_for_review", actor.trim(), { ...value, governanceReason: reason.trim(), reviewId: review.id } as unknown as Record<string, unknown>);
}

export type AgentToolLifecycleAction = "duplicate" | "disable" | "restore" | "deprecate" | "replace" | "merge";
export type AgentToolLifecycleRequest = { action: AgentToolLifecycleAction; toolId: string; actor: string; reason: string; targetToolId?: string; newToolId?: string };

export function applyAgentToolLifecycle(workspace: SkillWorkspace, request: AgentToolLifecycleRequest): SkillWorkspace {
  const actor = request.actor.trim();
  const reason = request.reason.trim();
  if (!actor) throw new Error("An accountable actor is required.");
  if (!reason) throw new Error("A governance reason is required.");
  const source = workspace.agentTools.find((tool) => tool.id === request.toolId);
  if (!source) throw new Error("Agent tool not found.");
  const impact = impactAnalysis(workspace, source.id);

  if (request.action === "duplicate") {
    const id = request.newToolId?.trim() || `custom_tool_${Date.now()}`;
    if (workspace.agentTools.some((tool) => tool.id === id)) throw new Error(`Agent tool ${id} already exists.`);
    const duplicate: AgentToolDefinition = { ...source, id, name: `${source.name} copy`, lifecycleStatus: "draft", supersedesToolIds: [], replacementToolId: undefined };
    return recordGovernedVersion({ ...workspace, agentTools: [duplicate, ...workspace.agentTools] }, "agent_tool", id, "agent_tool.duplicated", actor, { ...duplicate, sourceToolId: source.id, reason } as unknown as Record<string, unknown>);
  }

  if (["disable", "deprecate"].includes(request.action)) {
    const lifecycleStatus = request.action === "disable" ? "disabled" as const : "deprecated" as const;
    const value = { ...source, lifecycleStatus };
    return recordGovernedVersion({ ...workspace, agentTools: workspace.agentTools.map((tool) => tool.id === source.id ? value : tool) }, "agent_tool", source.id, `agent_tool.${request.action}d`, actor, { ...value, reason, affectedRuns: impact.agentToolRuns.length, historicalInvocationsPreserved: impact.agentToolInvocations.length } as unknown as Record<string, unknown>);
  }

  if (request.action === "restore") {
    const value = { ...source, lifecycleStatus: "draft" as const, replacementToolId: undefined };
    const review = agentToolReview(workspace, value, actor, reason);
    return recordGovernedVersion({ ...workspace, agentTools: workspace.agentTools.map((tool) => tool.id === source.id ? value : tool), reviewQueue: [review, ...workspace.reviewQueue] }, "agent_tool", source.id, "agent_tool.restored_for_review", actor, { ...value, reason, reviewId: review.id } as unknown as Record<string, unknown>);
  }

  const target = workspace.agentTools.find((tool) => tool.id === request.targetToolId && tool.id !== source.id && !["deprecated", "disabled"].includes(tool.lifecycleStatus));
  if (!target) throw new Error("An active or draft target agent tool is required.");
  const mergedTarget: AgentToolDefinition = request.action === "merge" ? {
    ...target,
    lifecycleStatus: "draft",
    allowedDataClassifications: unique([...target.allowedDataClassifications, ...source.allowedDataClassifications]).filter((classification) => classification !== "licensed") as DataClassification[],
    allowedAgentActions: unique([...target.allowedAgentActions, ...source.allowedAgentActions]),
    auditRequirements: unique([...target.auditRequirements, ...source.auditRequirements]),
    retryPolicy: { ...target.retryPolicy, retryableErrors: unique([...target.retryPolicy.retryableErrors, ...source.retryPolicy.retryableErrors]) },
    errorContract: { ...target.errorContract, codes: unique([...target.errorContract.codes, ...source.errorContract.codes]), redactInputs: target.errorContract.redactInputs || source.errorContract.redactInputs },
    supersedesToolIds: unique([...(target.supersedesToolIds || []), source.id, ...(source.supersedesToolIds || [])]),
  } : { ...target, lifecycleStatus: "draft", supersedesToolIds: unique([...(target.supersedesToolIds || []), source.id]) };
  const retiredSource = { ...source, lifecycleStatus: request.action === "merge" ? "disabled" as const : "deprecated" as const, replacementToolId: target.id };
  const review = agentToolReview(workspace, mergedTarget, actor, reason);
  const next = {
    ...workspace,
    agentTools: workspace.agentTools.map((tool) => tool.id === source.id ? retiredSource : tool.id === target.id ? mergedTarget : tool),
    reviewQueue: [review, ...workspace.reviewQueue],
  };
  const sourceVersion = recordGovernedVersion(next, "agent_tool", source.id, `agent_tool.${request.action}d`, actor, { targetToolId: target.id, reason, affectedRuns: impact.agentToolRuns.length, historicalInvocationsPreserved: impact.agentToolInvocations.length });
  return recordGovernedVersion(sourceVersion, "agent_tool", target.id, `agent_tool.${request.action}_target_for_review`, actor, { sourceToolId: source.id, reason, reviewId: review.id });
}

export type ControlledToolLifecycleAction = "duplicate" | "archive" | "restore" | "deprecate" | "replace" | "merge";
export type ControlledToolLifecycleRequest = {
  action: ControlledToolLifecycleAction;
  toolId: string;
  actor: string;
  reason: string;
  targetToolId?: string;
  newToolId?: string;
};

export function applyControlledToolLifecycle(workspace: SkillWorkspace, request: ControlledToolLifecycleRequest): SkillWorkspace {
  const actor = request.actor.trim();
  const reason = request.reason.trim();
  if (!actor) throw new Error("An accountable actor is required.");
  if (!reason) throw new Error("A governance reason is required.");
  const source = workspace.tools.find((tool) => tool.id === request.toolId);
  if (!source) throw new Error("Controlled tool not found.");
  const impact = impactAnalysis(workspace, source.id);

  if (request.action === "duplicate") {
    const id = request.newToolId || `TOOL-${Date.now().toString().slice(-8)}`;
    if (workspace.tools.some((tool) => tool.id === id)) throw new Error(`Controlled tool ${id} already exists.`);
    const duplicate: ControlledTool = { ...source, id, name: `${source.name} copy`, aliases: [...source.aliases], skillIds: [...source.skillIds], status: "draft", governance: undefined };
    return recordGovernedVersion({ ...workspace, tools: [duplicate, ...workspace.tools] }, "controlled_tool", id, "tool.duplicated", actor, { ...duplicate, sourceToolId: source.id, reason } as unknown as Record<string, unknown>);
  }

  if (["archive", "restore", "deprecate"].includes(request.action)) {
    const status = request.action === "archive" ? "archived" as const : request.action === "restore" ? "draft" as const : "deprecated" as const;
    const next = { ...source, status };
    return recordGovernedVersion({ ...workspace, tools: workspace.tools.map((tool) => tool.id === source.id ? next : tool) }, "controlled_tool", source.id, `tool.${request.action}d`, actor, { ...next, reason, affectedMappings: impact.toolMappings.length } as unknown as Record<string, unknown>);
  }

  const target = workspace.tools.find((tool) => tool.id === request.targetToolId && tool.id !== source.id && !["archived", "retired"].includes(tool.status));
  if (!target) throw new Error("An active target controlled tool is required.");
  const replaceId = (id: string) => id === source.id ? target.id : id;
  const at = new Date().toISOString();
  const migrated = {
    ...workspace,
    tools: workspace.tools.map((tool) => tool.id === source.id
      ? { ...tool, status: request.action === "merge" ? "archived" as const : "retired" as const, governance: { version: (tool.governance?.version || 0) + 1, createdAt: tool.governance?.createdAt || workspace.updatedAt, updatedAt: at, createdBy: tool.governance?.createdBy || actor, updatedBy: actor, replacedById: target.id } }
      : tool.id === target.id
        ? { ...tool, aliases: unique([...tool.aliases, source.name, ...source.aliases]), skillIds: unique([...tool.skillIds, ...source.skillIds]), allowedAgentActions: unique([...tool.allowedAgentActions, ...source.allowedAgentActions]) as ControlledTool["allowedAgentActions"], status: "in_review" as const }
        : tool),
    mappings: workspace.mappings.map((mapping) => ({ ...mapping, toolIds: unique((mapping.toolIds || []).map(replaceId)), status: (mapping.toolIds || []).includes(source.id) ? "proposed" as const : mapping.status })),
  };
  const sourceVersion = recordGovernedVersion(migrated, "controlled_tool", source.id, `tool.${request.action}d`, actor, { targetToolId: target.id, reason, affectedMappings: impact.toolMappings.length });
  return recordGovernedVersion(sourceVersion, "controlled_tool", target.id, `tool.${request.action}_target_updated`, actor, { sourceToolId: source.id, reason, migratedSkillLinks: source.skillIds.length });
}

export type RoleProfileLifecycleAction = "duplicate" | "archive" | "restore" | "deprecate" | "replace" | "merge";
export type RoleProfileLifecycleRequest = {
  action: RoleProfileLifecycleAction;
  profileId: string;
  actor: string;
  reason: string;
  targetProfileId?: string;
  newProfileId?: string;
};

export function applyRoleProfileLifecycle(workspace: SkillWorkspace, request: RoleProfileLifecycleRequest): SkillWorkspace {
  const actor = request.actor.trim();
  const reason = request.reason.trim();
  if (!actor) throw new Error("An accountable actor is required.");
  if (!reason) throw new Error("A governance reason is required.");
  const source = workspace.profiles.find((profile) => profile.id === request.profileId);
  if (!source) throw new Error("Role profile not found.");
  const impact = impactAnalysis(workspace, source.id);

  if (request.action === "duplicate") {
    const id = request.newProfileId || `PROF-${Date.now().toString().slice(-8)}`;
    if (workspace.profiles.some((profile) => profile.id === id)) throw new Error(`Role profile ${id} already exists.`);
    const duplicate: RoleProfile = { ...source, id, title: `${source.title} copy`, status: "draft", skills: source.skills.map((link) => ({ ...link })), governance: undefined };
    return recordGovernedVersion({ ...workspace, profiles: [duplicate, ...workspace.profiles] }, "role_profile", id, "profile.duplicated", actor, { ...duplicate, sourceProfileId: source.id, reason } as unknown as Record<string, unknown>);
  }

  if (["archive", "restore", "deprecate"].includes(request.action)) {
    const status = request.action === "archive" ? "archived" as const : request.action === "restore" ? "draft" as const : "deprecated" as const;
    const next = { ...source, status };
    return recordGovernedVersion({ ...workspace, profiles: workspace.profiles.map((profile) => profile.id === source.id ? next : profile) }, "role_profile", source.id, `profile.${request.action}d`, actor, { ...next, reason, affectedMappings: impact.profileMappings.length } as unknown as Record<string, unknown>);
  }

  const target = workspace.profiles.find((profile) => profile.id === request.targetProfileId && profile.id !== source.id && !["archived", "retired"].includes(profile.status));
  if (!target) throw new Error("An active target role profile is required.");
  const mergedSkills = [...target.skills];
  for (const link of source.skills) {
    const existing = mergedSkills.find((candidate) => candidate.skillId === link.skillId);
    if (!existing) mergedSkills.push({ ...link });
    else Object.assign(existing, {
      targetLevel: Math.max(existing.targetLevel, link.targetLevel) as typeof existing.targetLevel,
      weight: Math.max(existing.weight, link.weight),
      critical: existing.critical || link.critical,
    });
  }
  const at = new Date().toISOString();
  const migrated = {
    ...workspace,
    profiles: workspace.profiles.map((profile) => profile.id === source.id
      ? { ...profile, status: request.action === "merge" ? "archived" as const : "retired" as const, governance: { version: (profile.governance?.version || 0) + 1, createdAt: profile.governance?.createdAt || workspace.updatedAt, updatedAt: at, createdBy: profile.governance?.createdBy || actor, updatedBy: actor, replacedById: target.id } }
      : profile.id === target.id
        ? { ...profile, skills: mergedSkills, status: "in_review" as const }
        : profile),
  };
  const sourceVersion = recordGovernedVersion(migrated, "role_profile", source.id, `profile.${request.action}d`, actor, { targetProfileId: target.id, reason, affectedMappings: impact.profileMappings.length });
  return recordGovernedVersion(sourceVersion, "role_profile", target.id, `profile.${request.action}_target_updated`, actor, { sourceProfileId: source.id, reason, migratedSkillLinks: source.skills.length });
}

export function canonicalConceptOptions(workspace: SkillWorkspace, entityType?: LocalizedConceptLabel["entityType"]) {
  const options: Array<{ entityType: LocalizedConceptLabel["entityType"]; entityId: string; canonicalLabel: string }> = [
    ...workspace.domains.map((item) => ({ entityType: "domain" as const, entityId: item.id, canonicalLabel: item.name })),
    ...workspace.groups.map((item) => ({ entityType: "group" as const, entityId: item.id, canonicalLabel: item.name })),
    ...workspace.skills.map((item) => ({ entityType: "skill" as const, entityId: item.id, canonicalLabel: item.name })),
    ...workspace.kflaFactors.map((item) => ({ entityType: "kfla_factor" as const, entityId: item.id, canonicalLabel: item.name })),
    ...workspace.kflaClusters.map((item) => ({ entityType: "kfla_cluster" as const, entityId: item.id, canonicalLabel: item.name })),
    ...workspace.kfla.map((item) => ({ entityType: "kfla_competency" as const, entityId: item.id, canonicalLabel: item.name })),
    ...workspace.tools.map((item) => ({ entityType: "controlled_tool" as const, entityId: item.id, canonicalLabel: item.name })),
  ];
  return entityType ? options.filter((item) => item.entityType === entityType) : options;
}

export function resolveLocalizedConcept(workspace: SkillWorkspace, entityType: LocalizedConceptLabel["entityType"], entityId: string, language: string) {
  const canonical = canonicalConceptOptions(workspace, entityType).find((item) => item.entityId === entityId);
  if (!canonical) return undefined;
  const localized = workspace.localizedLabels.find((item) => item.entityType === entityType && item.entityId === entityId && item.language === language && !["archived", "retired"].includes(item.status));
  return { ...canonical, language: localized ? language : workspace.framework.canonicalLanguage, label: localized?.label || canonical.canonicalLabel, description: localized?.description, fallback: !localized };
}

export function saveLocalizedConceptLabel(workspace: SkillWorkspace, value: LocalizedConceptLabel, actor: string, reason: string) {
  if (!actor.trim()) throw new Error("An accountable actor is required.");
  if (!reason.trim()) throw new Error("A governance reason is required.");
  if (!value.label.trim()) throw new Error("A localized label is required.");
  if (value.language === workspace.framework.canonicalLanguage) throw new Error("The canonical language is governed on the concept itself; choose a translation language.");
  if (!workspace.framework.supportedLanguages.includes(value.language)) throw new Error(`Language ${value.language} is not enabled by the framework.`);
  if (!canonicalConceptOptions(workspace, value.entityType).some((item) => item.entityId === value.entityId)) throw new Error("The canonical concept does not exist.");
  if (workspace.localizedLabels.some((item) => item.id !== value.id && item.entityType === value.entityType && item.entityId === value.entityId && item.language === value.language && !["archived", "retired"].includes(item.status))) throw new Error("This concept already has an active label for the selected language.");
  const exists = workspace.localizedLabels.some((item) => item.id === value.id);
  const next = { ...workspace, localizedLabels: exists ? workspace.localizedLabels.map((item) => item.id === value.id ? value : item) : [value, ...workspace.localizedLabels] };
  return recordGovernedVersion(next, "localized_label", value.id, exists ? "localized_label.updated" : "localized_label.created", actor.trim(), { ...value, reason } as unknown as Record<string, unknown>);
}

export function setLocalizedConceptLabelStatus(workspace: SkillWorkspace, id: string, status: LocalizedConceptLabel["status"], actor: string, reason: string) {
  if (!actor.trim() || !reason.trim()) throw new Error("An accountable actor and governance reason are required.");
  const current = workspace.localizedLabels.find((item) => item.id === id);
  if (!current) throw new Error("Localized label not found.");
  const next = { ...workspace, localizedLabels: workspace.localizedLabels.map((item) => item.id === id ? { ...item, status } : item) };
  return recordGovernedVersion(next, "localized_label", id, `localized_label.${status}`, actor.trim(), { ...current, status, reason });
}

export type SkillLifecycleAction = "duplicate" | "move" | "archive" | "restore" | "deprecate" | "replace" | "merge";
export type SkillLifecycleRequest = {
  action: SkillLifecycleAction;
  skillId: string;
  actor: string;
  reason: string;
  targetSkillId?: string;
  targetGroupId?: string;
  newSkillId?: string;
};

function unique(values: string[]) {
  return [...new Set(values)];
}

export function applySkillLifecycle(workspace: SkillWorkspace, request: SkillLifecycleRequest): SkillWorkspace {
  const actor = request.actor.trim();
  const reason = request.reason.trim();
  if (!actor) throw new Error("An accountable actor is required.");
  if (!reason) throw new Error("A governance reason is required.");
  const source = workspace.skills.find((skill) => skill.id === request.skillId);
  if (!source) throw new Error("Skill not found.");
  const impact = impactAnalysis(workspace, source.id);

  if (request.action === "duplicate") {
    const id = request.newSkillId || `SK-${Date.now().toString().slice(-8)}`;
    if (workspace.skills.some((skill) => skill.id === id)) throw new Error(`Skill ${id} already exists.`);
    const duplicate = { ...source, id, name: `${source.name} copy`, status: "draft" as const, governance: undefined };
    return recordGovernedVersion({ ...workspace, skills: [duplicate, ...workspace.skills] }, "skill", id, "skill.duplicated", actor, { ...duplicate, sourceSkillId: source.id, reason });
  }

  if (request.action === "move") {
    const group = workspace.groups.find((candidate) => candidate.id === request.targetGroupId && !["archived", "retired"].includes(candidate.status));
    if (!group) throw new Error("An active target group is required.");
    const moved = { ...source, groupId: group.id, status: source.status === "approved" ? "in_review" as const : source.status };
    return recordGovernedVersion({ ...workspace, skills: workspace.skills.map((skill) => skill.id === source.id ? moved : skill) }, "skill", source.id, "skill.moved", actor, { beforeGroupId: source.groupId, targetGroupId: group.id, reason, impact: impact.dependencyCount });
  }

  if (["archive", "restore", "deprecate"].includes(request.action)) {
    const status = request.action === "archive" ? "archived" as const : request.action === "restore" ? "draft" as const : "deprecated" as const;
    const updated = { ...source, status };
    return recordGovernedVersion({ ...workspace, skills: workspace.skills.map((skill) => skill.id === source.id ? updated : skill) }, "skill", source.id, `skill.${request.action}d`, actor, { status, reason, impact: impact.dependencyCount });
  }

  const target = workspace.skills.find((skill) => skill.id === request.targetSkillId && skill.id !== source.id && !["archived", "retired"].includes(skill.status));
  if (!target) throw new Error("An active target skill is required.");
  const replaceId = (id: string) => id === source.id ? target.id : id;
  const mappings = workspace.mappings.reduce<JobSkillMapping[]>((result, original) => {
    const mapping = original.skillId === source.id ? { ...original, skillId: target.id, status: "proposed" as const } : original;
    const duplicate = result.find((candidate) => candidate.jobDescriptionId === mapping.jobDescriptionId && candidate.skillId === mapping.skillId);
    if (!duplicate) return [...result, mapping];
    return result.map((candidate) => candidate.id === duplicate.id ? {
      ...candidate,
      targetLevel: Math.max(candidate.targetLevel, mapping.targetLevel) as JobSkillMapping["targetLevel"],
      weight: Math.max(candidate.weight, mapping.weight),
      critical: candidate.critical || mapping.critical,
      rationale: unique([candidate.rationale, mapping.rationale]).join(" · "),
      evidence: unique([...candidate.evidence, ...mapping.evidence]),
      strategicVectorIds: unique([...candidate.strategicVectorIds, ...mapping.strategicVectorIds]),
      toolIds: unique([...(candidate.toolIds || []), ...(mapping.toolIds || [])]),
      status: "proposed" as const,
    } : candidate);
  }, []);
  const profiles = workspace.profiles.map((profile) => {
    const links = profile.skills.reduce<typeof profile.skills>((result, original) => {
      const link = original.skillId === source.id ? { ...original, skillId: target.id } : original;
      const duplicate = result.find((candidate) => candidate.skillId === link.skillId);
      if (!duplicate) return [...result, link];
      return result.map((candidate) => candidate.skillId === duplicate.skillId ? { ...candidate, targetLevel: Math.max(candidate.targetLevel, link.targetLevel) as typeof candidate.targetLevel, weight: Math.max(candidate.weight, link.weight), critical: candidate.critical || link.critical } : candidate);
    }, []);
    return { ...profile, skills: links, status: profile.skills.some((link) => link.skillId === source.id) ? "in_review" as const : profile.status };
  });
  const relationships = workspace.relationships
    .map((relationship) => ({ ...relationship, sourceId: replaceId(relationship.sourceId), targetId: replaceId(relationship.targetId), status: relationship.sourceId === source.id || relationship.targetId === source.id ? "draft" as const : relationship.status }))
    .filter((relationship) => relationship.sourceId !== relationship.targetId)
    .filter((relationship, index, values) => values.findIndex((candidate) => candidate.sourceId === relationship.sourceId && candidate.targetId === relationship.targetId && candidate.type === relationship.type) === index);
  const relationshipId = `REL-${request.action.toUpperCase()}-${source.id}-${target.id}`;
  const migrated = {
    ...workspace,
    skills: workspace.skills.map((skill) => skill.id === source.id
      ? { ...skill, status: request.action === "merge" ? "archived" as const : "retired" as const, governance: { version: (skill.governance?.version || 0) + 1, createdAt: skill.governance?.createdAt || workspace.updatedAt, updatedAt: new Date().toISOString(), createdBy: skill.governance?.createdBy || actor, updatedBy: actor, replacedById: target.id } }
      : skill.id === target.id && request.action === "merge"
        ? { ...skill, aliases: unique([...skill.aliases, source.name, ...source.aliases]), evidence: unique([...skill.evidence, ...source.evidence]), status: "in_review" as const }
        : skill),
    mappings,
    profiles,
    tools: workspace.tools.map((tool) => ({ ...tool, skillIds: unique(tool.skillIds.map(replaceId)), status: tool.skillIds.includes(source.id) ? "in_review" as const : tool.status })),
    strategicVectors: workspace.strategicVectors.map((vector) => ({ ...vector, skillIds: unique(vector.skillIds.map(replaceId)), status: vector.skillIds.includes(source.id) ? "in_review" as const : vector.status })),
    relationships: [{ id: relationshipId, sourceId: source.id, targetId: target.id, type: request.action === "merge" ? "synonym" as const : "replacement" as const, rationale: reason, status: "draft" as const }, ...relationships],
    evidenceRecords: workspace.evidenceRecords.map((evidence) => ({ ...evidence, supportedEntityIds: unique(evidence.supportedEntityIds.map(replaceId)), status: evidence.supportedEntityIds.includes(source.id) ? "in_review" as const : evidence.status })),
  };
  const sourceVersion = recordGovernedVersion(migrated, "skill", source.id, `skill.${request.action}d`, actor, { targetSkillId: target.id, reason, impact: impact.dependencyCount });
  return recordGovernedVersion(sourceVersion, "skill", target.id, `skill.${request.action}_target_updated`, actor, { sourceSkillId: source.id, reason, migratedDependencies: impact.dependencyCount });
}

function auditEvent(action: string, review: ReviewItem, actor: string, reason: string, at: string): AuditEvent {
  return {
    id: `AUD-${review.id}-${at}`,
    at,
    actor: "human",
    actorId: actor,
    action,
    entityType: review.type,
    entityId: review.entityId || review.id,
    summary: `${review.title}: ${reason}`,
    frameworkVersion: review.frameworkVersion,
  };
}

export function decideReview(workspace: SkillWorkspace, reviewId: string, decision: Exclude<ReviewItem["status"], "pending">, actor: string, reason: string, mergeTargetId?: string): SkillWorkspace {
  if (!actor.trim()) throw new Error("An accountable reviewer is required.");
  if (!reason.trim()) throw new Error("A decision reason is required.");
  const review = workspace.reviewQueue.find((item) => item.id === reviewId);
  if (!review) throw new Error("Review item not found.");
  if (decision === "merged" && !mergeTargetId) throw new Error("A merge target is required.");
  const at = new Date().toISOString();
  const reviewQueue = workspace.reviewQueue.map((item) => item.id === reviewId ? { ...item, status: decision, mergeTargetId, decisionBy: actor.trim(), decisionAt: at, decisionReason: reason.trim() } : item);
  const approved = decision === "accepted";
  const skills = workspace.skills.map((skill) => (skill.name === review.title || skill.id === review.entityId) ? {
    ...skill,
    status: approved ? "approved" as const : decision === "rejected" ? "archived" as const : skill.status,
  } : skill);
  const mappings = workspace.mappings.map((mapping) => mapping.id === review.entityId ? {
    ...mapping,
    status: approved ? "approved" as const : decision === "rejected" ? "rejected" as const : decision === "deferred" ? "deferred" as const : mapping.status,
  } : mapping);
  const profiles = workspace.profiles.map((profile) => profile.id === review.entityId && approved ? { ...profile, status: "approved" as const } : profile);
  const agentTools = workspace.agentTools.map((tool) => tool.id === review.entityId ? {
    ...tool,
    lifecycleStatus: approved ? "active" as const : decision === "rejected" ? "disabled" as const : tool.lifecycleStatus,
  } : tool);
  const reviewVersion: ObjectVersion = {
    id: `VER-${reviewId}-${Date.now()}`,
    entityType: review.type,
    entityId: review.entityId || review.id,
    version: workspace.objectVersions.filter((item) => item.entityId === (review.entityId || review.id)).length + 1,
    recordedAt: at,
    recordedBy: actor.trim(),
    action: `review.${decision}`,
    snapshot: { ...review, status: decision, mergeTargetId, decisionReason: reason.trim() },
  };
  let next: SkillWorkspace = { ...workspace, reviewQueue, skills, mappings, profiles, agentTools, updatedAt: at };
  if (approved && review.payload?.operation === "taxonomy_node_definition") next = executeTaxonomyNodeDefinition(next, review.payload as unknown as TaxonomyNodeDefinitionRequest, actor.trim(), reason.trim());
  if (approved && review.payload?.operation === "taxonomy_node_lifecycle") next = executeTaxonomyNodeLifecycle(next, review.payload as unknown as TaxonomyNodeLifecycleRequest, actor.trim(), reason.trim());
  if (approved && review.payload?.operation === "kfla_metadata_review") next = executeKflaMetadataReview(next, review.payload as unknown as KflaMetadataRequest, actor.trim(), reason.trim());
  if (approved && review.payload?.operation === "kfla_lifecycle") next = executeKflaLifecycle(next, review.payload as unknown as KflaLifecycleRequest, actor.trim(), reason.trim());
  if (approved && review.payload?.operation === "workspace_import") next = executeGovernedImport(next, review.payload as unknown as WorkspaceImportPayload, actor.trim(), reason.trim());
  return { ...next, objectVersions: [reviewVersion, ...next.objectVersions], auditLog: [auditEvent(`review.${decision}`, review, actor.trim(), reason.trim(), at), ...next.auditLog], updatedAt: at };
}

export function recordGovernedVersion(workspace: SkillWorkspace, entityType: string, entityId: string, action: string, actor: string, snapshot: Record<string, unknown>) {
  const at = new Date().toISOString();
  const version = workspace.objectVersions.filter((item) => item.entityType === entityType && item.entityId === entityId).length + 1;
  return {
    ...workspace,
    objectVersions: [{ id: `VER-${entityType}-${entityId}-${version}`, entityType, entityId, version, recordedAt: at, recordedBy: actor, action, snapshot }, ...workspace.objectVersions],
    auditLog: [{ id: `AUD-${entityType}-${entityId}-${version}`, at, actor: "human" as const, actorId: actor, action, entityType, entityId, summary: `${action} recorded as version ${version}.`, beforeVersion: Math.max(0, version - 1), afterVersion: version, frameworkVersion: workspace.framework.version }, ...workspace.auditLog],
    updatedAt: at,
  };
}

function assertRelationshipInput(workspace: SkillWorkspace, relationship: TaxonomyRelationship, actor: string, reason: string) {
  if (!actor.trim() || !reason.trim()) throw new Error("An accountable actor and reason are required.");
  if (relationship.sourceId === relationship.targetId) throw new Error("A taxonomy relationship cannot point to the same concept.");
  const activeSkill = (id: string) => workspace.skills.some((skill) => skill.id === id && !["archived", "retired"].includes(skill.status));
  if (!activeSkill(relationship.sourceId) || !activeSkill(relationship.targetId)) throw new Error("Relationship endpoints must resolve to active governed skills.");
  const duplicate = workspace.relationships.some((candidate) => candidate.id !== relationship.id && !["archived", "retired"].includes(candidate.status) && candidate.sourceId === relationship.sourceId && candidate.targetId === relationship.targetId && candidate.type === relationship.type);
  if (duplicate) throw new Error("An active relationship with the same source, target and type already exists.");
  if (!relationship.rationale.trim()) throw new Error("A relationship rationale is required.");
}

export function saveTaxonomyRelationship(workspace: SkillWorkspace, relationship: TaxonomyRelationship, actor: string, reason: string) {
  assertRelationshipInput(workspace, relationship, actor, reason);
  const exists = workspace.relationships.some((candidate) => candidate.id === relationship.id);
  const value = { ...relationship, status: exists && relationship.status === "approved" ? "in_review" as const : relationship.status };
  return recordGovernedVersion({ ...workspace, relationships: exists ? workspace.relationships.map((candidate) => candidate.id === value.id ? value : candidate) : [value, ...workspace.relationships] }, "relationship", value.id, exists ? "relationship.updated" : "relationship.created", actor.trim(), { ...value, changeReason: reason.trim() } as unknown as Record<string, unknown>);
}

export function applyRelationshipLifecycle(workspace: SkillWorkspace, relationshipId: string, action: "duplicate" | "archive" | "restore" | "deprecate", actor: string, reason: string) {
  if (!actor.trim() || !reason.trim()) throw new Error("An accountable actor and reason are required.");
  const source = workspace.relationships.find((candidate) => candidate.id === relationshipId);
  if (!source) throw new Error("The governed relationship does not exist.");
  if (action === "duplicate") {
    const duplicate = { ...source, id: `REL-${Date.now()}`, rationale: `${source.rationale} (working copy)`, status: "draft" as const };
    return recordGovernedVersion({ ...workspace, relationships: [duplicate, ...workspace.relationships] }, "relationship", duplicate.id, "relationship.duplicated", actor.trim(), { ...duplicate, changeReason: reason.trim() } as unknown as Record<string, unknown>);
  }
  const status = action === "restore" ? "draft" as const : action === "archive" ? "archived" as const : "deprecated" as const;
  const updated = { ...source, status };
  return recordGovernedVersion({ ...workspace, relationships: workspace.relationships.map((candidate) => candidate.id === relationshipId ? updated : candidate) }, "relationship", relationshipId, `relationship.${action}`, actor.trim(), { ...updated, changeReason: reason.trim() } as unknown as Record<string, unknown>);
}

export type ReferenceLifecycleAction = "duplicate" | "archive" | "restore" | "deprecate" | "replace" | "merge";
export type ReferenceLifecycleRequest = { kind: "source" | "evidence" | "validation_rule"; id: string; action: ReferenceLifecycleAction; actor: string; reason: string; targetId?: string; newId?: string };

export function applyReferenceLifecycle(workspace: SkillWorkspace, request: ReferenceLifecycleRequest): SkillWorkspace {
  const actor = request.actor.trim(); const reason = request.reason.trim();
  if (!actor || !reason) throw new Error("An accountable actor and reason are required.");
  const collection = request.kind === "source" ? workspace.sources : request.kind === "evidence" ? workspace.evidenceRecords : workspace.validationRules;
  const source = collection.find((candidate) => candidate.id === request.id);
  if (!source) throw new Error("The governed reference object does not exist.");
  if (request.action === "duplicate") {
    const id = request.newId?.trim() || `${request.kind === "source" ? "SRC" : request.kind === "evidence" ? "EVD" : "RULE"}-${Date.now()}`;
    if (collection.some((candidate) => candidate.id === id)) throw new Error("The duplicate ID already exists.");
    const duplicate = { ...source, id, status: "draft" as const };
    const next = request.kind === "source" ? { ...workspace, sources: [duplicate as SourceRecord, ...workspace.sources] } : request.kind === "evidence" ? { ...workspace, evidenceRecords: [duplicate as EvidenceRecord, ...workspace.evidenceRecords] } : { ...workspace, validationRules: [duplicate as ValidationRule, ...workspace.validationRules] };
    return recordGovernedVersion(next, request.kind, id, `${request.kind}.duplicated`, actor, { ...duplicate, sourceId: source.id, reason } as unknown as Record<string, unknown>);
  }
  if (["archive", "restore", "deprecate"].includes(request.action)) {
    const status = request.action === "archive" ? "archived" as const : request.action === "restore" ? "draft" as const : "deprecated" as const;
    const next = request.kind === "source" ? { ...workspace, sources: workspace.sources.map((item) => item.id === source.id ? { ...item, status } : item) } : request.kind === "evidence" ? { ...workspace, evidenceRecords: workspace.evidenceRecords.map((item) => item.id === source.id ? { ...item, status } : item) } : { ...workspace, validationRules: workspace.validationRules.map((item) => item.id === source.id ? { ...item, status } : item) };
    return recordGovernedVersion(next, request.kind, source.id, `${request.kind}.${request.action}`, actor, { ...source, status, reason } as unknown as Record<string, unknown>);
  }
  const target = collection.find((candidate) => candidate.id === request.targetId && candidate.id !== source.id && !["archived", "retired"].includes(candidate.status));
  if (!target) throw new Error("A distinct active target is required for replace or merge.");
  const sourceStatus = request.action === "merge" ? "archived" as const : "retired" as const;
  let next: SkillWorkspace;
  if (request.kind === "source") {
    next = { ...workspace, sources: workspace.sources.map((item) => item.id === source.id ? { ...item, status: sourceStatus, governance: { ...(item.governance || { version: 0, createdAt: workspace.updatedAt, createdBy: actor }), version: (item.governance?.version || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: actor, replacedById: target.id } } : item.id === target.id ? { ...item, status: "in_review" as const } : item), evidenceRecords: workspace.evidenceRecords.map((item) => item.sourceId === source.id ? { ...item, sourceId: target.id, status: "in_review" as const } : item) };
  } else if (request.kind === "evidence") {
    const sourceEvidence = source as EvidenceRecord; const targetEvidence = target as EvidenceRecord;
    next = { ...workspace, evidenceRecords: workspace.evidenceRecords.map((item) => item.id === source.id ? { ...item, status: sourceStatus } : item.id === target.id ? { ...targetEvidence, supportedEntityIds: [...new Set([...targetEvidence.supportedEntityIds, ...sourceEvidence.supportedEntityIds])], confidence: Math.max(targetEvidence.confidence, sourceEvidence.confidence), status: "in_review" as const } : item) };
  } else {
    next = { ...workspace, validationRules: workspace.validationRules.map((item) => item.id === source.id ? { ...item, status: sourceStatus } : item.id === target.id ? { ...item, status: "in_review" as const } : item) };
  }
  const first = recordGovernedVersion(next, request.kind, source.id, `${request.kind}.${request.action}_source`, actor, { ...source, status: sourceStatus, targetId: target.id, reason } as unknown as Record<string, unknown>);
  return recordGovernedVersion(first, request.kind, target.id, `${request.kind}.${request.action}_target`, actor, { ...target, status: "in_review", sourceId: source.id, reason } as unknown as Record<string, unknown>);
}

export function calculateEvidenceCompleteness(mapping: JobSkillMapping, workspace: SkillWorkspace) {
  const job = workspace.jobDescriptions.find((candidate) => candidate.id === mapping.jobDescriptionId);
  const source = `${job?.sourceText || ""} ${(job?.responsibilities || []).join(" ")} ${(job?.outcomes || []).join(" ")}`.toLowerCase();
  const sourceMatched = mapping.evidence.some((excerpt) => excerpt.trim().length >= 12 && source.includes(excerpt.trim().toLowerCase()));
  const linkedEvidence = workspace.evidenceRecords.some((evidence) => evidence.supportedEntityIds.includes(mapping.id) && !["archived", "retired"].includes(evidence.status));
  const skill = workspace.skills.find((candidate) => candidate.id === mapping.skillId);
  const grounded = Boolean((mapping.toolIds?.length || 0) > 0 || skill?.kflaCompetencyId);
  return Math.min(100,
    (mapping.evidence.length ? 25 : 0) +
    (mapping.rationale.trim().length >= 20 ? 15 : 0) +
    (sourceMatched ? 25 : 0) +
    (linkedEvidence ? 15 : 0) +
    (mapping.scoreBreakdown ? 10 : 0) +
    (grounded ? 10 : 0));
}

export type MappingFeedbackRequest = Pick<MappingFeedback, "mappingId" | "decision" | "reviewer" | "reason"> & { confidenceAfter?: number };

export function recordMappingFeedback(workspace: SkillWorkspace, request: MappingFeedbackRequest): SkillWorkspace {
  const mapping = workspace.mappings.find((candidate) => candidate.id === request.mappingId);
  if (!mapping) throw new Error("The mapping feedback target does not exist.");
  if (!request.reviewer.trim() || !request.reason.trim()) throw new Error("An accountable reviewer and reason are required.");
  if (request.decision === "adjusted" && (request.confidenceAfter === undefined || request.confidenceAfter < 0 || request.confidenceAfter > 100)) throw new Error("Adjusted feedback requires a calibrated confidence between 0 and 100.");
  const at = new Date().toISOString();
  const evidenceCompleteness = calculateEvidenceCompleteness(mapping, workspace);
  const feedback: MappingFeedback = {
    id: `MFB-${mapping.id}-${Date.now()}`,
    mappingId: mapping.id,
    decision: request.decision,
    reviewer: request.reviewer.trim(),
    reason: request.reason.trim(),
    recordedAt: at,
    confidenceBefore: mapping.confidence ?? mapping.relevance,
    confidenceAfter: request.decision === "adjusted" ? request.confidenceAfter : undefined,
    evidenceCompleteness,
    frameworkVersion: workspace.framework.version,
    rulesVersion: workspace.framework.rulesVersion,
    scoreVersion: mapping.scoreVersion || workspace.framework.mappingScoreVersion,
  };
  const updated = {
    ...mapping,
    confidence: feedback.confidenceAfter ?? mapping.confidence,
    evidenceCompleteness,
    reviewerFeedback: `${feedback.decision}: ${feedback.reason}`,
  };
  return recordGovernedVersion({
    ...workspace,
    mappings: workspace.mappings.map((candidate) => candidate.id === mapping.id ? updated : candidate),
    mappingFeedback: [feedback, ...workspace.mappingFeedback],
  }, "mapping_feedback", feedback.id, "mapping.feedback_recorded", feedback.reviewer, feedback as unknown as Record<string, unknown>);
}

export function mappingCalibrationSummary(workspace: SkillWorkspace) {
  const records = workspace.mappingFeedback;
  const bins = [
    { label: "0–59", min: 0, max: 59 },
    { label: "60–79", min: 60, max: 79 },
    { label: "80–100", min: 80, max: 100 },
  ].map((bin) => {
    const items = records.filter((item) => item.confidenceBefore >= bin.min && item.confidenceBefore <= bin.max);
    const confirmed = items.filter((item) => item.decision === "confirmed").length;
    return { label: bin.label, count: items.length, predicted: items.length ? Math.round(items.reduce((sum, item) => sum + item.confidenceBefore, 0) / items.length) : 0, observed: items.length ? Math.round(confirmed / items.length * 100) : 0 };
  });
  const predicted = records.length ? Math.round(records.reduce((sum, item) => sum + item.confidenceBefore, 0) / records.length) : 0;
  const observed = records.length ? Math.round(records.filter((item) => item.decision === "confirmed").length / records.length * 100) : 0;
  const evidenceCompleteness = records.length ? Math.round(records.reduce((sum, item) => sum + item.evidenceCompleteness, 0) / records.length) : 0;
  return { sampleSize: records.length, predicted, observed, calibrationGap: observed - predicted, evidenceCompleteness, bins };
}

export function detectReleaseDrift(working: SkillWorkspace, approved: SkillWorkspace) {
  const workingCounts = releaseObjectCounts(working);
  const approvedCounts = releaseObjectCounts(approved);
  const changedCollections = Object.keys(workingCounts).filter((key) => workingCounts[key] !== approvedCounts[key]);
  return {
    drifted: working.revision !== approved.revision || changedCollections.length > 0,
    revisionDelta: working.revision - approved.revision,
    changedCollections,
    workingCounts,
    approvedCounts,
  };
}

export function releaseObjectCounts(workspace: SkillWorkspace): Record<string, number> {
  return {
    domains: workspace.domains.length,
    groups: workspace.groups.length,
    relationships: workspace.relationships.length,
    skills: workspace.skills.length,
    profiles: workspace.profiles.length,
    kflaFactors: workspace.kflaFactors.length,
    kflaClusters: workspace.kflaClusters.length,
    kflaCompetencies: workspace.kfla.length,
    jobDescriptions: workspace.jobDescriptions.length,
    mappings: workspace.mappings.length,
    mappingOmissions: workspace.mappingOmissions.length,
    mappingFeedback: workspace.mappingFeedback.length,
    localizedLabels: workspace.localizedLabels.length,
    controlledTools: workspace.tools.length,
    agentTools: workspace.agentTools.length,
    validationRules: workspace.validationRules.length,
    proficiencyDefinitions: workspace.proficiencyDefinitions.length,
    sources: workspace.sources.length,
    evidenceRecords: workspace.evidenceRecords.length,
    reviewDecisions: workspace.reviewQueue.filter((item) => item.status !== "pending").length,
    auditEvents: workspace.auditLog.length,
  };
}

const governedImportCollections = [
  "domains", "groups", "relationships", "skills", "profiles", "interviews", "jobClarifications", "elicitationSessions", "kflaFactors", "kflaClusters", "kfla", "jobDescriptions", "mappings", "mappingOmissions", "mappingFeedback", "strategicVectors", "agentRuns", "tools", "agentTools", "validationRules", "proficiencyDefinitions", "sources", "evidenceRecords", "localizedLabels",
] as const;

export type GovernedImportPreview = {
  fileName: string;
  candidate: SkillWorkspace;
  changes: Array<{ collection: typeof governedImportCollections[number] | "framework"; current: number; incoming: number; delta: number }>;
  findings: ReturnType<typeof validateWorkspace>;
  protectedContentDetected: boolean;
  credentialLikeContentDetected: boolean;
};

export function previewGovernedImport(workspace: SkillWorkspace, candidate: SkillWorkspace, fileName: string): GovernedImportPreview {
  const canonicalCandidate: SkillWorkspace = {
    schemaVersion: 3, revision: Number(candidate.revision || 0), updatedAt: candidate.updatedAt,
    domains: candidate.domains, groups: candidate.groups, relationships: candidate.relationships, skills: candidate.skills, profiles: candidate.profiles,
    interviews: candidate.interviews, jobClarifications: candidate.jobClarifications, elicitationSessions: candidate.elicitationSessions, reviewQueue: candidate.reviewQueue,
    kflaFactors: candidate.kflaFactors, kflaClusters: candidate.kflaClusters, kfla: candidate.kfla,
    jobDescriptions: candidate.jobDescriptions, mappings: candidate.mappings, mappingOmissions: candidate.mappingOmissions, mappingFeedback: candidate.mappingFeedback, strategicVectors: candidate.strategicVectors,
    agentRuns: candidate.agentRuns, tools: candidate.tools, agentTools: candidate.agentTools, validationRules: candidate.validationRules,
    proficiencyDefinitions: candidate.proficiencyDefinitions, sources: candidate.sources, evidenceRecords: candidate.evidenceRecords, localizedLabels: candidate.localizedLabels,
    auditLog: candidate.auditLog, objectVersions: candidate.objectVersions, releaseHistory: candidate.releaseHistory, framework: candidate.framework, publication: candidate.publication,
  };
  const changes: GovernedImportPreview["changes"] = governedImportCollections.map((collection) => ({
    collection,
    current: workspace[collection].length,
    incoming: canonicalCandidate[collection].length,
    delta: canonicalCandidate[collection].length - workspace[collection].length,
  })).filter((change) => change.delta !== 0);
  if (JSON.stringify(workspace.framework) !== JSON.stringify(canonicalCandidate.framework)) changes.push({ collection: "framework", current: 1, incoming: 1, delta: 0 });
  const protectedContentDetected = canonicalCandidate.kfla.some((item) => Boolean(item.licensedDefinitionRef || (item.source === "licensed" && item.definition.trim())));
  const serialized = JSON.stringify(canonicalCandidate);
  const credentialLikeContentDetected = /(?:eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk-[A-Za-z0-9_-]{20,})/.test(serialized);
  return { fileName, candidate: canonicalCandidate, changes, findings: validateWorkspace(canonicalCandidate), protectedContentDetected, credentialLikeContentDetected };
}

export function requestGovernedImport(workspace: SkillWorkspace, preview: GovernedImportPreview, actor: string, reason: string): SkillWorkspace {
  if (!actor.trim() || !reason.trim()) throw new Error("An accountable importer and governance reason are required.");
  const verified = previewGovernedImport(workspace, preview.candidate, preview.fileName);
  if (verified.protectedContentDetected) throw new Error("Browser import cannot contain licensed definitions or protected definition references.");
  if (verified.credentialLikeContentDetected) throw new Error("Browser import contains credential-like material and cannot enter governed working state.");
  const blocking = verified.findings.filter((finding) => finding.blocking);
  if (blocking.length) throw new Error(`Import validation failed with ${blocking.length} blocking finding(s).`);
  if (workspace.reviewQueue.some((item) => item.status === "pending" && item.payload?.operation === "workspace_import")) throw new Error("A governed workspace import is already pending review.");
  const requestId = `IMPORT-${Date.now()}`;
  const review: ReviewItem = {
    id: `REV-${requestId}`,
    title: `Import governed workspace: ${preview.fileName}`,
    type: "taxonomy_change",
    summary: `${verified.changes.length} collection or framework change(s) will replace working data after approval; ${verified.findings.length} validation finding(s) were previewed.`,
    confidence: 100,
    evidence: reason.trim(),
    explanation: "The parsed candidate is retained only in the review payload. Active working data, release history and publication state remain unchanged until accountable approval.",
    frameworkVersion: workspace.framework.version,
    rulesVersion: workspace.framework.rulesVersion,
    status: "pending",
    entityId: requestId,
    payload: { operation: "workspace_import", fileName: verified.fileName, requestedBy: actor.trim(), requestReason: reason.trim(), candidate: verified.candidate as unknown as Record<string, unknown>, changes: verified.changes as unknown as Record<string, unknown> },
  };
  return recordGovernedVersion({ ...workspace, reviewQueue: [review, ...workspace.reviewQueue] }, "skill_workspace", requestId, "workspace.import_requested", actor.trim(), { reviewId: review.id, fileName: verified.fileName, changes: verified.changes as unknown as Record<string, unknown>, findings: verified.findings.length });
}

type WorkspaceImportPayload = { fileName: string; requestedBy: string; requestReason: string; candidate: SkillWorkspace };

function executeGovernedImport(workspace: SkillWorkspace, payload: WorkspaceImportPayload, reviewer: string, decisionReason: string): SkillWorkspace {
  const preview = previewGovernedImport(workspace, payload.candidate, payload.fileName);
  if (preview.protectedContentDetected) throw new Error("Approved import contains protected licensed content and cannot be applied in the browser workspace.");
  if (preview.credentialLikeContentDetected) throw new Error("Approved import contains credential-like material and cannot be applied.");
  const blocking = preview.findings.filter((finding) => finding.blocking);
  if (blocking.length) throw new Error(`Approved import no longer passes validation: ${blocking.length} blocking finding(s).`);
  const candidate = payload.candidate;
  const next: SkillWorkspace = {
    ...candidate,
    revision: workspace.revision + 1,
    updatedAt: new Date().toISOString(),
    reviewQueue: workspace.reviewQueue,
    auditLog: workspace.auditLog,
    objectVersions: workspace.objectVersions,
    releaseHistory: workspace.releaseHistory,
    publication: { ...workspace.publication, state: "working", lastError: undefined },
  };
  return recordGovernedVersion(next, "skill_workspace", `import-${workspace.revision + 1}`, "workspace.import_applied", reviewer, { fileName: payload.fileName, requestedBy: payload.requestedBy, requestReason: payload.requestReason, decisionReason, changes: preview.changes as unknown as Record<string, unknown> });
}

export function prepareGovernedExport(workspace: SkillWorkspace, actor: string, reason: string) {
  if (!actor.trim() || !reason.trim()) throw new Error("An accountable exporter and governance reason are required.");
  const exportId = `EXPORT-${workspace.revision}-${Date.now()}`;
  const exported = recordGovernedVersion(workspace, "skill_workspace", exportId, "workspace.exported", actor.trim(), { revision: workspace.revision, reason: reason.trim(), schemaVersion: workspace.schemaVersion });
  return { workspace: exported, exportId, fileName: `skill-workspace-working-r${workspace.revision}.json` };
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sanitizeApprovedWorkspace(workspace: SkillWorkspace): SkillWorkspace {
  const approvedSkills = workspace.skills.filter((skill) => skill.status === "approved");
  const approvedSkillIds = new Set(approvedSkills.map((skill) => skill.id));
  const approvedGroups = workspace.groups.filter((group) => group.status === "approved");
  const approvedGroupIds = new Set(approvedGroups.map((group) => group.id));
  const approvedDomainIds = new Set(approvedGroups.map((group) => group.domainId));
  const publicEligibleSourceIds = new Set(workspace.sources.filter((source) => source.status === "approved" && source.sourceClassification !== "licensed" && source.licenceStatus !== "licensed_restricted").map((source) => source.id));
  const approvedEvidence = workspace.evidenceRecords.filter((evidence) => evidence.status === "approved" && evidence.dataClassification === "public" && publicEligibleSourceIds.has(evidence.sourceId));
  const approvedSourceIds = new Set(approvedEvidence.map((evidence) => evidence.sourceId));
  const approvedLocalizedLabels = workspace.localizedLabels.filter((label) => {
    if (label.status !== "approved" || label.sourceClassification === ("licensed" as typeof label.sourceClassification) || label.licenceStatus === ("licensed_restricted" as typeof label.licenceStatus)) return false;
    if (label.entityType === "domain") return approvedDomainIds.has(label.entityId);
    if (label.entityType === "group") return approvedGroupIds.has(label.entityId);
    if (label.entityType === "skill") return approvedSkillIds.has(label.entityId);
    if (label.entityType === "controlled_tool") return workspace.tools.some((tool) => tool.id === label.entityId && tool.status === "approved");
    if (label.entityType === "kfla_factor") return workspace.kflaFactors.some((item) => item.id === label.entityId);
    if (label.entityType === "kfla_cluster") return workspace.kflaClusters.some((item) => item.id === label.entityId);
    return workspace.kfla.some((item) => item.id === label.entityId);
  });
  return {
    ...workspace,
    domains: workspace.domains.filter((domain) => domain.status === "approved" && approvedDomainIds.has(domain.id)),
    groups: approvedGroups,
    relationships: workspace.relationships.filter((relationship) => relationship.status === "approved" && approvedSkillIds.has(relationship.sourceId) && approvedSkillIds.has(relationship.targetId)),
    skills: approvedSkills.filter((skill) => approvedGroupIds.has(skill.groupId)),
    profiles: workspace.profiles.filter((profile) => profile.status === "approved").map((profile) => ({ ...profile, skills: profile.skills.filter((skill) => approvedSkillIds.has(skill.skillId)) })),
    jobDescriptions: workspace.jobDescriptions.filter((job) => job.status === "mapped"),
    mappings: workspace.mappings.filter((mapping) => mapping.status === "approved" && approvedSkillIds.has(mapping.skillId)),
    strategicVectors: workspace.strategicVectors.map((vector) => ({ ...vector, skillIds: vector.skillIds.filter((id) => approvedSkillIds.has(id)) })),
    tools: workspace.tools.filter((tool) => tool.status === "approved").map((tool) => ({ ...tool, skillIds: tool.skillIds.filter((id) => approvedSkillIds.has(id)) })),
    agentTools: workspace.agentTools.filter((tool) => tool.lifecycleStatus === "active"),
    validationRules: workspace.validationRules.filter((rule) => rule.status === "approved"),
    proficiencyDefinitions: workspace.proficiencyDefinitions.filter((level) => level.status === "approved"),
    sources: workspace.sources.filter((source) => approvedSourceIds.has(source.id) && source.status === "approved" && source.sourceClassification !== "licensed" && source.licenceStatus !== "licensed_restricted"),
    evidenceRecords: approvedEvidence,
    localizedLabels: approvedLocalizedLabels,
    interviews: [],
    jobClarifications: [],
    elicitationSessions: [],
    agentRuns: [],
    mappingOmissions: [],
    mappingFeedback: [],
    objectVersions: [],
    kfla: workspace.kfla.map((competency) => ({
      ...competency,
      definition: competency.source === "licensed" ? "" : competency.definition,
      licensedDefinitionRef: undefined,
    })),
  };
}

export function prepareRelease(workspace: SkillWorkspace, approvedBy: string, expectedPreviousRevision: number, expectedGitHubSha?: string) {
  if (!approvedBy.trim()) throw new Error("An accountable approver is required.");
  if (workspace.publication.revision !== expectedPreviousRevision) throw new Error(`Release conflict: expected revision ${expectedPreviousRevision}, working state references ${workspace.publication.revision}.`);
  const pending = workspace.reviewQueue.filter((item) => item.status === "pending");
  if (pending.length) throw new Error(`${pending.length} human review decision(s) remain pending.`);
  const findings = validateWorkspace(workspace);
  const blocking = findings.filter((finding) => finding.blocking);
  if (blocking.length) throw new Error(`Release validation failed with ${blocking.length} blocking finding(s).`);
  const now = new Date().toISOString();
  const revision = expectedPreviousRevision + 1;
  const idempotencyKey = `release-${revision}-${stableKey(`${workspace.updatedAt}:${approvedBy}:${expectedGitHubSha || "none"}`)}`;
  const previous = workspace.releaseHistory.find((release) => release.idempotencyKey === idempotencyKey && release.state === "published");
  if (previous) return { workspace, manifest: previous, findings, duplicate: true };
  const approvedSnapshot = sanitizeApprovedWorkspace(workspace);
  const manifest: ReleaseManifest = {
    id: `REL-${String(revision).padStart(4, "0")}`,
    revision,
    schemaVersion: 3,
    frameworkVersion: workspace.framework.version,
    rulesVersion: workspace.framework.rulesVersion,
    promptVersion: workspace.framework.promptVersion,
    mappingScoreVersion: workspace.framework.mappingScoreVersion,
    state: "prepared",
    approvedAt: now,
    approvedBy: approvedBy.trim(),
    expectedPreviousRevision,
    expectedGitHubSha,
    githubPath: workspace.publication.githubPath,
    idempotencyKey,
    objectCounts: releaseObjectCounts(approvedSnapshot),
    validationSummary: { blocking: 0, warnings: findings.filter((finding) => !finding.blocking).length },
  };
  const approved = sanitizeApprovedWorkspace({
    ...workspace,
    revision,
    updatedAt: now,
    releaseHistory: [manifest, ...workspace.releaseHistory],
    publication: { ...workspace.publication, revision, state: "publishing", approvedAt: now, approvedBy: approvedBy.trim(), expectedGitHubSha, idempotencyKey, lastError: undefined },
    auditLog: [{ id: `AUD-REL-${revision}`, at: now, actor: "human", actorId: approvedBy.trim(), action: "release.prepared", entityType: "skill_workspace", entityId: `revision-${revision}`, summary: `Approved release ${revision} prepared for authenticated n8n publication.`, frameworkVersion: workspace.framework.version }, ...workspace.auditLog],
  });
  return { workspace: approved, manifest, findings, duplicate: false };
}

export function markReleasePublished(workspace: SkillWorkspace, commitSha: string): SkillWorkspace {
  const idempotencyKey = workspace.publication.idempotencyKey;
  if (!idempotencyKey) throw new Error("No prepared release exists.");
  return {
    ...workspace,
    publication: { ...workspace.publication, state: "approved_release", githubCommitSha: commitSha },
    releaseHistory: workspace.releaseHistory.map((manifest) => manifest.idempotencyKey === idempotencyKey ? { ...manifest, state: "published", githubCommitSha: commitSha } : manifest),
  };
}

export function markReleaseFailed(workspace: SkillWorkspace, message: string): SkillWorkspace {
  return {
    ...workspace,
    publication: { ...workspace.publication, state: "failed", lastError: message },
    releaseHistory: workspace.releaseHistory.map((manifest) => manifest.idempotencyKey === workspace.publication.idempotencyKey ? { ...manifest, state: "failed" } : manifest),
  };
}

export function applyReleaseReceiptToWorkingWorkspace(
  working: SkillWorkspace,
  approved: SkillWorkspace,
  manifest: ReleaseManifest,
  commitSha: string,
): SkillWorkspace {
  if (approved.revision !== manifest.revision || approved.publication.revision !== manifest.revision) throw new Error("Approved snapshot and release manifest revisions do not match.");
  if (!commitSha.trim()) throw new Error("A verified GitHub commit SHA is required for the release receipt.");
  if (!approved.publication.expectedGitHubSha?.trim()) throw new Error("The approved GitHub snapshot blob SHA is required for the next concurrency check.");
  const publishedManifest: ReleaseManifest = { ...manifest, state: "published", githubCommitSha: commitSha.trim() };
  const alreadyRecorded = working.releaseHistory.some((item) => item.revision === publishedManifest.revision && item.githubCommitSha === commitSha.trim());
  const next: SkillWorkspace = {
    ...working,
    releaseHistory: [publishedManifest, ...working.releaseHistory.filter((item) => item.revision !== publishedManifest.revision)],
    publication: {
      ...working.publication,
      revision: publishedManifest.revision,
      state: "working",
      approvedAt: publishedManifest.approvedAt,
      approvedBy: publishedManifest.approvedBy,
      githubCommitSha: commitSha.trim(),
      expectedGitHubSha: approved.publication.expectedGitHubSha,
      idempotencyKey: publishedManifest.idempotencyKey,
      lastError: undefined,
    },
  };
  if (alreadyRecorded) return next;
  return recordGovernedVersion(next, "release", publishedManifest.id, "release.receipt_recorded", publishedManifest.approvedBy, {
    revision: publishedManifest.revision,
    commitSha: commitSha.trim(),
    idempotencyKey: publishedManifest.idempotencyKey,
    approvedSnapshotSha: approved.publication.expectedGitHubSha,
  });
}

export function requestRollback(workspace: SkillWorkspace, target: ReleaseManifest, actor: string, reason = ""): SkillWorkspace {
  if (target.state !== "published") throw new Error("Only a published release can be restored.");
  if (!actor.trim() || !reason.trim()) throw new Error("An accountable rollback requester and reason are required.");
  if (workspace.reviewQueue.some((item) => item.status === "pending" && item.payload?.operation === "release_rollback" && item.payload.rollbackOfRevision === target.revision)) throw new Error(`Rollback to revision ${target.revision} is already pending review.`);
  const at = new Date().toISOString();
  return {
    ...workspace,
    publication: { ...workspace.publication, state: "working", lastError: undefined },
    reviewQueue: [{ id: `REV-ROLLBACK-${target.revision}-${Date.now()}`, title: `Rollback to revision ${target.revision}`, type: "taxonomy_change", summary: `Restore the approved snapshot from ${target.githubCommitSha || target.id}.`, confidence: 100, evidence: reason.trim(), explanation: "Rollback requires a new accountable approval and creates a new revision; history is never rewritten.", frameworkVersion: workspace.framework.version, rulesVersion: workspace.framework.rulesVersion, status: "pending", payload: { operation: "release_rollback", rollbackOfRevision: target.revision, targetManifestId: target.id, targetCommitSha: target.githubCommitSha, requestedBy: actor.trim(), requestReason: reason.trim() } }, ...workspace.reviewQueue],
    auditLog: [{ id: `AUD-ROLLBACK-${target.revision}-${Date.now()}`, at, actor: "human", actorId: actor.trim(), action: "rollback.requested", entityType: "release", entityId: target.id, summary: `Rollback to revision ${target.revision} routed for human approval: ${reason.trim()}` }, ...workspace.auditLog],
  };
}

export function recalculateMapping(mapping: JobSkillMapping, workspace: SkillWorkspace): JobSkillMapping {
  if (!mapping.scoreBreakdown) return mapping;
  return { ...mapping, relevance: calculateMappingScore(mapping.scoreBreakdown, workspace.framework.mappingWeights), scoreVersion: workspace.framework.mappingScoreVersion };
}
