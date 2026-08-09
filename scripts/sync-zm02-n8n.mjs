import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/n8n-skill-designer-v3.workflow.json";
const workflow = JSON.parse(readFileSync(path, "utf8"));
const requestGovernor = workflow.nodes.find((node) => node.name === "Request Governor v3");
const governanceStore = workflow.nodes.find((node) => node.name === "Governance Gate and v3 Store");
if (!requestGovernor || !governanceStore) throw new Error("Expected governed v3 nodes are missing.");

const replaceOnce = (value, from, to, label) => {
  if (!value.includes(from)) throw new Error(`Unable to apply ${label}; source contract changed.`);
  return value.replace(from, to);
};

let guard = requestGovernor.parameters.jsCode;
guard = replaceOnce(
  guard,
  "if(['skill.ingest_job','skill.clarify_job','skill.map_job'].includes(mode)&&!String(body.idempotencyKey||'').trim())",
  "if(['skill.save','skill.ingest_job','skill.clarify_job','skill.map_job'].includes(mode)&&!String(body.idempotencyKey||'').trim())",
  "save idempotency guard",
);
guard = replaceOnce(
  guard,
  "if(mode==='skill.ingest_job'){",
  "if(mode==='skill.save'&&(!body.workspace||!Number.isInteger(Number(body.expectedRevision))))return[{json:{ok:false,statusCode:400,error:'A workspace and integer expected revision are required for governed save.'}}];\nif(mode==='skill.ingest_job'){",
  "save concurrency input guard",
);
requestGovernor.parameters.jsCode = guard;

let store = governanceStore.parameters.jsCode;
store = replaceOnce(
  store,
  "const stateChanging=['skill.ingest_job','skill.clarify_job','skill.map_job'];",
  "const stateChanging=['skill.save','skill.ingest_job','skill.clarify_job','skill.map_job'];",
  "state-changing receipt scope",
);
store = replaceOnce(
  store,
  "if($json.mode==='skill.read'){store.workspace=workspace;return[{json:{ok:true,workspace,message:'Skill workspace loaded from the governed v3 orchestrator.'}}];}",
  "if($json.mode==='skill.read'){store.workspace=workspace;return[{json:{ok:true,workspace,message:'Skill workspace loaded from the governed v3 orchestrator.'}}];}\nif($json.mode==='skill.save'&&store.workspace&&Number(store.workspace.revision)!==Number(body.expectedRevision))return[{json:{ok:false,statusCode:409,error:`Working revision conflict: expected ${body.expectedRevision}, current ${store.workspace.revision}. Reload before saving.`,recovery:{expectedRevision:Number(store.workspace.revision),operation:'skill.read'}}}];",
  "optimistic revision check",
);
store = replaceOnce(
  store,
  "store.workspace=workspace;return[{json:{ok:true,workspace,message:`Skill workspace revision ${workspace.revision} persisted through n8n.`}}];}",
  "store.workspace=workspace;const saveResponse={ok:true,workspace,idempotencyKey,message:`Skill workspace revision ${workspace.revision} persisted through n8n.`};store.zm01Receipts[idempotencyKey]=saveResponse;return[{json:saveResponse}];}",
  "idempotent save receipt",
);
governanceStore.parameters.jsCode = store;
writeFileSync(path, `${JSON.stringify(workflow, null, 2)}\n`);
console.log("ZM-02 n8n save concurrency and idempotency contracts synchronized.");
