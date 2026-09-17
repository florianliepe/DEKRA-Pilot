import type { JobDescription, JobSkillMapping, RoleProfile, SkillWorkspace } from "@/lib/skill-schema";

export function deriveRoleProfile(job: JobDescription, mappings: JobSkillMapping[], workspace: SkillWorkspace, existing?: RoleProfile): RoleProfile {
  const active = mappings.filter((mapping) => mapping.jobDescriptionId === job.id && !["rejected", "deferred"].includes(mapping.status));
  const seen = new Set<string>();
  const skills = active.filter((mapping) => {
    if (seen.has(mapping.skillId) || !workspace.skills.some((skill) => skill.id === mapping.skillId && !["archived", "retired"].includes(skill.status))) return false;
    seen.add(mapping.skillId);
    return true;
  }).map(({ skillId, targetLevel, weight, critical }) => ({ skillId, targetLevel, weight, critical }));
  return {
    id: existing?.id || `PROFILE-${job.id}`,
    title: job.title,
    jobFamily: job.jobFamily,
    purpose: job.purpose,
    status: "in_review",
    skills,
    jobDescriptionId: job.id,
    strategicVectorIds: existing?.strategicVectorIds,
    excludedLinks: existing?.excludedLinks,
    agentRunId: active.find((mapping) => mapping.agentRunId)?.agentRunId || existing?.agentRunId,
    governance: existing?.governance,
  };
}
