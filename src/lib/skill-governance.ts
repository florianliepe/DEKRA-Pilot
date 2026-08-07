import { validateWorkspace, type AgentToolInvocation, type AuditEvent, type DataClassification, type JobSkillMapping, type MappingScoreBreakdown, type ObjectVersion, type ReleaseManifest, type ReviewItem, type SkillWorkspace } from "./skill-schema";

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
  return {
    skills,
    mappings,
    profiles,
    tools,
    relationships,
    jobs,
    dependencyCount: skills.length + mappings.length + profiles.length + tools.length + relationships.length + jobs.length,
  };
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
  const objectVersions: ObjectVersion[] = [{
    id: `VER-${reviewId}-${Date.now()}`,
    entityType: review.type,
    entityId: review.entityId || review.id,
    version: workspace.objectVersions.filter((item) => item.entityId === (review.entityId || review.id)).length + 1,
    recordedAt: at,
    recordedBy: actor.trim(),
    action: `review.${decision}`,
    snapshot: { ...review, status: decision, mergeTargetId, decisionReason: reason.trim() },
  }, ...workspace.objectVersions];
  return { ...workspace, reviewQueue, skills, mappings, profiles, objectVersions, auditLog: [auditEvent(`review.${decision}`, review, actor.trim(), reason.trim(), at), ...workspace.auditLog], updatedAt: at };
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
    controlledTools: workspace.tools.length,
    agentTools: workspace.agentTools.length,
    validationRules: workspace.validationRules.length,
    reviewDecisions: workspace.reviewQueue.filter((item) => item.status !== "pending").length,
    auditEvents: workspace.auditLog.length,
  };
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
    interviews: [],
    elicitationSessions: [],
    agentRuns: [],
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

export function requestRollback(workspace: SkillWorkspace, target: ReleaseManifest, actor: string): SkillWorkspace {
  if (target.state !== "published") throw new Error("Only a published release can be restored.");
  const at = new Date().toISOString();
  return {
    ...workspace,
    publication: { ...workspace.publication, state: "working", lastError: undefined },
    reviewQueue: [{ id: `REV-ROLLBACK-${target.revision}`, title: `Rollback to revision ${target.revision}`, type: "taxonomy_change", summary: `Restore the approved snapshot from ${target.githubCommitSha || target.id}.`, confidence: 100, evidence: target.githubCommitSha || target.id, explanation: "Rollback requires a new accountable approval and creates a new revision; history is never rewritten.", frameworkVersion: workspace.framework.version, rulesVersion: workspace.framework.rulesVersion, status: "pending", payload: { rollbackOfRevision: target.revision } }, ...workspace.reviewQueue],
    auditLog: [{ id: `AUD-ROLLBACK-${target.revision}-${Date.now()}`, at, actor: "human", actorId: actor, action: "rollback.requested", entityType: "release", entityId: target.id, summary: `Rollback to revision ${target.revision} routed for human approval.` }, ...workspace.auditLog],
  };
}

export function recalculateMapping(mapping: JobSkillMapping, workspace: SkillWorkspace): JobSkillMapping {
  if (!mapping.scoreBreakdown) return mapping;
  return { ...mapping, relevance: calculateMappingScore(mapping.scoreBreakdown, workspace.framework.mappingWeights), scoreVersion: workspace.framework.mappingScoreVersion };
}
