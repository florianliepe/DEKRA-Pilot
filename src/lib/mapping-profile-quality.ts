import type { JobDescription, JobSkillMapping, SkillWorkspace } from "@/lib/skill-schema";

export const ROLE_SKILL_MIN = 8;
export const ROLE_SKILL_MAX = 10;

export type MappingConfidenceInterval = {
  lower: number;
  upper: number;
  point: number;
  margin: number;
  method: "evidence-adjusted operational interval";
};

export type MappingProfileQuality = {
  activeMappings: JobSkillMapping[];
  evidenceUniverse: string[];
  coveredEvidence: string[];
  uncoveredEvidence: string[];
  overlappingEvidence: Array<{ evidenceRef: string; mappingIds: string[] }>;
  duplicateSkillIds: string[];
  totalWeight: number;
  skillCount: number;
  averageConfidence: number;
  averageInterval: MappingConfidenceInterval;
  mece: boolean;
  countWithinTarget: boolean;
  readyForReview: boolean;
  findings: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function mappingConfidenceInterval(mapping: JobSkillMapping): MappingConfidenceInterval {
  const point = clamp(mapping.confidence ?? mapping.relevance);
  const completeness = clamp(mapping.evidenceCompleteness ?? Math.min(100, (mapping.evidenceRefs?.length || 0) * 25));
  const directEvidenceCount = Math.max(1, mapping.explanation?.evidenceAssessments.filter((item) => item.classification === "direct").length || mapping.evidenceRefs?.length || 1);
  const margin = clamp(Math.max(4, 18 - Math.min(8, directEvidenceCount * 2) + (100 - completeness) * 0.08));
  return { lower: clamp(point - margin), upper: clamp(point + margin), point, margin, method: "evidence-adjusted operational interval" };
}

export function analyseMappingProfile(job: JobDescription, mappings: JobSkillMapping[], workspace?: SkillWorkspace): MappingProfileQuality {
  const activeMappings = mappings.filter((mapping) => !["rejected", "deferred"].includes(mapping.status));
  const evidenceUniverse = job.evidenceSegments
    .filter((segment) => segment.normalizedType === "responsibility" || segment.normalizedType === "outcome")
    .map((segment) => segment.id);
  const evidenceOwners = new Map(evidenceUniverse.map((id) => [id, [] as string[]]));
  for (const mapping of activeMappings) for (const evidenceRef of mapping.evidenceRefs || []) {
    if (evidenceOwners.has(evidenceRef)) evidenceOwners.get(evidenceRef)!.push(mapping.id);
  }
  const coveredEvidence = [...evidenceOwners].filter(([, owners]) => owners.length === 1).map(([id]) => id);
  const uncoveredEvidence = [...evidenceOwners].filter(([, owners]) => owners.length === 0).map(([id]) => id);
  const overlappingEvidence = [...evidenceOwners].filter(([, owners]) => owners.length > 1).map(([evidenceRef, mappingIds]) => ({ evidenceRef, mappingIds }));
  const counts = new Map<string, number>();
  for (const mapping of activeMappings) counts.set(mapping.skillId, (counts.get(mapping.skillId) || 0) + 1);
  const duplicateSkillIds = [...counts].filter(([, count]) => count > 1).map(([skillId]) => skillId);
  const intervals = activeMappings.map(mappingConfidenceInterval);
  const averageConfidence = activeMappings.length ? clamp(activeMappings.reduce((sum, mapping) => sum + (mapping.confidence ?? mapping.relevance), 0) / activeMappings.length) : 0;
  const averageInterval = intervals.length
    ? { lower: clamp(intervals.reduce((sum, item) => sum + item.lower, 0) / intervals.length), upper: clamp(intervals.reduce((sum, item) => sum + item.upper, 0) / intervals.length), point: averageConfidence, margin: clamp(intervals.reduce((sum, item) => sum + item.margin, 0) / intervals.length), method: "evidence-adjusted operational interval" as const }
    : { lower: 0, upper: 0, point: 0, margin: 0, method: "evidence-adjusted operational interval" as const };
  const totalWeight = activeMappings.reduce((sum, mapping) => sum + mapping.weight, 0);
  const skillCount = activeMappings.length;
  const countWithinTarget = skillCount >= ROLE_SKILL_MIN && skillCount <= ROLE_SKILL_MAX;
  const mece = evidenceUniverse.length > 0 && uncoveredEvidence.length === 0 && overlappingEvidence.length === 0 && duplicateSkillIds.length === 0;
  const findings: string[] = [];
  if (!countWithinTarget) findings.push(skillCount < ROLE_SKILL_MIN ? `Profile needs ${ROLE_SKILL_MIN - skillCount} more distinct skill${ROLE_SKILL_MIN - skillCount === 1 ? "" : "s"}, or governed taxonomy-gap decisions.` : `Profile exceeds the ${ROLE_SKILL_MAX}-skill maximum by ${skillCount - ROLE_SKILL_MAX}.`);
  if (uncoveredEvidence.length) findings.push(`${uncoveredEvidence.length} responsibility/outcome evidence statement${uncoveredEvidence.length === 1 ? " is" : "s are"} not represented.`);
  if (overlappingEvidence.length) findings.push(`${overlappingEvidence.length} evidence statement${overlappingEvidence.length === 1 ? " has" : "s have"} more than one primary skill owner.`);
  if (duplicateSkillIds.length) findings.push(`${duplicateSkillIds.length} canonical skill${duplicateSkillIds.length === 1 ? " is" : "s are"} duplicated in the role profile.`);
  if (totalWeight !== 100) findings.push(`Profile weights total ${totalWeight}%; accountable review requires 100%.`);
  if (workspace) {
    const unknown = activeMappings.filter((mapping) => !workspace.skills.some((skill) => skill.id === mapping.skillId && skill.status === "approved"));
    if (unknown.length) findings.push(`${unknown.length} mapping${unknown.length === 1 ? " does" : "s do"} not resolve to the approved skill library.`);
  }
  const readyForReview = countWithinTarget && mece && totalWeight === 100 && findings.length === 0;
  return { activeMappings, evidenceUniverse, coveredEvidence, uncoveredEvidence, overlappingEvidence, duplicateSkillIds, totalWeight, skillCount, averageConfidence, averageInterval, mece, countWithinTarget, readyForReview, findings };
}
