import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/n8n-skill-designer-v3.workflow.json";
const workflow = JSON.parse(readFileSync(path, "utf8"));
const node = (name) => workflow.nodes.find((item) => item.name === name);
const governor = node("Request Governor v3");
const context = node("Build Governed Agent Context");
const agent = node("Governed Skill Design Agent");
const executor = node("Deterministic Tool Policy Executor");
const store = node("Governance Gate and v3 Store");
if (![governor, context, agent, executor, store].every(Boolean)) throw new Error("Expected governed v3 nodes are missing.");

if (agent.parameters.options.systemMessage.includes("ZM-03 ELICITATION CONTRACT")) {
  const declaration = "const approved=new Set((context.workspaceCandidate.skills||[]).filter(skill=>skill.status==='approved').map(skill=>skill.id));";
  const marker = "const denied=invocations.filter(item=>item.result==='denied');const policyDenied=denied.length>0||Boolean(parseError);";
  if (!executor.parameters.jsCode.includes(`${marker}${declaration}`)) {
    executor.parameters.jsCode = executor.parameters.jsCode.replace(declaration, "").replace(marker, `${marker}${declaration}`);
  }
  writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
  console.log("ZM-03 n8n contracts already synchronized; policy scope verified.");
  process.exit(0);
}

const replaceOnce = (value, from, to, label) => {
  if (!value.includes(from)) throw new Error(`Unable to apply ${label}; source contract changed.`);
  return value.replace(from, to);
};

governor.parameters.jsCode = replaceOnce(
  governor.parameters.jsCode,
  "['skill.save','skill.ingest_job','skill.clarify_job','skill.map_job'].includes(mode)",
  "['skill.save','skill.ingest_job','skill.clarify_job','skill.map_job','skill.elicitation'].includes(mode)",
  "elicitation idempotency guard",
);
governor.parameters.jsCode = replaceOnce(
  governor.parameters.jsCode,
  "if(mode==='skill.elicitation'&&(!body.workspace||!body.sessionId))",
  "if(mode==='skill.elicitation'&&(!body.workspace||!body.sessionId||!['rewrite','validate'].includes(body.action)))",
  "elicitation action guard",
);

context.parameters.jsCode = replaceOnce(
  context.parameters.jsCode,
  "if($json.mode==='skill.elicitation')evidence={action:body.action,session:(workspace.elicitationSessions||[]).find(item=>item.id===body.sessionId)};",
  "if($json.mode==='skill.elicitation'){const session=(workspace.elicitationSessions||[]).find(item=>item.id===body.sessionId);if(!session)return[{json:{...$json,ok:false,statusCode:404,error:'Elicitation session not found.'}}];evidence={action:body.action,session,existingConcepts:approved.map(item=>({id:item.id,name:item.name,syntax:item.syntax,aliases:item.aliases}))};}",
  "elicitation evidence context",
);
context.parameters.jsCode = replaceOnce(
  context.parameters.jsCode,
  "'Never request GitHub, filesystem, network, credential, publication or workflow administration access.'",
  "'Never request GitHub, filesystem, network, credential, publication or workflow administration access.','For elicitation, retain evidence IDs, locations and quotations unchanged; suggest only Action + Object + Outcome draft fields and structured rule findings.'",
  "elicitation evidence protection rule",
);

agent.parameters.options.systemMessage += "\nZM-03 ELICITATION CONTRACT: For skill.elicitation, inspect the supplied session and existing approved concepts. Return rewritten_session only as a draft containing title and fields (capability, activities, outcomes, knowledge, tools, context, constraints, granularity, synonyms, kflaCompetencyIds, proficiencyIndicators); never return or change fieldEvidence, identity, status, workflow position, actor, reason or timestamps. Return elicitation_assessment with syntaxCandidate (action, object, outcome, canonicalName), validationFindings (ruleId, severity, field, message, correction, blocking), possibleMatches (approved ID and rationale), and evidenceCoverage. Validate granularity, uniqueness, observability, evidence lineage and consistent Action + Object + Outcome syntax. Public KFLA metadata may guide alignment, but never quote, infer or request licensed definitions.";

executor.parameters.jsCode = replaceOnce(
  executor.parameters.jsCode,
  "const denied=invocations.filter(item=>item.result==='denied');const policyDenied=denied.length>0||Boolean(parseError);if(policyDenied)",
  "const denied=invocations.filter(item=>item.result==='denied');const policyDenied=denied.length>0||Boolean(parseError);const approved=new Set((context.workspaceCandidate.skills||[]).filter(skill=>skill.status==='approved').map(skill=>skill.id));if(policyDenied)",
  "approved concept policy scope",
);
executor.parameters.jsCode = replaceOnce(
  executor.parameters.jsCode,
  "const approved=new Set((context.workspaceCandidate.skills||[]).filter(skill=>skill.status==='approved').map(skill=>skill.id));const clamp=n=>",
  "if(context.mode==='skill.elicitation'){const source=(context.workspaceCandidate.elicitationSessions||[]).find(item=>item.id===context.body.sessionId);const rewritten=result.rewritten_session&&typeof result.rewritten_session==='object'?result.rewritten_session:null;const allowedFields=['capability','activities','outcomes','knowledge','tools','context','constraints','granularity','synonyms','kflaCompetencyIds','proficiencyIndicators'];if(rewritten&&source){result.rewritten_session={title:String(rewritten.title||source.title),fields:Object.fromEntries(allowedFields.map(key=>[key,rewritten.fields?.[key]??source.fields[key]])),fieldEvidence:source.fieldEvidence||{}};}result.elicitation_assessment={syntaxCandidate:result.elicitation_assessment?.syntaxCandidate||null,validationFindings:Array.isArray(result.elicitation_assessment?.validationFindings)?result.elicitation_assessment.validationFindings.slice(0,20):[],possibleMatches:Array.isArray(result.elicitation_assessment?.possibleMatches)?result.elicitation_assessment.possibleMatches.filter(item=>approved.has(String(item.id))).slice(0,10):[],evidenceCoverage:Math.max(0,Math.min(100,Number(result.elicitation_assessment?.evidenceCoverage)||0))};}const clamp=n=>",
  "elicitation output allowlist",
);

store.parameters.jsCode = replaceOnce(
  store.parameters.jsCode,
  "const stateChanging=['skill.save','skill.ingest_job','skill.clarify_job','skill.map_job'];",
  "const stateChanging=['skill.save','skill.ingest_job','skill.clarify_job','skill.map_job','skill.elicitation'];",
  "elicitation receipt scope",
);
store.parameters.jsCode = replaceOnce(
  store.parameters.jsCode,
  "if($json.mode==='skill.elicitation'&&result.rewritten_session){workspace.elicitationSessions=workspace.elicitationSessions.map(session=>session.id===body.sessionId?{...session,...result.rewritten_session,status:'in_progress',updatedAt:new Date().toISOString()}:session);}",
  "if($json.mode==='skill.elicitation'){const prior=workspace.elicitationSessions.find(session=>session.id===body.sessionId);if(result.rewritten_session&&prior)workspace.elicitationSessions=workspace.elicitationSessions.map(session=>session.id===body.sessionId?{...session,title:result.rewritten_session.title,fields:result.rewritten_session.fields,fieldEvidence:session.fieldEvidence||{},status:'in_progress',updatedAt:new Date().toISOString()}:session);workspace.objectVersions=[{id:`VER-${body.sessionId}-${now}`,entityType:'elicitation_session',entityId:body.sessionId,version:workspace.objectVersions.filter(item=>item.entityType==='elicitation_session'&&item.entityId===body.sessionId).length+1,recordedAt:new Date().toISOString(),recordedBy:'governed-skill-agent',action:`elicitation.ai_${body.action}`,snapshot:{sessionId:body.sessionId,assessment:result.elicitation_assessment||{},evidenceRefs:Object.values(prior?.fieldEvidence||{}).flat().map(item=>item.id),rulesVersion,frameworkVersion}},...workspace.objectVersions].slice(0,500);}",
  "elicitation immutable history",
);

writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
console.log("ZM-03 n8n elicitation, evidence-lineage and draft-boundary contracts synchronized.");
