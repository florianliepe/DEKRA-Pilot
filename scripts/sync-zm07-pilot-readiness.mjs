import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve("docs/n8n-skill-designer-v3.workflow.json");
const workflow = JSON.parse(readFileSync(path, "utf8"));
const governor = workflow.nodes.find((node) => node.name === "Request Governor v3");
const store = workflow.nodes.find((node) => node.name === "Governance Gate and v3 Store");
if (!governor || !store) throw new Error("The governed v3 request or persistence node is missing.");

let governorCode = governor.parameters.jsCode;
if (!governorCode.includes("'skill.health'")) {
  governorCode = governorCode.replace("const allowed=['skill.read'", "const allowed=['skill.read','skill.health'");
}
if (!governorCode.includes("ZM-07 PILOT READINESS")) {
  governorCode = governorCode.replace("const body=$json.body??{};", "// ZM-07 PILOT READINESS: health is read-only, bounded and returns no credentials or protected content.\nconst body=$json.body??{};");
}
governor.parameters.jsCode = governorCode;

let storeCode = store.parameters.jsCode;
const insertion = `if($json.mode==='skill.health'){const required=['job_parser','evidence_extractor','taxonomy_search','skill_similarity_search','syntax_validator','granularity_validator','kfla_lookup','controlled_tool_lookup','mapping_scorer','draft_suggestion_writer','review_package_generator'];const active=new Set((workspace.agentTools||[]).filter(tool=>tool.lifecycleStatus==='active').map(tool=>tool.id));const pending=(workspace.reviewQueue||[]).filter(item=>item.status==='pending').length;const failed=(workspace.agentRuns||[]).filter(run=>run.status==='failed').length;const missing=required.filter(id=>!active.has(id));return[{json:{ok:true,health:{status:missing.length?'degraded':'operational',checkedAt:new Date().toISOString(),schemaVersion:Number(workspace.schemaVersion||0),revision:Number(workspace.revision||0),frameworkVersion:String(workspace.framework?.version||'unknown'),pendingReviews:pending,failedRuns:failed,activeAgentTools:active.size,requiredAgentTools:required.length,receiptCount:Object.keys(store.zm01Receipts||{}).length,auditEvents:(workspace.auditLog||[]).length,lastUpdatedAt:workspace.updatedAt},message:missing.length?'Workflow is reachable but required agent tools need attention.':'Governed Skill Designer workflow is operational.'}}];}\n`;
if (!storeCode.includes("if($json.mode==='skill.health')")) {
  storeCode = storeCode.replace("if($json.mode==='skill.read')", `${insertion}if($json.mode==='skill.read')`);
}
store.parameters.jsCode = storeCode;

workflow.name = "DEKRA Skill Designer v3 — ZM-07 pilot ready";
workflow.meta = { ...(workflow.meta || {}), zielmodus: "ZM-07", readinessContract: "pilot-readiness-1.0.0" };
writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
console.log("ZM-07 read-only health contract synchronized into the governed Skill Designer workflow.");
