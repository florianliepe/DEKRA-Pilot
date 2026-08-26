import { readFileSync, writeFileSync } from "node:fs";

const orchestratorPath = "docs/n8n-skill-designer-v3.workflow.json";
const orchestrator = JSON.parse(readFileSync(orchestratorPath, "utf8"));
const governor = orchestrator.nodes.find((node) => node.name === "Request Governor v3");
const store = orchestrator.nodes.find((node) => node.name === "Governance Gate and v3 Store");
if (!governor || !store) throw new Error("Governed Skill Designer nodes are incomplete.");
const apiWebhook = orchestrator.nodes.find((node) => node.name === "Skill Designer API v3");
if (!apiWebhook) throw new Error("Governed Skill Designer webhook is missing.");

governor.parameters.jsCode = governor.parameters.jsCode
  .replace("const body=$json.body??{};", "const body=$json.body??$json??{};")
  .replace("!['start','answer','skip'].includes(body.action)", "!['start','answer','skip','back','edit'].includes(body.action)")
  .replace(
    /useAgent:\[[^\]]+\]\.includes\(mode\).*?,receivedAt:/s,
    "useAgent:['skill.ingest','skill.ingest_job','skill.interview','skill.clarify_job','skill.map_job','skill.elicitation'].includes(mode)&&!(mode==='skill.ingest_job'&&body.extracted?.some(item=>item.type==='xlsx'))&&!(mode==='skill.clarify_job'&&body.action!=='start'),receivedAt:",
  );

const handlerStart = store.parameters.jsCode.indexOf("if($json.mode==='skill.clarify_job'){");
const handlerEnd = store.parameters.jsCode.indexOf("\nif($json.mode==='skill.map_job')", handlerStart);
if (handlerStart < 0 || handlerEnd < 0) throw new Error("Clarification handler not found.");
const clarificationHandler = `if($json.mode==='skill.clarify_job'){
  const jobId=body.jobDescriptionId;const job=workspace.jobDescriptions.find(item=>item.id===jobId);let session=workspace.jobClarifications.find(item=>item.jobDescriptionId===jobId);const expectedVersion=Number(body.expectedSessionVersion||0);
  if(session&&expectedVersion!==Number(session.sessionVersion||0))return[{json:{ok:false,statusCode:409,error:'Clarification session changed in another browser. Reload the governed session before continuing.',clarification:session,workspace}}];
  const dimensions=['outcomes','critical_incident','autonomy','complexity','performance_level'];const supplied=Array.isArray(result.clarification_questions)?result.clarification_questions:[];
  const fallback=[{dimension:'outcomes',question:\`Which measurable outcomes prove successful \${job?.title||'role'} performance?\`,rationale:'Validate observable outcome evidence.'},{dimension:'critical_incident',question:'Describe a critical incident that distinguishes durable capability from routine activity.',rationale:'Ground the mapping in observable behavior.'},{dimension:'autonomy',question:'Which decisions may this role make and which require escalation?',rationale:'Resolve decision rights before proficiency assignment.'},{dimension:'complexity',question:'How does the role resolve ambiguity, dependencies or stakeholder tension?',rationale:'Calibrate complexity using direct evidence.'},{dimension:'performance_level',question:'What evidence separates foundational, proficient and advanced performance?',rationale:'Anchor proficiency in observable behavior.'}];
  if(!session){const set=supplied.length>=3?supplied:fallback;session={id:\`CLAR-\${jobId}\`,jobDescriptionId:jobId,status:'in_progress',currentQuestion:0,questions:set.slice(0,8).map((item,index)=>({id:\`CLAR-\${jobId}-Q\${index+1}\`,dimension:dimensions.includes(String(item.dimension))?String(item.dimension):dimensions[Math.min(index,4)],question:String(item.question),rationale:String(item.rationale||'Close a material evidence gap.'),status:'open'})),startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),idempotencyKey,sessionVersion:1};workspace.jobClarifications.push(session);}
  else{const target=session.questions.find(item=>item.id===body.questionId)||session.questions.find(item=>item.status==='open');if(body.action==='back'){const previous=[...session.questions].reverse().find(item=>item.status==='answered'||item.status==='skipped');if(previous)previous.status='open';}else if(target&&['answer','edit'].includes(body.action)){const text=String(body.answer||'').trim();if(!text)return[{json:{ok:false,statusCode:400,error:'A non-empty clarification answer is required.',clarification:session,workspace}}];let evidence=workspace.evidenceRecords.find(item=>item.id===target.evidenceRecordId);if(!evidence){const evidenceId=\`EVD-\${jobId}-\${Date.now()}\`;target.evidenceRecordId=evidenceId;evidence={id:evidenceId,sourceId:\`SRC-\${jobId}\`,summary:text,location:\`Clarification / \${target.dimension}\`,dataClassification:$json.operationClassification,supportedEntityIds:[jobId],confidence:90,status:'draft'};workspace.evidenceRecords.push(evidence);}else evidence.summary=text;Object.assign(target,{answer:text,status:'answered'});}else if(target&&body.action==='skip')target.status='skipped';session.sessionVersion=Number(session.sessionVersion||0)+1;session.currentQuestion=session.questions.filter(item=>item.status!=='open').length;session.status=session.questions.some(item=>item.status==='open')?'in_progress':'complete';session.updatedAt=new Date().toISOString();session.idempotencyKey=idempotencyKey;}
}`;
store.parameters.jsCode = store.parameters.jsCode.slice(0, handlerStart) + clarificationHandler + store.parameters.jsCode.slice(handlerEnd);

if (!store.parameters.jsCode.includes("body.deferPersistence")) {
  store.parameters.jsCode = store.parameters.jsCode
    .replace("workspace.updatedAt=new Date().toISOString();store.workspace=workspace;const response={", "workspace.updatedAt=new Date().toISOString();const response={")
    .replace("};if(stateChanging.includes($json.mode)&&idempotencyKey){", "};if(body.deferPersistence===true)return[{json:{...response,deferredPersistence:true}}];store.workspace=workspace;if(stateChanging.includes($json.mode)&&idempotencyKey){");
}
orchestrator.name = "DEKRA Skill Designer v3 — ZM-10 deterministic runtime";
orchestrator.meta = { ...(orchestrator.meta || {}), zielmodus: "ZM-10", clarificationContract: "clarification-command-1.0.0", mappingRuntime: "async-data-table-1.0.0" };
// Both authenticated webhook calls and internal sub-workflow calls must return
// the same governed store output. Avoid a Respond-to-Webhook terminal node,
// which does not propagate its payload back to Execute Sub-workflow callers.
apiWebhook.parameters.responseMode = "lastNode";
orchestrator.nodes = orchestrator.nodes.filter((node) => node.name !== "Respond to Skill Designer v3");
delete orchestrator.connections[store.name];
if (!orchestrator.nodes.some((node) => node.name === "ZM-10 Internal Workflow Input")) {
  orchestrator.nodes.push({
    id: "zm10-internal-workflow-input",
    name: "ZM-10 Internal Workflow Input",
    type: "n8n-nodes-base.executeWorkflowTrigger",
    typeVersion: 1.1,
    position: [-760, 280],
    parameters: { inputSource: "passthrough" },
  });
  orchestrator.connections["ZM-10 Internal Workflow Input"] = {
    main: [[{ node: governor.name, type: "main", index: 0 }]],
  };
}
writeFileSync(orchestratorPath, `${JSON.stringify(orchestrator, null, 2)}\n`);

const table = { __rl: true, value: "ZTrdtZu10soIyPDV", mode: "list", cachedResultName: "DEKRA Skill Mapping Runs", cachedResultUrl: "/projects/tYB0YoTCoB3cCCKR/datatables/ZTrdtZu10soIyPDV" };
const headerCredential = { httpHeaderAuth: { id: process.env.N8N_WEBHOOK_CREDENTIAL_ID || "u1xSkfoz8LNYw5DM", name: "DEKRA Skill Designer Webhook Auth" } };
const orchestratorWorkflowId = process.env.ZM10_ORCHESTRATOR_WORKFLOW_ID || "fveyWpcJhgxGLXxZ";
const schema = ["runId","jobDescriptionId","status","runJson","requestJson","resultJson","workspaceJson","idempotencyKey","interruptRequested"].map((id) => ({ id, displayName: id, required: false, defaultMatch: id === "runId", display: true, type: id === "interruptRequested" ? "boolean" : "string", canBeUsedToMatch: true }));
const columns = (value) => ({ mappingMode: "defineBelow", value, matchingColumns: ["runId"], schema, attemptToConvertTypes: false, convertFieldsToString: false });
const upsert = (name, position) => ({ id: `zm10-${name.toLowerCase().replaceAll(' ','-')}`, name, type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position, parameters: { resource: "row", operation: "upsert", dataTableId: table, matchType: "allConditions", filters: { conditions: [{ keyName: "runId", condition: "eq", keyValue: "={{ $json.runId }}" }] }, columns: columns({ runId: "={{ $json.runId }}", jobDescriptionId: "={{ $json.jobDescriptionId }}", status: "={{ $json.status }}", runJson: "={{ $json.runJson }}", requestJson: "={{ $json.requestJson }}", resultJson: "={{ $json.resultJson || '' }}", workspaceJson: "={{ $json.workspaceJson || '' }}", idempotencyKey: "={{ $json.idempotencyKey }}", interruptRequested: "={{ $json.interruptRequested }}" }), options: {} } });
const getRow = (name, position) => ({ id: `zm10-${name.toLowerCase().replaceAll(' ','-')}`, name, type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position, alwaysOutputData: true, parameters: { resource: "row", operation: "get", dataTableId: table, matchType: "allConditions", filters: { conditions: [{ keyName: "runId", condition: "eq", keyValue: "={{ $json.runId || $json.body?.runId }}" }] }, returnAll: false, limit: 1 } });
const code = (id, name, position, jsCode) => ({ id, name, type: "n8n-nodes-base.code", typeVersion: 2, position, parameters: { jsCode } });
const webhook = (id, name, path, responseMode, position) => ({ id, name, type: "n8n-nodes-base.webhook", typeVersion: 2.1, position, credentials: headerCredential, parameters: { authentication: "headerAuth", httpMethod: "POST", path, responseMode, options: { allowedOrigins: "https://florianliepe.github.io" } } });
const respond = { id: "zm10-control-respond", name: "Respond to Mapping Control", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.5, position: [720, 240], parameters: { respondWith: "json", responseBody: "={{ $json }}", options: { responseCode: "={{ $json.statusCode || 200 }}" } } };
const executeOrchestrator = (id, name, position) => ({
  id,
  name,
  type: "n8n-nodes-base.executeWorkflow",
  typeVersion: 1.2,
  position,
  onError: "continueRegularOutput",
  parameters: {
    workflowId: { __rl: true, value: orchestratorWorkflowId, mode: "id" },
    workflowInputs: { mappingMode: "defineBelow", value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true },
    options: { waitForSubWorkflow: true },
  },
});

const workerNodes = [
  webhook("zm10-start-webhook", "Async Mapping Start", "skill-designer-mapping-async-v1", "onReceived", [-900, 0]),
  code("zm10-prepare", "Prepare Queued Run", [-680, 0], `const body=$json.body||{};if(body.mode!=='skill.map_job.start'||!body.runId||!body.jobDescriptionId||!body.workspace||!body.idempotencyKey)throw new Error('Invalid governed mapping start command.');const now=new Date().toISOString();const run={id:String(body.runId),mode:'job_mapping',status:body.retryOfRunId?'retrying':'queued',jobDescriptionId:String(body.jobDescriptionId),projectId:'dekra-pilot',requestedBy:'authenticated-pilot-user',stage:'Preparing evidence',progress:5,sessionVersion:1,inputRevision:\`workspace-\${body.workspace.revision}:job-\${body.workspace.jobDescriptions.find(j=>j.id===body.jobDescriptionId)?.version||0}\`,frameworkVersion:body.workspace.framework?.version,rulesVersion:body.workspace.framework?.rulesVersion,startedAt:now,updatedAt:now,model:'governed-agent',tools:[],trace:[],idempotencyKey:String(body.idempotencyKey),retryOfRunId:body.retryOfRunId,attempt:body.retryOfRunId?2:1};return[{json:{runId:run.id,jobDescriptionId:run.jobDescriptionId,status:run.status,runJson:JSON.stringify(run),requestJson:JSON.stringify(body),resultJson:'',workspaceJson:'',idempotencyKey:run.idempotencyKey,interruptRequested:false}}];`),
  upsert("Persist Queued Run", [-460, 0]),
  code("zm10-running", "Mark Run Running", [-240, 0], `const row=$json;const run=JSON.parse(row.runJson);Object.assign(run,{status:'running',stage:'Generating candidate skills',progress:30,updatedAt:new Date().toISOString()});return[{json:{...row,status:run.status,runJson:JSON.stringify(run)}}];`),
  upsert("Persist Running Run", [-20, 0]),
  code("zm10-map-command", "Prepare Deferred Mapping Command", [200, 0], `const row=$json;return[{json:{...JSON.parse(row.requestJson),mode:'skill.map_job',deferPersistence:true}}];`),
  executeOrchestrator("zm10-map", "Execute Deferred Mapping", [420, 0]),
  code("zm10-check-input", "Prepare Interruption Check", [640, 0], `const start=$('Persist Running Run').first().json;return[{json:{runId:start.runId,jobDescriptionId:start.jobDescriptionId,mappingResponse:$json}}];`),
  getRow("Read Interruption Flag", [860, 0]),
  code("zm10-finalize", "Finalize Mapping Decision", [1080, 0], `const row=$json;const response=$('Prepare Interruption Check').first().json.mappingResponse||{};const run=JSON.parse(row.runJson||'{}');if(row.interruptRequested===true){Object.assign(run,{status:'interrupted',stage:'Interrupted safely',progress:100,interruptRequested:true,completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});return[{json:{...row,status:run.status,runJson:JSON.stringify(run),shouldSave:false,resultJson:'',workspaceJson:''}}];}if(response.ok===false||!response.workspace){Object.assign(run,{status:'failed',stage:'Mapping failed',progress:100,error:{code:'MAPPING_EXECUTION_FAILED',message:String(response.error||response.message||'No governed workspace returned.'),retryable:true},completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});return[{json:{...row,status:run.status,runJson:JSON.stringify(run),shouldSave:false,resultJson:JSON.stringify(response),workspaceJson:''}}];}Object.assign(run,{status:'validating',stage:'Running governance validation',progress:85,updatedAt:new Date().toISOString()});return[{json:{...row,status:run.status,runJson:JSON.stringify(run),shouldSave:true,resultJson:JSON.stringify(response),workspaceJson:JSON.stringify(response.workspace)}}];`),
  { id: "zm10-if-save", name: "If Save Allowed", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [1300, 0], parameters: { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 }, conditions: [{ id: "zm10-save-condition", leftValue: "={{ $json.shouldSave }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} } },
  upsert("Persist Validating Run", [1520, -100]),
  code("zm10-save-command", "Prepare Governed Save Command", [1740, -100], `return[{json:{mode:'skill.save',workspace:JSON.parse($json.workspaceJson),expectedRevision:JSON.parse($json.requestJson).workspace.revision,idempotencyKey:'skill.map_job.commit:'+$json.runId}}];`),
  executeOrchestrator("zm10-save", "Persist Governed Result", [1960, -100]),
  code("zm10-complete", "Complete Mapping Run", [2180, -100], `const row=$('Persist Validating Run').first().json;const saved=$json;const run=JSON.parse(row.runJson);if(saved.ok===false||!saved.workspace){Object.assign(run,{status:'failed',stage:'Failed-publication recovery required',progress:100,error:{code:'WORKSPACE_SAVE_FAILED',message:String(saved.error||saved.message||'Governed save failed.'),retryable:true},completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}else{Object.assign(run,{status:'needs_review',stage:'Preparing review suggestion',progress:100,resultReference:\`n8n-data-table://DEKRA-Skill-Mapping-Runs/\${run.id}\`,completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}return[{json:{...row,status:run.status,runJson:JSON.stringify(run),workspaceJson:saved.workspace?JSON.stringify(saved.workspace):row.workspaceJson,resultJson:JSON.stringify(saved),interruptRequested:false}}];`),
  upsert("Persist Terminal Run", [2400, -100]),
  upsert("Persist Interrupted Run", [1520, 140]),
];
const workerConnections = {
  "Async Mapping Start": { main: [[{ node: "Prepare Queued Run", type: "main", index: 0 }]] },
  "Prepare Queued Run": { main: [[{ node: "Persist Queued Run", type: "main", index: 0 }]] },
  "Persist Queued Run": { main: [[{ node: "Mark Run Running", type: "main", index: 0 }]] },
  "Mark Run Running": { main: [[{ node: "Persist Running Run", type: "main", index: 0 }]] },
  "Persist Running Run": { main: [[{ node: "Prepare Deferred Mapping Command", type: "main", index: 0 }]] },
  "Prepare Deferred Mapping Command": { main: [[{ node: "Execute Deferred Mapping", type: "main", index: 0 }]] },
  "Execute Deferred Mapping": { main: [[{ node: "Prepare Interruption Check", type: "main", index: 0 }]] },
  "Prepare Interruption Check": { main: [[{ node: "Read Interruption Flag", type: "main", index: 0 }]] },
  "Read Interruption Flag": { main: [[{ node: "Finalize Mapping Decision", type: "main", index: 0 }]] },
  "Finalize Mapping Decision": { main: [[{ node: "If Save Allowed", type: "main", index: 0 }]] },
  "If Save Allowed": { main: [[{ node: "Persist Validating Run", type: "main", index: 0 }],[{ node: "Persist Interrupted Run", type: "main", index: 0 }]] },
  "Persist Validating Run": { main: [[{ node: "Prepare Governed Save Command", type: "main", index: 0 }]] },
  "Prepare Governed Save Command": { main: [[{ node: "Persist Governed Result", type: "main", index: 0 }]] },
  "Persist Governed Result": { main: [[{ node: "Complete Mapping Run", type: "main", index: 0 }]] },
  "Complete Mapping Run": { main: [[{ node: "Persist Terminal Run", type: "main", index: 0 }]] },
};

const controlNodes = [
  webhook("zm10-control-webhook", "Mapping Control API", "skill-designer-mapping-control-v1", "responseNode", [-720, 240]),
  code("zm10-control-command", "Validate Mapping Command", [-500, 240], `const body=$json.body||{};const allowed=['skill.map_job.status','skill.map_job.result','skill.map_job.interrupt'];if(!allowed.includes(body.mode)||!body.runId)return[{json:{ok:false,statusCode:400,error:'Invalid mapping control command.'}}];return[{json:{...body,runId:String(body.runId)}}];`),
  getRow("Read Mapping Run", [-280, 240]),
  code("zm10-control-response", "Apply Mapping Command", [-40, 240], `const command=$('Validate Mapping Command').first().json;if(!$json.runId)return[{json:{ok:false,statusCode:404,error:'Mapping run was not found.'}}];const run=JSON.parse($json.runJson||'{}');if(command.mode==='skill.map_job.interrupt'&&!['interrupted','needs_review','completed','failed','stale'].includes(run.status)){Object.assign(run,{status:'interrupt_requested',stage:'Stopping at a controlled checkpoint',interruptRequested:true,updatedAt:new Date().toISOString()});return[{json:{...$json,status:run.status,runJson:JSON.stringify(run),interruptRequested:true,write:true,response:{ok:true,mappingRun:run,message:'Interruption requested. The run will stop at its next controlled checkpoint.'}}}];}const response={ok:true,mappingRun:run};if(command.mode==='skill.map_job.result'){if(!['needs_review','completed'].includes(run.status))return[{json:{ok:false,statusCode:409,error:'Mapping result is not ready.',mappingRun:run,write:false}}];response.workspace=$json.workspaceJson?JSON.parse($json.workspaceJson):undefined;const result=$json.resultJson?JSON.parse($json.resultJson):{};response.message=result.message||'Mapping completed and its governed suggestion is ready for human review.';}return[{json:{...response,write:false}}];`),
  { id: "zm10-if-control-write", name: "If Control Write", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [180, 240], parameters: { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 }, conditions: [{ id: "zm10-control-write-condition", leftValue: "={{ $json.write }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} } },
  upsert("Persist Interrupt Request", [400, 120]),
  code("zm10-interrupt-response", "Format Interrupt Response", [600, 120], `return[{json:$('Apply Mapping Command').first().json.response}];`),
  respond,
];
const controlConnections = {
  "Mapping Control API": { main: [[{ node: "Validate Mapping Command", type: "main", index: 0 }]] },
  "Validate Mapping Command": { main: [[{ node: "Read Mapping Run", type: "main", index: 0 }]] },
  "Read Mapping Run": { main: [[{ node: "Apply Mapping Command", type: "main", index: 0 }]] },
  "Apply Mapping Command": { main: [[{ node: "If Control Write", type: "main", index: 0 }]] },
  "If Control Write": { main: [[{ node: "Persist Interrupt Request", type: "main", index: 0 }],[{ node: "Respond to Mapping Control", type: "main", index: 0 }]] },
  "Persist Interrupt Request": { main: [[{ node: "Format Interrupt Response", type: "main", index: 0 }]] },
  "Format Interrupt Response": { main: [[{ node: "Respond to Mapping Control", type: "main", index: 0 }]] },
};

const runtime = { name: "DEKRA Skill Mapping Runtime — ZM-10", nodes: [...workerNodes, ...controlNodes], connections: { ...workerConnections, ...controlConnections }, settings: { executionOrder: "v1" }, meta: { zielmodus: "ZM-10", dataTableId: table.value, contract: "async-mapping-1.0.0" }, pinData: {}, active: false };
writeFileSync("docs/n8n-zm10-mapping-runtime.workflow.json", `${JSON.stringify(runtime, null, 2)}\n`);
console.log("ZM-10 deterministic clarification and asynchronous Data Table runtime generated.");
