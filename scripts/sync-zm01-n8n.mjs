import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const path = join(root, "docs", "n8n-skill-designer-v3.workflow.json");
const workflow = JSON.parse(readFileSync(path, "utf8"));
const node = (name) => {
  const value = workflow.nodes.find((candidate) => candidate.name === name);
  if (!value) throw new Error(`Missing n8n node: ${name}`);
  return value;
};
const request = node("Request Governor v3");
const context = node("Build Governed Agent Context");
const agent = node("Governed Skill Design Agent");
const executor = node("Deterministic Tool Policy Executor");
const store = node("Governance Gate and v3 Store");
const replace = (source, before, after, marker) => {
  if (source.includes(marker)) return source;
  if (!source.includes(before)) throw new Error(`ZM-01 marker cannot be installed: ${marker}`);
  return source.replace(before, after);
};

request.parameters.jsCode = request.parameters.jsCode
  .replace("'skill.ingest','skill.interview'", "'skill.ingest','skill.ingest_job','skill.interview','skill.clarify_job'")
  .replace("String(body.dataClassification||'internal')", "String(body.dataClassification||body.metadata?.dataClassification||'internal')")
  .replace("['skill.ingest','skill.interview','skill.map_job','skill.elicitation']", "['skill.ingest','skill.ingest_job','skill.interview','skill.clarify_job','skill.map_job','skill.elicitation']");
if (!request.parameters.jsCode.includes("Job intake exceeds the governed source count")) request.parameters.jsCode = request.parameters.jsCode.replace("if(mode==='skill.map_job'&&", "if(['skill.ingest_job','skill.clarify_job','skill.map_job'].includes(mode)&&!String(body.idempotencyKey||'').trim())return[{json:{ok:false,statusCode:400,error:'A governed idempotency key is required.'}}];\nif(mode==='skill.ingest_job'){const extracted=Array.isArray(body.extracted)?body.extracted.slice(0,20):[];const total=extracted.reduce((sum,item)=>sum+Number(item.size||String(item.content||'').length),0);if(!extracted.length||total>30408704||extracted.some(item=>String(item.content||'').length>120000))return[{json:{ok:false,statusCode:413,error:'Job intake exceeds the governed source count or size limit.'}}];body.extracted=extracted.map((item,index)=>({...item,id:index+1,content:String(item.content||'').slice(0,120000)}));}\nif(mode==='skill.clarify_job'&&(!body.workspace||!body.jobDescriptionId||!['start','answer','skip'].includes(body.action)))return[{json:{ok:false,statusCode:400,error:'A job, workspace and supported clarification action are required.'}}];\nif(mode==='skill.map_job'&&");
if (!request.parameters.jsCode.includes("rate.zm01Requests=")) request.parameters.jsCode = request.parameters.jsCode.replace("const correlationId=", "const rate=$getWorkflowStaticData('global');const rateNow=Date.now();rate.zm01Requests=(rate.zm01Requests||[]).filter(at=>rateNow-at<60000);if(rate.zm01Requests.length>=60)return[{json:{ok:false,statusCode:429,error:'Governed workflow rate limit exceeded; retry after one minute.'}}];rate.zm01Requests.push(rateNow);\nconst correlationId=");

context.parameters.jsCode = context.parameters.jsCode
  .replace("interviews:[],elicitationSessions:[]", "interviews:[],jobClarifications:[],elicitationSessions:[]")
  .replace("mappings:[],profiles:[]", "mappings:[],mappingOmissions:[],profiles:[]")
  .replace("'skill.ingest':[", "'skill.ingest_job':['skill.job.parse','skill.evidence.extract','skill.taxonomy.read','skill.validation.run','skill.tools.read','skill.review.draft','skill.review.prepare'],'skill.clarify_job':['skill.evidence.extract','skill.validation.run','skill.review.draft','skill.review.prepare'],'skill.ingest':[");
context.parameters.jsCode = replace(
  context.parameters.jsCode,
  "let evidence={};if($json.mode==='skill.ingest')",
  "let evidence={};if($json.mode==='skill.ingest_job')evidence={metadata:body.metadata,sources:body.extracted,existingJobs:(workspace.jobDescriptions||[]).map(job=>({id:job.id,title:job.title,sourceFiles:job.sourceFiles}))};\nif($json.mode==='skill.clarify_job'){const job=(workspace.jobDescriptions||[]).find(item=>item.id===body.jobDescriptionId);if(!job)return[{json:{...$json,ok:false,statusCode:404,error:'Job description not found.'}}];evidence={action:body.action,answer:body.answer,questionId:body.questionId,jobDescription:job,session:(workspace.jobClarifications||[]).find(item=>item.jobDescriptionId===job.id)};}\nif($json.mode==='skill.ingest')",
  "existingJobs:(workspace.jobDescriptions"
);

const zm01Contract = `\nZM-01 JOB MAPPING CONTRACT: For skill.ingest_job return job_description with title, jobFamily, country, language, purpose, sourceText, responsibilities, outcomes, activities, tools, qualifications, context, constraints, evidenceSegments (id, sourceId, sourceName, section, location, quotation, normalizedType, normalizedValue, confidence), sourceFiles and intakeFindings. For skill.clarify_job return clarification_questions for outcomes, critical_incident, autonomy, complexity and performance_level; answers must be evidence-seeking. For skill.map_job return mapping_proposals grounded only in approved taxonomy and direct evidenceRefs, kflaCompetencyIds, toolIds, strategicVectorIds, all thirteen score fields, mapping_omissions with reasons/evidenceRefs, and profile_proposal with excludedLinks. Never approve or publish. Never reproduce licensed definitions.`;
if (!agent.parameters.options.systemMessage.includes("ZM-01 JOB MAPPING CONTRACT")) agent.parameters.options.systemMessage += zm01Contract;

executor.parameters.jsCode = executor.parameters.jsCode
  .replace("let result;try{result=JSON.parse(raw);}catch{return[{json:{...context,ok:false,statusCode:502,error:'The Skill Design Agent returned invalid JSON.'}}];}", "let result;let parseError='';try{result=JSON.parse(raw);}catch{result={};parseError='INVALID_AGENT_JSON';}")
  .replace("const denied=invocations.filter(item=>item.result==='denied');const policyDenied=denied.length>0;", "const denied=invocations.filter(item=>item.result==='denied');const policyDenied=denied.length>0||Boolean(parseError);")
  .replace("result.mapping_proposals=[];result.new_skill_proposals=[];", "result.mapping_proposals=[];result.mapping_omissions=[];result.new_skill_proposals=[];")
  .replace(".map(item=>({...item,targetLevel:", ".map(item=>({...item,evidenceRefs:Array.isArray(item.evidenceRefs)?item.evidenceRefs.map(String):[],kflaCompetencyIds:Array.isArray(item.kflaCompetencyIds)?item.kflaCompetencyIds.map(String):[],targetLevel:")
  .replace("result.new_skill_proposals=", "result.mapping_omissions=(Array.isArray(result.mapping_omissions)?result.mapping_omissions:[]).filter(item=>approved.has(item.skillId)&&String(item.reason||'').trim()&&Array.isArray(item.evidenceRefs)&&item.evidenceRefs.length).slice(0,20);\nresult.new_skill_proposals=")
  .replace("mode:context.mode==='skill.map_job'?'job_mapping':context.mode==='skill.interview'?'interview':", "mode:context.mode==='skill.map_job'?'job_mapping':context.mode==='skill.interview'||context.mode==='skill.clarify_job'?'interview':")
  .replace("status:policyDenied?'failed':'needs_review'", "status:policyDenied?'failed':'needs_review',jobDescriptionId:context.body?.jobDescriptionId,idempotencyKey:context.body?.idempotencyKey,retryOfRunId:context.body?.retryOfRunId,attempt:context.body?.retryOfRunId?2:1,error:policyDenied?{code:parseError||'POLICY_DENIED',message:parseError?'Agent output was not valid JSON.':'Agent tool request was denied.',retryable:Boolean(parseError)}:undefined")
  .replace("policyError:policyDenied?'Agent tool request denied by the least-privilege registry.'", "policyError:policyDenied?(parseError?'Agent output failed structured parsing.':'Agent tool request denied by the least-privilege registry.')");

if (!store.parameters.jsCode.includes("jobClarifications:[]")) store.parameters.jsCode = store.parameters.jsCode.replace("profiles:[],interviews:[]", "profiles:[],interviews:[],jobClarifications:[]");
if (!store.parameters.jsCode.includes("mappings:[],mappingOmissions:[]")) store.parameters.jsCode = store.parameters.jsCode.replace("mappings:[],mappingFeedback:[]", "mappings:[],mappingOmissions:[],mappingFeedback:[]");
if (!store.parameters.jsCode.includes("jobClarifications:Array.isArray")) store.parameters.jsCode = store.parameters.jsCode.replace("relationships:Array.isArray(value?.relationships)?value.relationships:[]", "relationships:Array.isArray(value?.relationships)?value.relationships:[],jobClarifications:Array.isArray(value?.jobClarifications)?value.jobClarifications:[]");
if (!store.parameters.jsCode.includes("mappingOmissions:Array.isArray")) store.parameters.jsCode = store.parameters.jsCode.replace("mappingFeedback:Array.isArray(value?.mappingFeedback)?value.mappingFeedback:[]", "mappingOmissions:Array.isArray(value?.mappingOmissions)?value.mappingOmissions:[],mappingFeedback:Array.isArray(value?.mappingFeedback)?value.mappingFeedback:[]");
store.parameters.jsCode = replace(
  store.parameters.jsCode,
  "if($json.mode==='skill.read')",
  "store.zm01Receipts=store.zm01Receipts||{};const stateChanging=['skill.ingest_job','skill.clarify_job','skill.map_job'];const idempotencyKey=String(body.idempotencyKey||'');if(stateChanging.includes($json.mode)&&store.zm01Receipts[idempotencyKey])return[{json:{...store.zm01Receipts[idempotencyKey],replayed:true}}];\nif($json.mode==='skill.read')",
  "store.zm01Receipts=store.zm01Receipts"
);
const handlers = `
if($json.mode==='skill.ingest_job'){const input=result.job_description||{};const id=String(input.id||\`JD-\${now}\`);const sourceText=String(input.sourceText||(body.extracted||[]).map(item=>item.content).join('\\n\\n')).slice(0,240000);const sourceFiles=(body.extracted||[]).map(item=>({name:String(item.name||'source'),mediaType:String(item.mediaType||'application/octet-stream'),size:Number(item.size||String(item.content||'').length),contentHash:item.contentHash}));const duplicate=workspace.jobDescriptions.find(job=>(job.sourceFiles||[]).some(existing=>existing.contentHash&&sourceFiles.some(file=>file.contentHash===existing.contentHash)));if(duplicate)return[{json:{ok:false,statusCode:409,error:\`Duplicate governed source already belongs to \${duplicate.id}.\`,workspace}}];const job={id,title:String(input.title||body.metadata?.title||'Untitled job'),jobFamily:String(input.jobFamily||body.metadata?.jobFamily||'Unclassified'),country:String(input.country||body.metadata?.country||'Global'),language:String(input.language||body.metadata?.language||'English'),purpose:String(input.purpose||''),sourceText,responsibilities:Array.isArray(input.responsibilities)?input.responsibilities:[],outcomes:Array.isArray(input.outcomes)?input.outcomes:[],activities:Array.isArray(input.activities)?input.activities:[],tools:Array.isArray(input.tools)?input.tools:[],qualifications:Array.isArray(input.qualifications)?input.qualifications:[],context:Array.isArray(input.context)?input.context:[],constraints:Array.isArray(input.constraints)?input.constraints:[],evidenceSegments:Array.isArray(input.evidenceSegments)?input.evidenceSegments:[],sourceFiles,intakeFindings:Array.isArray(input.intakeFindings)?input.intakeFindings:[],intakeIdempotencyKey:idempotencyKey,status:'analysed',version:1,updatedAt:new Date().toISOString()};workspace.jobDescriptions=[job,...workspace.jobDescriptions.filter(item=>item.id!==id)];}
if($json.mode==='skill.clarify_job'){const jobId=body.jobDescriptionId;let session=workspace.jobClarifications.find(item=>item.jobDescriptionId===jobId);const defaultQuestions=[['outcomes','Which measurable outcomes define success for this role?'],['critical_incident','Describe a critical incident that distinguishes strong performance.'],['autonomy','Which decisions can the role make without escalation?'],['complexity','What complexity, ambiguity or stakeholder tension must the role resolve?'],['performance_level','What observable evidence separates foundational from advanced performance?']];if(!session){session={id:\`CLAR-\${jobId}\`,jobDescriptionId:jobId,status:'in_progress',currentQuestion:0,questions:defaultQuestions.map((item,index)=>({id:\`CLAR-\${jobId}-Q\${index+1}\`,dimension:item[0],question:item[1],rationale:'Close a material mapping evidence gap.',status:'open'})),startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),idempotencyKey};workspace.jobClarifications.push(session);}const question=session.questions.find(item=>item.id===body.questionId)||session.questions.find(item=>item.status==='open');if(question&&body.action==='answer'){const evidenceId=\`EVD-\${jobId}-\${now}\`;Object.assign(question,{answer:String(body.answer||''),evidenceRecordId:evidenceId,status:'answered'});workspace.evidenceRecords.push({id:evidenceId,sourceId:\`SRC-\${jobId}\`,summary:String(body.answer||''),location:\`Clarification / \${question.dimension}\`,dataClassification:$json.operationClassification,supportedEntityIds:[jobId],confidence:90,status:'draft'});}else if(question&&body.action==='skip')question.status='skipped';session.currentQuestion=session.questions.filter(item=>item.status!=='open').length;session.status=session.questions.some(item=>item.status==='open')?'in_progress':'complete';session.updatedAt=new Date().toISOString();session.idempotencyKey=idempotencyKey;}
`;
store.parameters.jsCode = replace(
  store.parameters.jsCode,
  "if($json.mode==='skill.map_job')",
  `${handlers}if($json.mode==='skill.map_job')`,
  "if($json.mode==='skill.ingest_job'){const input=result.job_description"
);
store.parameters.jsCode = store.parameters.jsCode.replace(
  "evidence:[item.evidence],strategicVectorIds:item.strategicVectorIds||[]",
  "evidence:[item.evidence],evidenceRefs:item.evidenceRefs||[],kflaCompetencyIds:item.kflaCompetencyIds||[],agentRunId:$json.agentRun?.id,strategicVectorIds:item.strategicVectorIds||[]"
).replace(
  "if($json.mode==='skill.ingest'){",
  "if($json.mode==='skill.map_job'){workspace.mappingOmissions=workspace.mappingOmissions.filter(item=>item.jobDescriptionId!==body.jobDescriptionId||item.status==='superseded');for(const [index,item] of (result.mapping_omissions||[]).entries())workspace.mappingOmissions.push({id:`OMIT-${now}-${index+1}`,jobDescriptionId:body.jobDescriptionId,skillId:item.skillId,reason:item.reason,evidenceRefs:item.evidenceRefs,score:Number(item.score||0),status:'explained',agentRunId:$json.agentRun?.id});if(result.profile_proposal){const profileId=String(result.profile_proposal.id||`PROFILE-${body.jobDescriptionId}`);workspace.profiles=[...workspace.profiles.filter(item=>item.id!==profileId),{...result.profile_proposal,id:profileId,jobDescriptionId:body.jobDescriptionId,status:'draft',agentRunId:$json.agentRun?.id,skills:(result.profile_proposal.skills||[]).filter(link=>workspace.mappings.some(mapping=>mapping.jobDescriptionId===body.jobDescriptionId&&mapping.skillId===link.skillId)),excludedLinks:result.profile_proposal.excludedLinks||[]}];}}\nif($json.mode==='skill.ingest'){"
);
store.parameters.jsCode = store.parameters.jsCode.replace(
  "store.workspace=workspace;return[{json:{ok:true,workspace,agentRun:",
  "store.workspace=workspace;const response={ok:true,workspace,agentRun:"
).replace(
  ":`${(result.new_skill_proposals||[]).length} governed proposals added to review.`}}];",
  ":$json.mode==='skill.ingest_job'?'Job evidence normalized into governed working state.':$json.mode==='skill.clarify_job'?'Job clarification progress saved as governed evidence.':`${(result.new_skill_proposals||[]).length} governed proposals added to review.`};if(stateChanging.includes($json.mode)&&idempotencyKey){store.zm01Receipts[idempotencyKey]=response;const keys=Object.keys(store.zm01Receipts);for(const key of keys.slice(0,Math.max(0,keys.length-100)))delete store.zm01Receipts[key];}return[{json:response}];"
);

const serialized = JSON.stringify(workflow);
for (const marker of ["skill.ingest_job", "skill.clarify_job", "mapping_omissions", "evidenceRefs", "zm01Receipts", "rate limit exceeded", "ZM-01 JOB MAPPING CONTRACT"]) {
  if (!serialized.includes(marker)) throw new Error(`ZM-01 workflow marker missing: ${marker}`);
}
for (const candidate of workflow.nodes.filter((item) => typeof item.parameters?.jsCode === "string")) new Function(candidate.parameters.jsCode);
writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
console.log("ZM-01 job intake, clarification, mapping evidence, omissions and idempotency synchronized.");
