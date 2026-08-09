import type { MappingEvaluationDataset, MappingScoreBreakdown, SkillWorkspace } from "./skill-schema";
import { calculateMappingScore } from "./skill-governance";

export type MappingEvaluationResult = {
  id: string;
  title: string;
  passed: boolean;
  expectedDecision: "map" | "abstain";
  actualDecision: "map" | "abstain";
  topCandidateId: string;
  topScore: number;
  margin: number;
  failures: string[];
};

export function evaluateMappingDataset(dataset: MappingEvaluationDataset, workspace: SkillWorkspace) {
  const versionAligned = dataset.frameworkVersion === workspace.framework.version
    && dataset.rulesVersion === workspace.framework.rulesVersion
    && dataset.promptVersion === workspace.framework.promptVersion
    && dataset.mappingModelVersion === workspace.framework.mappingScoreVersion;
  const results: MappingEvaluationResult[] = dataset.cases.map((testCase) => {
    const ranked = testCase.candidates
      .map((candidate) => ({ skillId: candidate.skillId, score: calculateMappingScore(candidate.breakdown, workspace.framework.mappingWeights) }))
      .sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const margin = ranked.length > 1 ? top.score - ranked[1].score : 0;
    const actualDecision = top.score >= dataset.abstentionThreshold ? "map" as const : "abstain" as const;
    const failures: string[] = [];
    if (testCase.expectedTopCandidateId && top.skillId !== testCase.expectedTopCandidateId) failures.push(`Expected ${testCase.expectedTopCandidateId}, received ${top.skillId}.`);
    if (actualDecision !== testCase.expectedDecision) failures.push(`Expected ${testCase.expectedDecision}, received ${actualDecision}.`);
    if (testCase.minimumTopScore !== undefined && top.score < testCase.minimumTopScore) failures.push(`Score ${top.score} is below ${testCase.minimumTopScore}.`);
    if (testCase.maximumTopScore !== undefined && top.score > testCase.maximumTopScore) failures.push(`Score ${top.score} exceeds ${testCase.maximumTopScore}.`);
    if (ranked.length > 1 && margin < testCase.minimumMargin) failures.push(`Margin ${margin} is below ${testCase.minimumMargin}.`);
    return { id: testCase.id, title: testCase.title, passed: failures.length === 0, expectedDecision: testCase.expectedDecision, actualDecision, topCandidateId: top.skillId, topScore: top.score, margin, failures };
  });
  const passed = results.filter((result) => result.passed).length;
  const abstentionCases = results.filter((result) => result.expectedDecision === "abstain");
  const mappedCases = results.filter((result) => result.expectedDecision === "map");
  return {
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    versionAligned,
    passed,
    failed: results.length - passed,
    passRate: results.length ? Math.round(passed / results.length * 100) : 0,
    mappingAccuracy: mappedCases.length ? Math.round(mappedCases.filter((result) => result.passed).length / mappedCases.length * 100) : 0,
    abstentionAccuracy: abstentionCases.length ? Math.round(abstentionCases.filter((result) => result.actualDecision === "abstain").length / abstentionCases.length * 100) : 0,
    results,
  };
}

export function hasCompleteScoreBreakdown(value?: MappingScoreBreakdown) {
  if (!value) return false;
  return Object.values(value).length === 13 && Object.values(value).every((score) => Number.isFinite(score) && score >= 0 && score <= 100);
}
