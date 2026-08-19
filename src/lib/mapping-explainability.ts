import { mappingScoreContributions } from "@/lib/skill-governance";
import type { JobDescription, JobSkillMapping, MappingExplanation, MappingScoreBreakdown, SkillWorkspace } from "@/lib/skill-schema";

const labels: Record<keyof MappingScoreBreakdown, string> = {
  semanticRelevance: "Semantic relevance", directEvidenceStrength: "Direct evidence strength", responsibilityCoverage: "Responsibility coverage",
  outcomeRelevance: "Outcome relevance", taxonomyCompatibility: "Taxonomy compatibility", granularityCompatibility: "Granularity compatibility",
  kflaCompatibility: "KFLA compatibility", controlledToolRelevance: "Controlled tool relevance", proficiencyCompatibility: "Proficiency compatibility",
  approvedMappingSimilarity: "Approved mapping similarity", duplicatePenalty: "Duplicate penalty", contradictionPenalty: "Contradiction penalty",
  missingEvidencePenalty: "Missing evidence penalty",
};

export function buildMappingExplanation(mapping: JobSkillMapping, job: JobDescription, workspace: SkillWorkspace): MappingExplanation {
  const segments = new Map(job.evidenceSegments.map((segment) => [segment.id, segment]));
  const evidenceAssessments = (mapping.evidenceRefs || []).map((evidenceRef) => {
    const segment = segments.get(evidenceRef);
    const governed = workspace.evidenceRecords.find((item) => item.id === evidenceRef);
    return {
      evidenceRef,
      classification: segment || governed ? "direct" as const : "unsupported" as const,
      claim: mapping.rationale,
      excerpt: segment?.quotation || governed?.summary,
      sourceLabel: segment ? `${segment.sourceName} · ${segment.location}` : governed?.location,
    };
  });
  const scoreNarrative = mapping.scoreBreakdown
    ? mappingScoreContributions(mapping.scoreBreakdown, workspace.framework.mappingWeights).map((item) => ({
        dimension: item.key,
        score: mapping.scoreBreakdown![item.key],
        contribution: item.direction === "penalty" ? -item.contribution : item.contribution,
        evidenceRefs: mapping.evidenceRefs || [],
        explanation: `${labels[item.key]} ${item.direction === "penalty" ? "reduces" : "supports"} the recommendation under ${mapping.scoreVersion || workspace.framework.mappingScoreVersion}.`,
      }))
    : [];
  return {
    recommendationSummary: mapping.rationale,
    evidenceAssessments,
    scoreNarrative,
    relationshipCoverage: {
      responsibilityRefs: job.evidenceSegments.filter((item) => item.normalizedType === "responsibility" && (mapping.evidenceRefs || []).includes(item.id)).map((item) => item.id),
      outcomeRefs: job.evidenceSegments.filter((item) => item.normalizedType === "outcome" && (mapping.evidenceRefs || []).includes(item.id)).map((item) => item.id),
      toolIds: mapping.toolIds || [],
      kflaCompetencyIds: mapping.kflaCompetencyIds || [],
    },
    rejectedAlternatives: [],
    missingSkillSignals: [],
  };
}

export function mappingExplanationFindings(mapping: JobSkillMapping, job: JobDescription, workspace: SkillWorkspace) {
  const explanation = mapping.explanation || buildMappingExplanation(mapping, job, workspace);
  const findings: string[] = [];
  if (!explanation.recommendationSummary.trim()) findings.push("A concise recommendation summary is required.");
  if (!explanation.evidenceAssessments.some((item) => item.classification === "direct" && item.excerpt?.trim())) findings.push("At least one direct, quoted evidence item is required.");
  if (explanation.evidenceAssessments.some((item) => item.classification === "unsupported")) findings.push("Unsupported evidence claims must be removed or explicitly routed to clarification.");
  if (explanation.scoreNarrative.length !== 13) findings.push("All thirteen score dimensions require a reviewer-facing explanation.");
  return findings;
}
