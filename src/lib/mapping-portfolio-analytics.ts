import type { JobSkillMapping, SkillWorkspace } from "@/lib/skill-schema";

const active = (mapping: JobSkillMapping) => !["rejected", "deferred"].includes(mapping.status);

export function mappingPortfolioAnalytics(workspace: SkillWorkspace, approvedWorkspace?: SkillWorkspace | null) {
  const mappings = workspace.mappings.filter(active);
  const skillById = new Map(workspace.skills.map((skill) => [skill.id, skill]));
  const groupById = new Map(workspace.groups.map((group) => [group.id, group]));
  const domainById = new Map(workspace.domains.map((domain) => [domain.id, domain]));
  const competencyById = new Map(workspace.kfla.map((item) => [item.id, item]));
  const factorById = new Map(workspace.kflaFactors.map((item) => [item.id, item]));

  const jobs = workspace.jobDescriptions.filter((job) => job.status !== "archived").map((job) => {
    const roleMappings = mappings.filter((mapping) => mapping.jobDescriptionId === job.id);
    const material = job.evidenceSegments.filter((segment) => ["responsibility", "outcome"].includes(segment.normalizedType));
    const owners = new Map(material.map((segment) => [segment.id, [] as string[]]));
    roleMappings.forEach((mapping) => mapping.evidenceRefs?.forEach((ref) => owners.get(ref)?.push(mapping.skillId)));
    const technical = roleMappings.filter((mapping) => skillById.get(mapping.skillId)?.dimension === "technical");
    const behavioral = roleMappings.filter((mapping) => skillById.get(mapping.skillId)?.dimension === "competency");
    return {
      id: job.id, title: job.title, family: job.jobFamily, mappings: roleMappings,
      technical, behavioral, materialEvidence: material.length,
      coveredEvidence: [...owners.values()].filter((ids) => ids.length > 0).length,
      overlapEvidence: [...owners.values()].filter((ids) => ids.length > 1).length,
      gapEvidence: [...owners.entries()].filter(([, ids]) => ids.length === 0).map(([id]) => id),
    };
  });

  const domainHeatmap = jobs.map((job) => ({
    jobId: job.id,
    title: job.title,
    cells: workspace.domains.map((domain) => ({
      domainId: domain.id,
      name: domain.name,
      count: job.mappings.filter((mapping) => {
        const group = groupById.get(skillById.get(mapping.skillId)?.groupId || "");
        return group?.domainId === domain.id;
      }).length,
    })),
  }));

  const skillUsage = new Map<string, Set<string>>();
  mappings.forEach((mapping) => {
    if (!skillUsage.has(mapping.skillId)) skillUsage.set(mapping.skillId, new Set());
    skillUsage.get(mapping.skillId)!.add(mapping.jobDescriptionId);
  });
  const reusableSkills = [...skillUsage.entries()].filter(([, jobIds]) => jobIds.size > 1).map(([skillId, jobIds]) => ({
    skillId, name: skillById.get(skillId)?.name || skillId, jobIds: [...jobIds], roleCount: jobIds.size,
    group: groupById.get(skillById.get(skillId)?.groupId || "")?.name || "Unplaced",
  })).sort((a, b) => b.roleCount - a.roleCount || a.name.localeCompare(b.name));

  const redundancy = workspace.relationships.filter((relationship) => ["synonym", "related"].includes(relationship.type) && relationship.status !== "archived").map((relationship) => ({
    id: relationship.id,
    left: skillById.get(relationship.sourceId)?.name || relationship.sourceId,
    right: skillById.get(relationship.targetId)?.name || relationship.targetId,
    type: relationship.type,
    rationale: relationship.rationale,
    mappedRoles: jobs.filter((job) => job.mappings.some((mapping) => mapping.skillId === relationship.sourceId) && job.mappings.some((mapping) => mapping.skillId === relationship.targetId)).map((job) => job.title),
  })).filter((item) => item.type === "synonym" || item.mappedRoles.length > 0);

  const kflaConcentration = workspace.kflaFactors.map((factor) => {
    const factorCompetencyIds = new Set(workspace.kfla.filter((item) => item.factorId === factor.id).map((item) => item.id));
    const factorMappings = mappings.filter((mapping) => {
      const skill = skillById.get(mapping.skillId);
      return skill?.dimension === "competency" && Boolean(skill.kflaCompetencyId && factorCompetencyIds.has(skill.kflaCompetencyId));
    });
    return { id: factor.id, name: factor.name, count: factorMappings.length, roles: new Set(factorMappings.map((mapping) => mapping.jobDescriptionId)).size };
  });

  const approvedKeys = new Set((approvedWorkspace?.mappings || []).filter(active).map((mapping) => `${mapping.jobDescriptionId}:${mapping.skillId}`));
  const proposedKeys = new Set(mappings.map((mapping) => `${mapping.jobDescriptionId}:${mapping.skillId}`));
  const comparison = {
    proposed: mappings.length,
    approved: approvedKeys.size,
    added: [...proposedKeys].filter((key) => !approvedKeys.has(key)),
    unchanged: [...proposedKeys].filter((key) => approvedKeys.has(key)),
    removed: [...approvedKeys].filter((key) => !proposedKeys.has(key)),
  };

  const pathFor = (mapping: JobSkillMapping) => {
    const skill = skillById.get(mapping.skillId);
    const group = groupById.get(skill?.groupId || "");
    const domain = domainById.get(group?.domainId || "");
    const competency = competencyById.get(skill?.kflaCompetencyId || "");
    return { skill: skill?.name || mapping.skillId, group: group?.name || "Unplaced", domain: domain?.name || "Unplaced", factor: competency ? factorById.get(competency.factorId)?.name : undefined, competency: competency?.name };
  };

  return { jobs, domainHeatmap, reusableSkills, redundancy, kflaConcentration, comparison, pathFor };
}
