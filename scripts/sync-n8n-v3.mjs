import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publisherPath = join(root, "docs", "n8n-skill-publisher-v3.workflow.json");
const workflow = JSON.parse(readFileSync(publisherPath, "utf8"));
const node = workflow.nodes.find((candidate) => candidate.name === "Validate and Prepare Atomic Release");
if (!node) throw new Error("Publisher validation node not found.");

const legacySanitizer = "const now=new Date().toISOString();const sanitized={...workspace,kfla:(workspace.kfla||[]).map(item=>({...item,definition:item.source==='licensed'?'':item.definition,licensedDefinitionRef:undefined}))};";
const approvedSanitizer = "const now=new Date().toISOString();const approvedSkills=(workspace.skills||[]).filter(item=>item.status==='approved');const approvedSkillIds=new Set(approvedSkills.map(item=>item.id));const approvedGroups=(workspace.groups||[]).filter(item=>item.status==='approved');const approvedGroupIds=new Set(approvedGroups.map(item=>item.id));const approvedDomainIds=new Set(approvedGroups.map(item=>item.domainId));const sanitized={...workspace,domains:(workspace.domains||[]).filter(item=>item.status==='approved'&&approvedDomainIds.has(item.id)),groups:approvedGroups,relationships:(workspace.relationships||[]).filter(item=>item.status==='approved'&&approvedSkillIds.has(item.sourceId)&&approvedSkillIds.has(item.targetId)),skills:approvedSkills.filter(item=>approvedGroupIds.has(item.groupId)),profiles:(workspace.profiles||[]).filter(item=>item.status==='approved').map(item=>({...item,skills:(item.skills||[]).filter(link=>approvedSkillIds.has(link.skillId))})),jobDescriptions:(workspace.jobDescriptions||[]).filter(item=>item.status==='mapped'),mappings:(workspace.mappings||[]).filter(item=>item.status==='approved'&&approvedSkillIds.has(item.skillId)),strategicVectors:(workspace.strategicVectors||[]).map(item=>({...item,skillIds:(item.skillIds||[]).filter(id=>approvedSkillIds.has(id))})),tools:(workspace.tools||[]).filter(item=>item.status==='approved').map(item=>({...item,skillIds:(item.skillIds||[]).filter(id=>approvedSkillIds.has(id))})),agentTools:(workspace.agentTools||[]).filter(item=>item.lifecycleStatus==='active'),validationRules:(workspace.validationRules||[]).filter(item=>item.enabled),interviews:[],elicitationSessions:[],agentRuns:[],agentToolInvocations:[],objectVersions:[],kfla:(workspace.kfla||[]).map(item=>({...item,definition:item.source==='licensed'?'':item.definition,licensedDefinitionRef:undefined}))};";
const publisherValidationBlock = "if((workspace.proficiencyDefinitions||[]).length!==4||new Set((workspace.proficiencyDefinitions||[]).map(item=>item.id)).size!==4||(workspace.proficiencyDefinitions||[]).some(item=>!Array.isArray(item.behavioralIndicators)||!item.behavioralIndicators.length))findings.push({ruleId:'PROFICIENCY-INTEGRITY-001',explanation:'Four governed proficiency definitions with behavioral indicators are required.',blocking:true});for(const evidence of (workspace.evidenceRecords||[]).filter(item=>!['archived','retired'].includes(item.status))){if(!(workspace.sources||[]).some(source=>source.id===evidence.sourceId&&!['archived','retired'].includes(source.status)))findings.push({ruleId:'EVIDENCE-SOURCE-001',entityId:evidence.id,explanation:'Evidence does not resolve to an active governed source.',blocking:true});}";
const multilingualValidationBlock = "const conceptIds=new Set([...(workspace.domains||[]).map(item=>`domain:${item.id}`),...(workspace.groups||[]).map(item=>`group:${item.id}`),...(workspace.skills||[]).map(item=>`skill:${item.id}`),...(workspace.kflaFactors||[]).map(item=>`kfla_factor:${item.id}`),...(workspace.kflaClusters||[]).map(item=>`kfla_cluster:${item.id}`),...(workspace.kfla||[]).map(item=>`kfla_competency:${item.id}`),...(workspace.tools||[]).map(item=>`controlled_tool:${item.id}`)]);const localizedKeys=new Set();for(const label of (workspace.localizedLabels||[]).filter(item=>!['archived','retired'].includes(item.status))){const key=`${label.entityType}:${label.entityId}:${String(label.language||'').toLowerCase()}`;if(!conceptIds.has(`${label.entityType}:${label.entityId}`)||!(workspace.framework?.supportedLanguages||[]).includes(label.language)||!String(label.label||'').trim()||localizedKeys.has(key))findings.push({ruleId:'MULTILINGUAL-INTEGRITY-001',entityId:label.id,explanation:'Localized labels require a canonical concept, supported language, non-empty label and unique concept/language pair.',blocking:true});localizedKeys.add(key);}";
const mappingFeedbackValidationBlock = "for(const feedback of (workspace.mappingFeedback||[])){if(!(workspace.mappings||[]).some(mapping=>mapping.id===feedback.mappingId)||!String(feedback.reviewer||'').trim()||!String(feedback.reason||'').trim()||Number(feedback.evidenceCompleteness)<0||Number(feedback.evidenceCompleteness)>100)findings.push({ruleId:'MAPPING-FEEDBACK-001',entityId:feedback.id,explanation:'Mapping feedback requires an existing mapping, accountable reviewer, reason and valid evidence completeness.',blocking:true});}";
const relationshipValidationBlock = "const activeSkillIds=new Set((workspace.skills||[]).filter(item=>!['archived','retired'].includes(item.status)).map(item=>item.id));const relationshipKeys=new Set();for(const relationship of (workspace.relationships||[]).filter(item=>!['archived','retired'].includes(item.status))){const key=`${relationship.sourceId}:${relationship.type}:${relationship.targetId}`;if(relationship.sourceId===relationship.targetId||!activeSkillIds.has(relationship.sourceId)||!activeSkillIds.has(relationship.targetId)||!String(relationship.rationale||'').trim()||relationshipKeys.has(key))findings.push({ruleId:'RELATIONSHIP-INTEGRITY-001',entityId:relationship.id,explanation:'Active relationships require distinct active endpoints, rationale and a unique graph edge.',blocking:true});relationshipKeys.add(key);}";
const agentRegistryValidationBlock = "const requiredAgentToolIds=['job_parser','evidence_extractor','taxonomy_search','skill_similarity_search','syntax_validator','granularity_validator','kfla_lookup','controlled_tool_lookup','mapping_scorer','draft_suggestion_writer','review_package_generator'];const agentToolIds=new Set();const completeSchema=schema=>schema?.type==='object'&&schema.properties&&Object.keys(schema.properties).length>0&&(schema.required||[]).every(field=>schema.properties[field]);for(const tool of (workspace.agentTools||[])){const complete=completeSchema(tool.inputSchema)&&completeSchema(tool.outputSchema)&&/^skill\\./.test(tool.requiredPermission||'')&&Array.isArray(tool.allowedDataClassifications)&&tool.allowedDataClassifications.length>0&&!tool.allowedDataClassifications.includes('licensed')&&Number(tool.timeoutMs)>0&&Number(tool.retryPolicy?.maxAttempts)>0&&Number(tool.retryPolicy?.backoffMs)>=0&&Array.isArray(tool.retryPolicy?.retryableErrors)&&tool.retryPolicy.retryableErrors.length>0&&Number(tool.rateLimit?.requests)>0&&Number(tool.rateLimit?.windowSeconds)>0&&Array.isArray(tool.errorContract?.codes)&&tool.errorContract.codes.length>0&&tool.errorContract.redactInputs===true&&['correlationId','actingUser','durationMs','result'].every(field=>(tool.auditRequirements||[]).includes(field))&&/^\\d+\\.\\d+\\.\\d+$/.test(tool.version||'')&&String(tool.owner||'').trim()&&(tool.allowedAgentActions||[]).length>0;if(agentToolIds.has(tool.id)||!complete||(tool.replacementToolId&&!(workspace.agentTools||[]).some(candidate=>candidate.id===tool.replacementToolId&&candidate.id!==tool.id)))findings.push({ruleId:'AGENT-REGISTRY-001',entityId:tool.id,explanation:'Agent-tool identity, lineage or callable contract is incomplete.',blocking:true});agentToolIds.add(tool.id);}const missingAgentTools=requiredAgentToolIds.filter(id=>!(workspace.agentTools||[]).some(tool=>tool.id===id&&tool.lifecycleStatus==='active'));if(missingAgentTools.length)findings.push({ruleId:'AGENT-REGISTRY-001',entityId:'AGENT-REGISTRY',explanation:`Required active tools are missing: ${missingAgentTools.join(', ')}.`,blocking:true});";

if (node.parameters.jsCode.includes(legacySanitizer)) node.parameters.jsCode = node.parameters.jsCode.replace(legacySanitizer, approvedSanitizer);
node.parameters.jsCode = node.parameters.jsCode
  .replace("(workspace.kflaFactors||[]).length!==4||(workspace.kflaClusters||[]).length!==12||(workspace.kfla||[]).length!==38||(workspace.kfla||[]).some(item=>!(workspace.kflaClusters||[]).some(cluster=>cluster.id===item.clusterId))", "(workspace.kflaFactors||[]).length!==4||(workspace.kflaFactors||[]).some(item=>item.status!=='approved')||(workspace.kflaClusters||[]).length!==12||(workspace.kflaClusters||[]).some(cluster=>cluster.status!=='approved'||!(workspace.kflaFactors||[]).some(factor=>factor.id===cluster.factorId&&factor.status==='approved'))||(workspace.kfla||[]).length!==38||(workspace.kfla||[]).some(item=>item.enabled!==true||!(workspace.kflaClusters||[]).some(cluster=>cluster.id===item.clusterId&&cluster.factorId===item.factorId&&cluster.status==='approved'))")
  .replace("const approvedSkills=(workspace.skills||[]).filter(item=>item.status==='approved');const approvedSkillIds=new Set(approvedSkills.map", "const publicSkills=(workspace.skills||[]).filter(item=>item.status==='approved');const approvedSkillIds=new Set(publicSkills.map")
  .replace("skills:approvedSkills.filter(item=>approvedGroupIds.has(item.groupId))", "skills:publicSkills.filter(item=>approvedGroupIds.has(item.groupId))")
  .replace("validationRules:(workspace.validationRules||[]).filter(item=>item.enabled)", "validationRules:(workspace.validationRules||[]).filter(item=>item.status==='approved')")
  .replace("validationRules:(workspace.validationRules||[]).filter(item=>item.status==='approved'),interviews:[]", "validationRules:(workspace.validationRules||[]).filter(item=>item.status==='approved'),proficiencyDefinitions:(workspace.proficiencyDefinitions||[]).filter(item=>item.status==='approved'),evidenceRecords:(workspace.evidenceRecords||[]).filter(item=>item.status==='approved'&&item.dataClassification==='public'&&(workspace.sources||[]).some(source=>source.id===item.sourceId&&source.status==='approved'&&source.sourceClassification!=='licensed'&&source.licenceStatus!=='licensed_restricted')),sources:(workspace.sources||[]).filter(item=>item.status==='approved'&&item.sourceClassification!=='licensed'&&item.licenceStatus!=='licensed_restricted'&&(workspace.evidenceRecords||[]).some(evidence=>evidence.status==='approved'&&evidence.dataClassification==='public'&&evidence.sourceId===item.id)),interviews:[]")
  .replace("evidenceRecords:(workspace.evidenceRecords||[]).filter(item=>item.status==='approved'&&item.dataClassification==='public'),sources:", "evidenceRecords:(workspace.evidenceRecords||[]).filter(item=>item.status==='approved'&&item.dataClassification==='public'&&(workspace.sources||[]).some(source=>source.id===item.sourceId&&source.status==='approved'&&source.sourceClassification!=='licensed'&&source.licenceStatus!=='licensed_restricted')),sources:")
  .replace("sources:(workspace.sources||[]).filter(item=>item.status==='approved'&&item.sourceClassification!=='licensed'&&item.licenceStatus!=='licensed_restricted'&&(workspace.evidenceRecords||[]).some(evidence=>evidence.status==='approved'&&evidence.dataClassification==='public'&&evidence.sourceId===item.id)),interviews:[]", "sources:(workspace.sources||[]).filter(item=>item.status==='approved'&&item.sourceClassification!=='licensed'&&item.licenceStatus!=='licensed_restricted'&&(workspace.evidenceRecords||[]).some(evidence=>evidence.status==='approved'&&evidence.dataClassification==='public'&&evidence.sourceId===item.id)),localizedLabels:(workspace.localizedLabels||[]).filter(item=>item.status==='approved'&&item.sourceClassification!=='licensed'&&item.licenceStatus!=='licensed_restricted'),interviews:[]")
  .replace("agentRuns:[],agentToolInvocations:[],objectVersions:[]", "agentRuns:[],objectVersions:[]");
node.parameters.jsCode = node.parameters.jsCode.replace("agentRuns:[],objectVersions:[]", "agentRuns:[],mappingFeedback:[],objectVersions:[]");
while (node.parameters.jsCode.includes(publisherValidationBlock + publisherValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace(publisherValidationBlock + publisherValidationBlock, publisherValidationBlock);
if (!node.parameters.jsCode.includes(publisherValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace("const names=new Set();", publisherValidationBlock + "const names=new Set();");
while (node.parameters.jsCode.includes(multilingualValidationBlock + multilingualValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace(multilingualValidationBlock + multilingualValidationBlock, multilingualValidationBlock);
if (!node.parameters.jsCode.includes(multilingualValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace("const names=new Set();", multilingualValidationBlock + "const names=new Set();");
while (node.parameters.jsCode.includes(mappingFeedbackValidationBlock + mappingFeedbackValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace(mappingFeedbackValidationBlock + mappingFeedbackValidationBlock, mappingFeedbackValidationBlock);
if (!node.parameters.jsCode.includes(mappingFeedbackValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace("const names=new Set();", mappingFeedbackValidationBlock + "const names=new Set();");
while (node.parameters.jsCode.includes(relationshipValidationBlock + relationshipValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace(relationshipValidationBlock + relationshipValidationBlock, relationshipValidationBlock);
if (!node.parameters.jsCode.includes(relationshipValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace("const names=new Set();", relationshipValidationBlock + "const names=new Set();");
while (node.parameters.jsCode.includes(agentRegistryValidationBlock + agentRegistryValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace(agentRegistryValidationBlock + agentRegistryValidationBlock, agentRegistryValidationBlock);
if (!node.parameters.jsCode.includes(agentRegistryValidationBlock)) node.parameters.jsCode = node.parameters.jsCode.replace("const names=new Set();", agentRegistryValidationBlock + "const names=new Set();");
if (!node.parameters.jsCode.includes("const publicSkills=(workspace.skills||[]).filter")) throw new Error("Publisher sanitizer is neither the expected legacy nor approved-only implementation.");
if (!node.parameters.jsCode.includes("item.enabled!==true")) throw new Error("Publisher KFLA lifecycle gate was not installed.");

writeFileSync(publisherPath, `${JSON.stringify(workflow, null, 2)}\n`);

const orchestratorPath = join(root, "docs", "n8n-skill-designer-v3.workflow.json");
const orchestrator = JSON.parse(readFileSync(orchestratorPath, "utf8"));
const requestNode = orchestrator.nodes.find((candidate) => candidate.name === "Request Governor v3");
const contextNode = orchestrator.nodes.find((candidate) => candidate.name === "Build Governed Agent Context");
const executorNode = orchestrator.nodes.find((candidate) => candidate.name === "Deterministic Tool Policy Executor");
const storeNode = orchestrator.nodes.find((candidate) => candidate.name === "Governance Gate and v3 Store");
const agentNode = orchestrator.nodes.find((candidate) => candidate.name === "Governed Skill Design Agent");
if (!requestNode || !contextNode || !executorNode || !storeNode || !agentNode) throw new Error("Orchestrator v3 policy nodes are incomplete.");

function replaceRequired(source, before, after, marker) {
  if (source.includes(marker)) return source;
  if (!source.includes(before)) throw new Error(`Unable to install orchestrator policy marker: ${marker}`);
  return source.replace(before, after);
}

requestNode.parameters.jsCode = replaceRequired(
  requestNode.parameters.jsCode,
  "const correlationId=`SKILL-${Date.now()}-${Math.random().toString(16).slice(2,10)}`;\nreturn[{json:{ok:true,mode,body,useAgent:",
  "const operationClassification=String(body.dataClassification||'internal');if(!['public','internal','confidential'].includes(operationClassification))return[{json:{ok:false,statusCode:403,error:'Licensed or unsupported data classification is outside the agent boundary.'}}];\nconst correlationId=`SKILL-${Date.now()}-${Math.random().toString(16).slice(2,10)}`;\nreturn[{json:{ok:true,mode,body,operationClassification,useAgent:",
  "operationClassification=String(body.dataClassification"
);

contextNode.parameters.jsCode = replaceRequired(
  contextNode.parameters.jsCode,
  "const registry=(workspace.agentTools||[]).filter(t=>t.lifecycleStatus==='active').map(t=>({id:t.id,version:t.version,permission:t.requiredPermission,allowedDataClassifications:t.allowedDataClassifications,inputSchema:t.inputSchema,outputSchema:t.outputSchema,timeoutMs:t.timeoutMs,retryPolicy:t.retryPolicy,rateLimit:t.rateLimit,errorContract:t.errorContract,auditRequirements:t.auditRequirements}));",
  "const permissionsByMode={'skill.ingest':['skill.job.parse','skill.evidence.extract','skill.taxonomy.read','skill.validation.run','skill.review.draft','skill.review.prepare'],'skill.interview':['skill.evidence.extract','skill.taxonomy.read','skill.validation.run','skill.kfla.read_public','skill.review.draft','skill.review.prepare'],'skill.map_job':['skill.taxonomy.read','skill.kfla.read_public','skill.tools.read','skill.mapping.score','skill.review.draft','skill.review.prepare'],'skill.elicitation':['skill.evidence.extract','skill.taxonomy.read','skill.validation.run','skill.kfla.read_public','skill.tools.read','skill.review.draft','skill.review.prepare']};const grantedPermissions=permissionsByMode[$json.mode]||[];const registry=(workspace.agentTools||[]).filter(t=>t.lifecycleStatus==='active'&&grantedPermissions.includes(t.requiredPermission)).map(t=>({id:t.id,version:t.version,permission:t.requiredPermission,allowedDataClassifications:t.allowedDataClassifications,allowedAgentActions:t.allowedAgentActions,inputSchema:t.inputSchema,outputSchema:t.outputSchema,timeoutMs:t.timeoutMs,retryPolicy:t.retryPolicy,rateLimit:t.rateLimit,errorContract:t.errorContract,auditRequirements:t.auditRequirements}));",
  "const permissionsByMode="
);
contextNode.parameters.jsCode = replaceRequired(
  contextNode.parameters.jsCode,
  "allowed_tools:registry.map(t=>t.id),rules:",
  "allowed_tools:registry.map(t=>t.id),grantedPermissions,operationClassification:$json.operationClassification,rules:",
  "grantedPermissions,operationClassification:$json.operationClassification"
);
agentNode.parameters.options.systemMessage = agentNode.parameters.options.systemMessage.replace(
  '"tool_calls":[{"name":string,"reason":string,"inputRef":string}]',
  '"tool_calls":[{"name":string,"reason":string,"inputRef":string,"action":"execute","dataClassification":"public|internal|confidential"}]'
);
contextNode.parameters.jsCode = replaceRequired(
  contextNode.parameters.jsCode,
  "return[{json:{...$json,workspaceCandidate:workspace,assistant_input,registry}}];",
  "return[{json:{...$json,workspaceCandidate:workspace,assistant_input,registry,grantedPermissions}}];",
  "assistant_input,registry,grantedPermissions"
);

const executorStart = "const registry=new Map((context.registry||[]).map(tool=>[tool.id,tool]));";
const executorEnd = "const approved=new Set";
if (!executorNode.parameters.jsCode.includes("policyDenied")) {
  const start = executorNode.parameters.jsCode.indexOf(executorStart);
  const end = executorNode.parameters.jsCode.indexOf(executorEnd);
  if (start < 0 || end < 0 || end <= start) throw new Error("Unable to locate the v3 tool-policy executor block.");
  const hardened = String.raw`const registry=new Map((context.registry||[]).map(tool=>[tool.id,tool]));const requested=Array.isArray(result.tool_calls)?result.tool_calls:[];const now=new Date().toISOString();const invocations=requested.map((call,index)=>{const tool=registry.get(String(call.name));const action=String(call.action||'execute');const dataClassification=String(call.dataClassification||context.operationClassification||'internal');const base={toolId:String(call.name||'unknown'),toolVersion:tool?.version||'unknown',inputRef:String(call.inputRef||('request:'+(index+1))),durationMs:0,retryCount:0,rulesVersion:context.workspaceCandidate.framework?.rulesVersion||'rules-3.1.0',frameworkVersion:context.workspaceCandidate.framework?.version||'3.1.0',actingUser:'authenticated-pilot-user',correlationId:context.correlationId};let errorCode;if(!tool)errorCode='TOOL_NOT_FOUND';else if(!(context.grantedPermissions||[]).includes(tool.permission))errorCode='PERMISSION_DENIED';else if(dataClassification==='licensed'||!(tool.allowedDataClassifications||[]).includes(dataClassification))errorCode='DATA_CLASSIFICATION_DENIED';else if(!(tool.allowedAgentActions||[]).includes(action))errorCode='ACTION_DENIED';return errorCode?{...base,result:'denied',errorCode}:{...base,outputRef:'agent-output:'+(index+1),result:'success'};});const denied=invocations.filter(item=>item.result==='denied');const policyDenied=denied.length>0;if(policyDenied){result.mapping_proposals=[];result.new_skill_proposals=[];result.profile_proposal=null;result.rewritten_session=null;}\n`;
  executorNode.parameters.jsCode = `${executorNode.parameters.jsCode.slice(0, start)}${hardened}${executorNode.parameters.jsCode.slice(end)}`;
}
executorNode.parameters.jsCode = executorNode.parameters.jsCode
  .replace("\\`request:\\${index+1}\\`", "'request:'+(index+1)")
  .replace("\\`agent-output:\\${index+1}\\`", "'agent-output:'+(index+1)")
  .replace(";}\\nconst approved=new Set", ";}\nconst approved=new Set");
executorNode.parameters.jsCode = replaceRequired(
  executorNode.parameters.jsCode,
  "status:'needs_review',model:",
  "status:policyDenied?'failed':'needs_review',model:",
  "status:policyDenied?'failed'"
);
executorNode.parameters.jsCode = replaceRequired(
  executorNode.parameters.jsCode,
  "result:`${requested.length} allowlisted tool requests; ${rejected.length} denied.`",
  "result:`${requested.length} requested; ${denied.length} denied by least-privilege policy.`",
  "denied by least-privilege policy"
);
executorNode.parameters.jsCode = replaceRequired(
  executorNode.parameters.jsCode,
  "return[{json:{...context,agentResult:result,agentRun}}];",
  "return[{json:{...context,agentResult:result,agentRun,policyDenied,policyError:policyDenied?'Agent tool request denied by the least-privilege registry.':undefined}}];",
  "agentRun,policyDenied,policyError"
);

storeNode.parameters.jsCode = storeNode.parameters.jsCode
  .replace("mappings:[],strategicVectors:[]", "mappings:[],mappingFeedback:[],strategicVectors:[]")
  .replace("agentTools:[],validationRules:[],auditLog:[]", "agentTools:[],validationRules:[],proficiencyDefinitions:[],sources:[],evidenceRecords:[],localizedLabels:[],auditLog:[]")
  .replace("agentTools:[],validationRules:[],proficiencyDefinitions:[],sources:[],evidenceRecords:[],auditLog:[]", "agentTools:[],validationRules:[],proficiencyDefinitions:[],sources:[],evidenceRecords:[],localizedLabels:[],auditLog:[]")
  .replace("validationRules:Array.isArray(value?.validationRules)?value.validationRules:[],auditLog:", "validationRules:Array.isArray(value?.validationRules)?value.validationRules:[],proficiencyDefinitions:Array.isArray(value?.proficiencyDefinitions)?value.proficiencyDefinitions:[],sources:Array.isArray(value?.sources)?value.sources:[],evidenceRecords:Array.isArray(value?.evidenceRecords)?value.evidenceRecords:[],localizedLabels:Array.isArray(value?.localizedLabels)?value.localizedLabels:[],auditLog:")
  .replace("evidenceRecords:Array.isArray(value?.evidenceRecords)?value.evidenceRecords:[],auditLog:", "evidenceRecords:Array.isArray(value?.evidenceRecords)?value.evidenceRecords:[],localizedLabels:Array.isArray(value?.localizedLabels)?value.localizedLabels:[],mappingFeedback:Array.isArray(value?.mappingFeedback)?value.mappingFeedback:[],auditLog:")
  .replace("localizedLabels:Array.isArray(value?.localizedLabels)?value.localizedLabels:[],auditLog:", "localizedLabels:Array.isArray(value?.localizedLabels)?value.localizedLabels:[],mappingFeedback:Array.isArray(value?.mappingFeedback)?value.mappingFeedback:[],auditLog:");
storeNode.parameters.jsCode = replaceRequired(
  storeNode.parameters.jsCode,
  "const rulesVersion=workspace.framework?.rulesVersion||'rules-3.1.0';\nif($json.mode==='skill.map_job')",
  "const rulesVersion=workspace.framework?.rulesVersion||'rules-3.1.0';\nif($json.policyDenied){workspace.agentRuns=[...($json.agentRun?[$json.agentRun]:[]),...workspace.agentRuns].slice(0,100);workspace.auditLog=[...($json.agentRun?.invocations||[]).map((inv,index)=>({id:`AUD-${$json.correlationId}-${index}`,at:new Date().toISOString(),actor:'agent',action:'agent_tool.denied',entityType:'agent_tool',entityId:inv.toolId,summary:`${inv.errorCode}; retry ${inv.retryCount}`,correlationId:$json.correlationId,frameworkVersion})),...workspace.auditLog].slice(0,500);workspace.revision=Number(workspace.revision||0)+1;workspace.updatedAt=new Date().toISOString();store.workspace=workspace;return[{json:{ok:false,statusCode:403,error:$json.policyError,workspace,agentRun:$json.agentRun}}];}\nif($json.mode==='skill.map_job')",
  "if($json.policyDenied){workspace.agentRuns="
);

if (!contextNode.parameters.jsCode.includes("permissionsByMode") || !executorNode.parameters.jsCode.includes("DATA_CLASSIFICATION_DENIED") || !storeNode.parameters.jsCode.includes("agent_tool.denied") || !agentNode.parameters.options.systemMessage.includes('"action":"execute"')) throw new Error("Orchestrator v3 least-privilege policy was not installed.");
writeFileSync(orchestratorPath, `${JSON.stringify(orchestrator, null, 2)}\n`);
console.log("n8n v3 workflows synchronized with approved-release and least-privilege agent policies.");
