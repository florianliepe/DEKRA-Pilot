import { readFileSync, writeFileSync } from "node:fs";

const workflowPath = "docs/n8n-skill-designer-v3.workflow.json";
const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
const context = workflow.nodes.find((node) => node.name === "Build Governed Agent Context");
const agent = workflow.nodes.find((node) => node.name === "Governed Skill Design Agent");
const executor = workflow.nodes.find((node) => node.name === "Deterministic Tool Policy Executor");
const gate = workflow.nodes.find((node) => node.name === "Governance Gate and v3 Store");
if (!context || !agent || !executor || !gate) throw new Error("Expected governed mapping nodes are missing.");

if (!context.parameters.jsCode.includes("mappingWeights:workspace.framework?.mappingWeights")) {
  context.parameters.jsCode = context.parameters.jsCode.replace(
    "promptVersion:workspace.framework?.promptVersion||'skill-agent-2.0.0',allowed_tools",
    "promptVersion:workspace.framework?.promptVersion||'skill-agent-2.0.0',mappingScoreVersion:workspace.framework?.mappingScoreVersion||'mapping-2.0.0',mappingWeights:workspace.framework?.mappingWeights||{},mappingEvaluationVersion:'DEKRA-MAPPING-GOLDEN-001@2.0.0',abstentionThreshold:60,allowed_tools",
  );
  if (!context.parameters.jsCode.includes("mappingEvaluationVersion:'DEKRA-MAPPING-GOLDEN-001@2.0.0'")) throw new Error("Unable to add the ZM-05 score contract to agent context.");
}

if (!agent.parameters.options.systemMessage.includes("ZM-05 MAPPING QUALITY CONTRACT")) {
  agent.parameters.options.systemMessage += "\nZM-05 MAPPING QUALITY CONTRACT: Every mapping proposal must reference an approved skill and one or more resolvable evidenceRefs, include all thirteen score fields between 0 and 100, explain penalties and omissions, and use the supplied weighted score model. Scores below the abstention threshold must be omitted and explained. Preserve framework, rules, prompt, score and golden-evaluation versions. Never self-approve or suppress a blocking validation finding.";
}

if (!executor.parameters.jsCode.includes("mappingEvaluationVersion:'DEKRA-MAPPING-GOLDEN-001@2.0.0'")) {
  executor.parameters.jsCode = executor.parameters.jsCode.replace(
    "promptVersion:context.workspaceCandidate.framework?.promptVersion,trace:",
    "promptVersion:context.workspaceCandidate.framework?.promptVersion,mappingEvaluationVersion:'DEKRA-MAPPING-GOLDEN-001@2.0.0',trace:",
  );
}

let code = gate.parameters.jsCode;
const validationMarker = "const mappingScoreKeys=['semanticRelevance'";
if (!code.includes(validationMarker)) {
  const mappingStart = "if($json.mode==='skill.map_job'){const jobId=body.jobDescriptionId;";
  const validation = `const mappingScoreKeys=['semanticRelevance','directEvidenceStrength','responsibilityCoverage','outcomeRelevance','taxonomyCompatibility','granularityCompatibility','kflaCompatibility','controlledToolRelevance','proficiencyCompatibility','approvedMappingSimilarity','duplicatePenalty','contradictionPenalty','missingEvidencePenalty'];
if($json.mode==='skill.map_job'){const job=workspace.jobDescriptions.find(item=>item.id===body.jobDescriptionId);const evidenceIds=new Set([...(job?.evidenceSegments||[]).map(item=>item.id),...(workspace.evidenceRecords||[]).map(item=>item.id)]);const approvedSkillIds=new Set((workspace.skills||[]).filter(item=>item.status==='approved').map(item=>item.id));const mappingFindings=[];for(const [index,item] of (result.mapping_proposals||[]).entries()){const entityId=\`PROPOSAL-\${index+1}\`;const add=(ruleId,field,explanation,correction)=>mappingFindings.push({id:\`FND-\${ruleId}-\${entityId}\`,ruleId,severity:'error',entityType:'mapping',entityId,affectedField:field,explanation,suggestedCorrection:correction,blocking:true,frameworkVersion,evidenceReference:(item.evidenceRefs||[])[0]});if(!approvedSkillIds.has(item.skillId))add('MAPPING-CATALOG-001','skillId','Proposal does not resolve to an approved canonical skill.','Select an approved taxonomy skill.');if(!Array.isArray(item.evidenceRefs)||!item.evidenceRefs.length||item.evidenceRefs.some(id=>!evidenceIds.has(id)))add('MAPPING-EVIDENCE-REF-001','evidenceRefs','Proposal evidence does not resolve to governed job evidence.','Link direct source or clarification evidence.');if(!item.scoreBreakdown||mappingScoreKeys.some(key=>!Number.isFinite(Number(item.scoreBreakdown[key]))||Number(item.scoreBreakdown[key])<0||Number(item.scoreBreakdown[key])>100))add('MAPPING-SCORE-001','scoreBreakdown','The thirteen-part score is incomplete or outside 0-100.','Provide all ten positive dimensions and three penalties.');else if(clampScore(item.scoreBreakdown)<60)add('MAPPING-ABSTENTION-001','scoreBreakdown','Candidate is below the governed mapping threshold.','Move the candidate to mapping omissions and explain why it was not mapped.');}if(mappingFindings.length){if($json.agentRun){$json.agentRun.status='failed';$json.agentRun.error={code:'MAPPING_VALIDATION_FAILED',message:'Agent mapping output failed governed validation.',retryable:false};}workspace.agentRuns=[...($json.agentRun?[$json.agentRun]:[]),...workspace.agentRuns].slice(0,100);workspace.auditLog=[{id:\`AUD-\${$json.correlationId}-mapping-validation\`,at:new Date().toISOString(),actor:'agent',action:'mapping.validation_failed',entityType:'job_description',entityId:String(body.jobDescriptionId),summary:\`\${mappingFindings.length} blocking mapping findings; no proposals persisted.\`,correlationId:$json.correlationId,frameworkVersion},...workspace.auditLog].slice(0,500);workspace.revision=Number(workspace.revision||0)+1;workspace.updatedAt=new Date().toISOString();store.workspace=workspace;return[{json:{ok:false,statusCode:422,error:'Agent mapping output failed governed validation; no mapping proposals were persisted.',findings:mappingFindings,workspace,agentRun:$json.agentRun}}];}}
`;
  if (!code.includes(mappingStart)) throw new Error("Mapping persistence block was not found.");
  code = code.replace(mappingStart, `${validation}${mappingStart}`);
}

code = code.replace(
  "scoreVersion:workspace.framework?.mappingScoreVersion,source:'agent'",
  "scoreVersion:workspace.framework?.mappingScoreVersion,frameworkVersion,rulesVersion,promptVersion:workspace.framework?.promptVersion,evaluationDatasetVersion:'DEKRA-MAPPING-GOLDEN-001@2.0.0',source:'agent'",
);
code = code.replace(
  "frameworkVersion,rulesVersion,status:'pending'});}}",
  "frameworkVersion,rulesVersion,status:'pending',payload:{validationFindings:[],scoreVersion:workspace.framework?.mappingScoreVersion,promptVersion:workspace.framework?.promptVersion,evaluationDatasetVersion:'DEKRA-MAPPING-GOLDEN-001@2.0.0'}});}}",
);

const oldClamp = "function clampScore(score){if(!score)return 0;const penalties=(Number(score.duplicatePenalty)||0)+(Number(score.contradictionPenalty)||0)+(Number(score.missingEvidencePenalty)||0);const positives=['semanticRelevance','directEvidenceStrength','responsibilityCoverage','outcomeRelevance','taxonomyCompatibility','granularityCompatibility','kflaCompatibility','controlledToolRelevance','proficiencyCompatibility','approvedMappingSimilarity'].reduce((sum,key)=>sum+(Number(score[key])||0),0)/10;return Math.max(0,Math.min(100,Math.round(positives-penalties/10)));}";
const newClamp = "function clampScore(score){if(!score)return 0;const weights=workspace.framework?.mappingWeights||{semanticRelevance:14,directEvidenceStrength:14,responsibilityCoverage:10,outcomeRelevance:10,taxonomyCompatibility:9,granularityCompatibility:8,kflaCompatibility:6,controlledToolRelevance:5,proficiencyCompatibility:8,approvedMappingSimilarity:6,duplicatePenalty:4,contradictionPenalty:3,missingEvidencePenalty:3};const penalties=new Set(['duplicatePenalty','contradictionPenalty','missingEvidencePenalty']);const keys=Object.keys(weights);const positiveWeight=keys.filter(key=>!penalties.has(key)).reduce((sum,key)=>sum+Number(weights[key]||0),0);const weighted=keys.reduce((sum,key)=>sum+(penalties.has(key)?-1:1)*Math.max(0,Math.min(100,Number(score[key])||0))*Number(weights[key]||0),0);return Math.max(0,Math.min(100,Math.round(weighted/positiveWeight)));}";
if (code.includes(oldClamp)) code = code.replace(oldClamp, newClamp);
else if (!code.includes("const weights=workspace.framework?.mappingWeights")) throw new Error("Legacy mapping score function was not found.");

const duplicateProfile = "if($json.mode==='skill.map_job'){workspace.mappingOmissions=workspace.mappingOmissions.filter(item=>item.jobDescriptionId!==body.jobDescriptionId||item.status==='superseded');for(const [index,item] of (result.mapping_omissions||[]).entries())workspace.mappingOmissions.push({id:`OMIT-${now}-${index+1}`,jobDescriptionId:body.jobDescriptionId,skillId:item.skillId,reason:item.reason,evidenceRefs:item.evidenceRefs,score:Number(item.score||0),status:'explained',agentRunId:$json.agentRun?.id});if(result.profile_proposal){const profileId=String(result.profile_proposal.id||`PROFILE-${body.jobDescriptionId}`);workspace.profiles=[...workspace.profiles.filter(item=>item.id!==profileId),{...result.profile_proposal,id:profileId,jobDescriptionId:body.jobDescriptionId,status:'draft',agentRunId:$json.agentRun?.id,skills:(result.profile_proposal.skills||[]).filter(link=>workspace.mappings.some(mapping=>mapping.jobDescriptionId===body.jobDescriptionId&&mapping.skillId===link.skillId)),excludedLinks:result.profile_proposal.excludedLinks||[]}];}}";
const occurrences = code.split(duplicateProfile).length - 1;
if (occurrences > 1) code = code.replace(new RegExp(duplicateProfile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), (match, offset) => offset === code.indexOf(duplicateProfile) ? match : "");

gate.parameters.jsCode = code;
writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`);
console.log("ZM-05 weighted scoring, abstention, lineage and fail-closed mapping validation synchronized.");
