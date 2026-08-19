import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/n8n-skill-designer-v3.workflow.json";
const workflow = JSON.parse(readFileSync(path, "utf8"));
const contextNode = workflow.nodes.find((node) => node.name === "Build Governed Agent Context");
const agentNode = workflow.nodes.find((node) => node.name === "Governed Skill Design Agent");
const storeNode = workflow.nodes.find((node) => node.name === "Governance Gate and v3 Store");
if (!contextNode || !agentNode || !storeNode) throw new Error("Skill Designer v3 workflow nodes are incomplete.");

const permissionsStart = contextNode.parameters.jsCode.indexOf("const permissionsByMode=");
const permissionsEnd = contextNode.parameters.jsCode.indexOf(";const grantedPermissions", permissionsStart);
if (permissionsStart < 0 || permissionsEnd < 0) throw new Error("Agent permission registry was not found.");
const permissions = `const permissionsByMode={
  'skill.ingest_job':['skill.job.parse','skill.evidence.extract','skill.taxonomy.read','skill.validation.run','skill.tools.read','skill.review.draft','skill.review.prepare'],
  'skill.clarify_job':['skill.evidence.extract','skill.validation.run','skill.review.draft','skill.review.prepare'],
  'skill.ingest':['skill.job.parse','skill.evidence.extract','skill.taxonomy.read','skill.validation.run','skill.review.draft','skill.review.prepare'],
  'skill.interview':['skill.evidence.extract','skill.taxonomy.read','skill.validation.run','skill.kfla.read_public','skill.review.draft','skill.review.prepare'],
  'skill.map_job':['skill.taxonomy.read','skill.kfla.read_public','skill.tools.read','skill.mapping.score','skill.review.draft','skill.review.prepare'],
  'skill.elicitation':['skill.evidence.extract','skill.taxonomy.read','skill.validation.run','skill.kfla.read_public','skill.tools.read','skill.review.draft','skill.review.prepare']
}`;
contextNode.parameters.jsCode = contextNode.parameters.jsCode.slice(0, permissionsStart) + permissions + contextNode.parameters.jsCode.slice(permissionsEnd);

const schemaMarker = `"profile_proposal":object|null,"rewritten_session":object|null`;
if (!agentNode.parameters.options.systemMessage.includes(schemaMarker)) throw new Error("Agent response schema marker was not found.");
agentNode.parameters.options.systemMessage = agentNode.parameters.options.systemMessage.replace(
  schemaMarker,
  `"profile_proposal":object|null,"clarification_questions":[{"dimension":"outcomes|critical_incident|autonomy|complexity|performance_level","question":string,"rationale":string}],"rewritten_session":object|null`,
);
agentNode.parameters.options.systemMessage = agentNode.parameters.options.systemMessage.replace(
  "For skill.clarify_job return clarification_questions for outcomes, critical_incident, autonomy, complexity and performance_level; answers must be evidence-seeking.",
  "For skill.clarify_job return job-specific clarification_questions for the material ambiguities found in this job evidence. Cover outcomes, critical_incident, autonomy, complexity and performance_level; include the source ambiguity in each rationale and seek observable evidence rather than generic opinions.",
);

const handlerStart = storeNode.parameters.jsCode.indexOf("if($json.mode==='skill.clarify_job'){");
const handlerEnd = storeNode.parameters.jsCode.indexOf("\nif($json.mode==='skill.map_job')", handlerStart);
if (handlerStart < 0 || handlerEnd < 0) throw new Error("Clarification persistence handler was not found.");
const clarificationHandler = `if($json.mode==='skill.clarify_job'){
  const jobId=body.jobDescriptionId;
  const job=workspace.jobDescriptions.find(item=>item.id===jobId);
  let session=workspace.jobClarifications.find(item=>item.jobDescriptionId===jobId);
  const dimensions=['outcomes','critical_incident','autonomy','complexity','performance_level'];
  const outcomeSignal=(job?.outcomes||[]).slice(0,2).join(' and ')||job?.purpose||'the stated role purpose';
  const ambiguitySignal=job?.intakeFindings?.[0]?.message||job?.constraints?.[0]||'the most material source ambiguity';
  const autonomySignal=job?.constraints?.slice(0,2).join(' and ')||'the stated accountabilities and escalation boundaries';
  const complexitySignal=[...(job?.context||[]).slice(0,2),...(job?.tools||[]).slice(0,2)].join(', ')||'the role context and stakeholder tensions';
  const fallbackQuestions=[
    {dimension:'outcomes',question:\`Which measurable outcomes prove successful \${job?.title||'role'} performance, and what evidence verifies them?\`,rationale:\`Validate outcome evidence beyond: \${outcomeSignal}.\`},
    {dimension:'critical_incident',question:\`Describe a critical incident that tests this ambiguity: \${ambiguitySignal}\`,rationale:'Use an observable incident to separate durable skill evidence from assumptions.'},
    {dimension:'autonomy',question:\`Which decisions may this role make, and which require escalation, in relation to \${autonomySignal}?\`,rationale:'Resolve decision rights before assigning proficiency or criticality.'},
    {dimension:'complexity',question:\`How does the role resolve ambiguity, dependencies or stakeholder tension involving \${complexitySignal}?\`,rationale:'Calibrate complexity and distinguish tools or context from durable capabilities.'},
    {dimension:'performance_level',question:'What observable evidence separates foundational, proficient and advanced performance for the critical outcomes?',rationale:'Anchor proficiency in observable behavior and outcome quality.'}
  ];
  const supplied=Array.isArray(result.clarification_questions)?result.clarification_questions:[];
  const contextual=supplied.filter(item=>String(item?.question||'').trim()).slice(0,8).map((item,index)=>({dimension:dimensions.includes(String(item.dimension))?String(item.dimension):dimensions[Math.min(index,dimensions.length-1)],question:String(item.question).trim(),rationale:String(item.rationale||'Close a material, source-specific mapping evidence gap.').trim()}));
  const questionSet=contextual.length>=3?contextual:fallbackQuestions;
  if(!session){session={id:\`CLAR-\${jobId}\`,jobDescriptionId:jobId,status:'in_progress',currentQuestion:0,questions:questionSet.map((item,index)=>({id:\`CLAR-\${jobId}-Q\${index+1}\`,dimension:item.dimension,question:item.question,rationale:item.rationale,status:'open'})),startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),idempotencyKey};workspace.jobClarifications.push(session);}
  const question=session.questions.find(item=>item.id===body.questionId)||session.questions.find(item=>item.status==='open');
  if(question&&body.action==='answer'){
    const evidenceId=\`EVD-\${jobId}-\${now}\`;
    Object.assign(question,{answer:String(body.answer||''),evidenceRecordId:evidenceId,status:'answered'});
    workspace.evidenceRecords.push({id:evidenceId,sourceId:\`SRC-\${jobId}\`,summary:String(body.answer||''),location:\`Clarification / \${question.dimension}\`,dataClassification:$json.operationClassification,supportedEntityIds:[jobId],confidence:90,status:'draft'});
  }else if(question&&body.action==='skip')question.status='skipped';
  session.currentQuestion=session.questions.filter(item=>item.status!=='open').length;
  session.status=session.questions.some(item=>item.status==='open')?'in_progress':'complete';
  session.updatedAt=new Date().toISOString();
  session.idempotencyKey=idempotencyKey;
}`;
storeNode.parameters.jsCode = storeNode.parameters.jsCode.slice(0, handlerStart) + clarificationHandler + storeNode.parameters.jsCode.slice(handlerEnd);

writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
console.log("ZM-09 UAT quality improvements synchronized to the Skill Designer v3 workflow artifact.");
