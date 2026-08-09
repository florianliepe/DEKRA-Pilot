import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dataset = JSON.parse(readFileSync(resolve(root, "data/evaluation/mapping-golden-baseline.json"), "utf8"));
const framework = JSON.parse(readFileSync(resolve(root, "data/framework-config.json"), "utf8"));
const penaltyKeys = new Set(["duplicatePenalty", "contradictionPenalty", "missingEvidencePenalty"]);
const dimensionKeys = Object.keys(framework.mappingWeights);

if (dataset.mappingModelVersion !== framework.mappingScoreVersion) throw new Error(`Dataset targets ${dataset.mappingModelVersion}, active model is ${framework.mappingScoreVersion}.`);
if (dataset.frameworkVersion !== framework.version || dataset.rulesVersion !== framework.rulesVersion || dataset.promptVersion !== framework.promptVersion) throw new Error("Golden dataset framework, rules or prompt version has drifted from the active configuration.");
if (dimensionKeys.length !== 13) throw new Error("The active mapping model must contain thirteen dimensions.");

const score = (breakdown) => {
  if (Object.keys(breakdown).length !== 13 || dimensionKeys.some((key) => breakdown[key] === undefined)) throw new Error("A candidate does not contain the active thirteen-dimensional score contract.");
  const positiveWeight = dimensionKeys.filter((key) => !penaltyKeys.has(key)).reduce((sum, key) => sum + framework.mappingWeights[key], 0);
  const weighted = dimensionKeys.reduce((sum, key) => sum + (penaltyKeys.has(key) ? -1 : 1) * Math.max(0, Math.min(100, breakdown[key])) * framework.mappingWeights[key], 0);
  return Math.max(0, Math.min(100, Math.round(weighted / positiveWeight)));
};

for (const evaluation of dataset.cases) {
  const ranked = evaluation.candidates.map((candidate) => ({ skillId: candidate.skillId, score: score(candidate.breakdown) })).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const runnerUp = ranked[1]?.score ?? top.score;
  if (top.skillId !== evaluation.expectedTopCandidateId) throw new Error(`${evaluation.id}: expected ${evaluation.expectedTopCandidateId}, received ${top.skillId}.`);
  if (evaluation.minimumTopScore !== undefined && top.score < evaluation.minimumTopScore) throw new Error(`${evaluation.id}: score ${top.score} is below ${evaluation.minimumTopScore}.`);
  if (evaluation.maximumTopScore !== undefined && top.score > evaluation.maximumTopScore) throw new Error(`${evaluation.id}: score ${top.score} exceeds ${evaluation.maximumTopScore}.`);
  if (ranked.length > 1 && top.score - runnerUp < evaluation.minimumMargin) throw new Error(`${evaluation.id}: margin ${top.score - runnerUp} is below ${evaluation.minimumMargin}.`);
  const decision = top.score >= dataset.abstentionThreshold ? "map" : "abstain";
  if (decision !== evaluation.expectedDecision) throw new Error(`${evaluation.id}: expected ${evaluation.expectedDecision}, received ${decision} at ${top.score}.`);
  console.log(`${evaluation.id}: ${top.skillId} ${top.score}${ranked.length > 1 ? ` (margin ${top.score - runnerUp})` : ""}`);
}

console.log(`Mapping evaluation passed: ${dataset.cases.length} public-safe synthetic mapping and abstention cases against ${dataset.mappingModelVersion}.`);
