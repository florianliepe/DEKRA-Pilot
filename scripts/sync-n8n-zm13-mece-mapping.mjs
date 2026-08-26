import fs from "node:fs";

const path = "docs/n8n-skill-designer-v3.workflow.json";
const workflow = JSON.parse(fs.readFileSync(path, "utf8"));
workflow.name = "DEKRA Skill Designer v3 — ZM-13 MECE mapping";
workflow.meta = { ...(workflow.meta || {}), targetMode: "ZM-13", meceRoleProfiles: true, roleSkillMinimum: 8, roleSkillMaximum: 10 };

const context = workflow.nodes.find((node) => node.name === "Build Governed Agent Context");
if (!context) throw new Error("Build Governed Agent Context node not found.");
const ruleNeedle = "'Return at most 10 job mappings.'";
const ruleReplacement = "'Compose 8 to 10 distinct role skills across approved mappings and governed taxonomy gaps.','Assign every material responsibility or outcome evidence ID to exactly one primary mapping or taxonomy gap.','Allocate exactly 100 profile-weight points across the complete proposed profile.','Return at most 10 job mappings.'";
if (!context.parameters.jsCode.includes("Assign every material responsibility")) {
  if (!context.parameters.jsCode.includes(ruleNeedle)) throw new Error("ZM-13 context rule insertion point not found.");
  context.parameters.jsCode = context.parameters.jsCode.replace(ruleNeedle, ruleReplacement);
}

const agent = workflow.nodes.find((node) => node.name === "Governed Skill Design Agent");
if (!agent) throw new Error("Governed Skill Design Agent node not found.");
agent.parameters.options.systemMessage = agent.parameters.options.systemMessage.replace(
  '"new_skill_proposals":[{"name":string,"action":string,"object":string,"outcome":string,"definition":string,"observability":string,"dimension":string,"evidence":string,"evidenceLocation":string,"confidence":number,"rationale":string,"validationFindings":[]}]',
  '"new_skill_proposals":[{"name":string,"action":string,"object":string,"outcome":string,"definition":string,"observability":string,"dimension":string,"evidence":string,"evidenceLocation":string,"evidenceRefs":[],"profileWeight":number,"confidence":number,"rationale":string,"duplicateAnalysis":string,"inclusionCriteria":[],"exclusionCriteria":[],"validationFindings":[]}]',
);
const contract = `\nZM-13 MECE ROLE PROFILE CONTRACT: For skill.map_job compose a complete proposed profile of 8 to 10 distinct skills across mapping_proposals and evidence-grounded new_skill_proposals. Assign each material responsibility or outcome evidence ID to exactly one primary proposal: zero owners is a collective-exhaustiveness failure and multiple owners is a mutual-exclusivity failure. Allocate exactly 100 total weight points across mapping_proposals.weight and new_skill_proposals.profileWeight. Prefer approved canonical skills. Create a new-skill draft only when no approved skill meets the governed threshold; include Action + Object + Outcome syntax, direct evidenceRefs, observability, inclusion/exclusion boundaries, duplicateAnalysis and confidence. Do not pad a profile with weak matches. Tools are evidence for a capability, not skills by themselves. Return all proposals as drafts and stop at needs_review.`;
if (!agent.parameters.options.systemMessage.includes("ZM-13 MECE ROLE PROFILE CONTRACT")) agent.parameters.options.systemMessage += contract;

const store = workflow.nodes.find((node) => node.name === "Governance Gate and v3 Store");
if (!store) throw new Error("Governance store node not found.");
let code = store.parameters.jsCode;
const findingsNeedle = "const mappingFindings=[];if(!(result.mapping_proposals||[]).length";
const findingsAdd = "const mappingFindings=[];const proposals=result.mapping_proposals||[];const gaps=result.new_skill_proposals||[];const materialIds=(job?.evidenceSegments||[]).filter(item=>['responsibility','outcome'].includes(item.normalizedType)).map(item=>item.id);const ownerMap=new Map(materialIds.map(id=>[id,[]]));for(const [index,item] of proposals.entries())for(const evidenceRef of (item.evidenceRefs||[]))if(ownerMap.has(evidenceRef))ownerMap.get(evidenceRef).push('mapping-'+(index+1));for(const [index,item] of gaps.entries())for(const evidenceRef of (item.evidenceRefs||[]))if(ownerMap.has(evidenceRef))ownerMap.get(evidenceRef).push('gap-'+(index+1));const candidateCount=proposals.length+gaps.length;const totalProfileWeight=[...proposals.map(item=>Number(item.weight||0)),...gaps.map(item=>Number(item.profileWeight||0))].reduce((sum,value)=>sum+value,0);const globalFinding=(ruleId,field,explanation,correction,evidenceReference)=>mappingFindings.push({id:`FND-${ruleId}-${body.jobDescriptionId}`,ruleId,severity:'error',entityType:'job_description',entityId:String(body.jobDescriptionId),affectedField:field,explanation,suggestedCorrection:correction,blocking:true,frameworkVersion,evidenceReference});if(candidateCount<8||candidateCount>10)globalFinding('MAPPING-PROFILE-SIZE-001','mapping_proposals',`The complete role profile contains ${candidateCount} skills or governed gaps; 8 to 10 are required.`,'Consolidate overlaps or add evidence-grounded mappings/taxonomy gaps without padding weak matches.',materialIds[0]);if(Math.round(totalProfileWeight)!==100)globalFinding('MAPPING-PROFILE-WEIGHT-001','weight',`The complete proposed profile allocates ${totalProfileWeight}% instead of 100%.`,'Allocate exactly 100 weight points across mappings and taxonomy gaps.',materialIds[0]);const duplicateSkills=[...new Set(proposals.map(item=>item.skillId).filter((id,index,all)=>all.indexOf(id)!==index))];if(duplicateSkills.length)globalFinding('MAPPING-MECE-DUPLICATE-001','skillId','The same canonical skill appears more than once in the role profile.','Merge duplicate links into one skill mapping.',materialIds[0]);for(const [evidenceRef,owners] of ownerMap){if(!owners.length)globalFinding('MAPPING-MECE-COVERAGE-001','evidenceRefs',`Material evidence ${evidenceRef} has no primary skill owner.`,'Assign the evidence to one approved mapping or governed taxonomy gap.',evidenceRef);if(owners.length>1)globalFinding('MAPPING-MECE-OVERLAP-001','evidenceRefs',`Material evidence ${evidenceRef} has ${owners.length} primary skill owners.`,'Retain exactly one primary owner and explain other candidates as alternatives.',evidenceRef);}for(const [index,gap] of gaps.entries()){const evidenceRefs=Array.isArray(gap.evidenceRefs)?gap.evidenceRefs:[];if(!String(gap.action||'').trim()||!String(gap.object||'').trim()||!String(gap.outcome||'').trim()||!String(gap.observability||'').trim()||!String(gap.duplicateAnalysis||'').trim()||!evidenceRefs.length||evidenceRefs.some(id=>!evidenceIds.has(id)))globalFinding('MAPPING-GAP-DESIGN-001','new_skill_proposals',`Taxonomy gap ${index+1} lacks governed syntax, boundary, duplicate analysis or direct evidence.`,'Provide Action + Object + Outcome, observability, inclusion/exclusion boundaries, duplicate analysis and resolvable evidenceRefs.',evidenceRefs[0]||materialIds[0]);}if(!(result.mapping_proposals||[]).length";
if (!code.includes("MAPPING-PROFILE-SIZE-001")) {
  if (!code.includes(findingsNeedle)) throw new Error("ZM-13 mapping validation insertion point not found.");
  code = code.replace(findingsNeedle, findingsAdd);
}
const gapPayloadNeedle = "payload:{validationFindings:item.validationFindings||[]}";
const gapPayloadAdd = "payload:{validationFindings:item.validationFindings||[],evidenceRefs:item.evidenceRefs||[],profileWeight:Number(item.profileWeight||0),duplicateAnalysis:item.duplicateAnalysis||'',inclusionCriteria:item.inclusionCriteria||[],exclusionCriteria:item.exclusionCriteria||[],jobDescriptionId:body.jobDescriptionId||null}";
if (!code.includes("profileWeight:Number(item.profileWeight")) {
  if (!code.includes(gapPayloadNeedle)) throw new Error("ZM-13 gap persistence insertion point not found.");
  code = code.replace(gapPayloadNeedle, gapPayloadAdd);
}
store.parameters.jsCode = code;

fs.writeFileSync(path, JSON.stringify(workflow, null, 2) + "\n");
console.log("Synchronized ZM-13 MECE profile contract, validation and taxonomy-gap evidence persistence.");
