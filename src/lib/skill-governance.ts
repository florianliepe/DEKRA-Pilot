import { validateWorkspace, type AgentToolInvocation, type AuditEvent, type ControlledTool, type DataClassification, type JobSkillMapping, type LocalizedConceptLabel, type MappingScoreBreakdown, type ObjectVersion, type ReleaseManifest, type ReviewItem, type RoleProfile, type SkillWorkspace } from "./skill-schema";

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
    dependencyCount: skills.length + mappings.length + profiles.length + tools.length + relationships.length + jobs.length + evidenceRecords.length + sources.length + profileJobs.length + profileMappings.length + toolSkills.length + toolMappings.length,
  };
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
