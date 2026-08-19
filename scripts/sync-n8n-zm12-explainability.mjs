import fs from "node:fs";

const path = "docs/n8n-skill-designer-v3.workflow.json";
const workflow = JSON.parse(fs.readFileSync(path, "utf8"));
workflow.name = "DEKRA Skill Designer v3 — ZM-12 explainable mapping";
workflow.meta = { ...(workflow.meta || {}), targetMode: "ZM-12", mappingExplainability: true };

const agent = workflow.nodes.find((node) => node.name === "Governed Skill Design Agent");
if (!agent) throw new Error("Governed Skill Design Agent node not found.");
const contract = `\nZM-12 EXPLAINABILITY CONTRACT: For every mapping_proposal return explanation with recommendationSummary; evidenceAssessments [{evidenceRef,classification:direct|inferred|unsupported,claim,excerpt,sourceLabel}]; scoreNarrative with exactly the thirteen score dimensions and {dimension,score,contribution,evidenceRefs,explanation}; relationshipCoverage {responsibilityRefs,outcomeRefs,toolIds,kflaCompetencyIds}; rejectedAlternatives [{skillId,score,reason,evidenceRefs}]; and missingSkillSignals [{label,reason,evidenceRefs,recommendedAction:clarify|propose_taxonomy_gap|none}]. A proposed mapping requires at least one direct evidence assessment with a verbatim governed excerpt. Unsupported claims are blocking and must instead become clarification or a missing-skill signal. Provide concise decision rationale, never hidden chain-of-thought. Mapping output remains needs_review and may never approve or publish.`;
if (!agent.parameters.options.systemMessage.includes("ZM-12 EXPLAINABILITY CONTRACT")) agent.parameters.options.systemMessage += contract;

const store = workflow.nodes.find((node) => node.name === "Governance Gate and v3 Store");
if (!store) throw new Error("Governance store node not found.");
let code = store.parameters.jsCode;
const validationNeedle = "if(!item.scoreBreakdown||mappingScoreKeys.some(key=>!Number.isFinite(Number(item.scoreBreakdown[key]))||Number(item.scoreBreakdown[key])<0||Number(item.scoreBreakdown[key])>100))add('MAPPING-SCORE-001','scoreBreakdown','The thirteen-part score is incomplete or outside 0-100.','Provide all ten positive dimensions and three penalties.');";
const validationAdd = `${validationNeedle}const explanation=item.explanation||{};const assessments=Array.isArray(explanation.evidenceAssessments)?explanation.evidenceAssessments:[];const narrative=Array.isArray(explanation.scoreNarrative)?explanation.scoreNarrative:[];if(!String(explanation.recommendationSummary||'').trim())add('MAPPING-EXPLAIN-001','explanation.recommendationSummary','The reviewer-facing recommendation summary is missing.','Provide a concise decision rationale without hidden chain-of-thought.');if(!assessments.some(entry=>entry.classification==='direct'&&String(entry.excerpt||'').trim()&&evidenceIds.has(entry.evidenceRef)))add('MAPPING-EXPLAIN-002','explanation.evidenceAssessments','No direct governed excerpt supports the recommendation.','Link at least one resolvable direct evidence excerpt.');if(assessments.some(entry=>entry.classification==='unsupported'))add('MAPPING-EXPLAIN-003','explanation.evidenceAssessments','Unsupported claims cannot support a proposed mapping.','Route the claim to clarification or a missing-skill signal.');if(narrative.length!==13||mappingScoreKeys.some(key=>!narrative.some(entry=>entry.dimension===key&&Number.isFinite(Number(entry.score))&&String(entry.explanation||'').trim())))add('MAPPING-EXPLAIN-004','explanation.scoreNarrative','The thirteen score dimensions are not fully explained.','Explain each score contribution and its evidence references.');`;
if (!code.includes("MAPPING-EXPLAIN-001")) {
  if (!code.includes(validationNeedle)) throw new Error("Mapping validation insertion point not found.");
  code = code.replace(validationNeedle, validationAdd);
}
const persistNeedle = "evaluationDatasetVersion:'DEKRA-MAPPING-GOLDEN-001@2.0.0',source:'agent',status:'proposed'";
const persistAdd = "evaluationDatasetVersion:'DEKRA-MAPPING-GOLDEN-001@2.0.0',explanation:item.explanation,source:'agent',status:'proposed'";
if (!code.includes("explanation:item.explanation")) {
  if (!code.includes(persistNeedle)) throw new Error("Mapping persistence insertion point not found.");
  code = code.replace(persistNeedle, persistAdd);
}
store.parameters.jsCode = code;
fs.writeFileSync(path, JSON.stringify(workflow, null, 2) + "\n");
console.log("Synchronized ZM-12 explainability contract, validation and governed persistence.");
