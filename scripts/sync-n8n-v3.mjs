import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publisherPath = join(root, "docs", "n8n-skill-publisher-v3.workflow.json");
const workflow = JSON.parse(readFileSync(publisherPath, "utf8"));
const node = workflow.nodes.find((candidate) => candidate.name === "Validate and Prepare Atomic Release");
if (!node) throw new Error("Publisher validation node not found.");

const legacySanitizer = "const now=new Date().toISOString();const sanitized={...workspace,kfla:(workspace.kfla||[]).map(item=>({...item,definition:item.source==='licensed'?'':item.definition,licensedDefinitionRef:undefined}))};";
const approvedSanitizer = "const now=new Date().toISOString();const approvedSkills=(workspace.skills||[]).filter(item=>item.status==='approved');const approvedSkillIds=new Set(approvedSkills.map(item=>item.id));const approvedGroups=(workspace.groups||[]).filter(item=>item.status==='approved');const approvedGroupIds=new Set(approvedGroups.map(item=>item.id));const approvedDomainIds=new Set(approvedGroups.map(item=>item.domainId));const sanitized={...workspace,domains:(workspace.domains||[]).filter(item=>item.status==='approved'&&approvedDomainIds.has(item.id)),groups:approvedGroups,relationships:(workspace.relationships||[]).filter(item=>item.status==='approved'&&approvedSkillIds.has(item.sourceId)&&approvedSkillIds.has(item.targetId)),skills:approvedSkills.filter(item=>approvedGroupIds.has(item.groupId)),profiles:(workspace.profiles||[]).filter(item=>item.status==='approved').map(item=>({...item,skills:(item.skills||[]).filter(link=>approvedSkillIds.has(link.skillId))})),jobDescriptions:(workspace.jobDescriptions||[]).filter(item=>item.status==='mapped'),mappings:(workspace.mappings||[]).filter(item=>item.status==='approved'&&approvedSkillIds.has(item.skillId)),strategicVectors:(workspace.strategicVectors||[]).map(item=>({...item,skillIds:(item.skillIds||[]).filter(id=>approvedSkillIds.has(id))})),tools:(workspace.tools||[]).filter(item=>item.status==='approved').map(item=>({...item,skillIds:(item.skillIds||[]).filter(id=>approvedSkillIds.has(id))})),agentTools:(workspace.agentTools||[]).filter(item=>item.lifecycleStatus==='active'),validationRules:(workspace.validationRules||[]).filter(item=>item.enabled),interviews:[],elicitationSessions:[],agentRuns:[],agentToolInvocations:[],objectVersions:[],kfla:(workspace.kfla||[]).map(item=>({...item,definition:item.source==='licensed'?'':item.definition,licensedDefinitionRef:undefined}))};";

if (node.parameters.jsCode.includes(legacySanitizer)) node.parameters.jsCode = node.parameters.jsCode.replace(legacySanitizer, approvedSanitizer);
node.parameters.jsCode = node.parameters.jsCode
  .replace("const approvedSkills=(workspace.skills||[]).filter(item=>item.status==='approved');const approvedSkillIds=new Set(approvedSkills.map", "const publicSkills=(workspace.skills||[]).filter(item=>item.status==='approved');const approvedSkillIds=new Set(publicSkills.map")
  .replace("skills:approvedSkills.filter(item=>approvedGroupIds.has(item.groupId))", "skills:publicSkills.filter(item=>approvedGroupIds.has(item.groupId))")
  .replace("validationRules:(workspace.validationRules||[]).filter(item=>item.enabled)", "validationRules:(workspace.validationRules||[]).filter(item=>item.status==='approved')")
  .replace("agentRuns:[],agentToolInvocations:[],objectVersions:[]", "agentRuns:[],objectVersions:[]");
if (!node.parameters.jsCode.includes("const publicSkills=(workspace.skills||[]).filter")) throw new Error("Publisher sanitizer is neither the expected legacy nor approved-only implementation.");

writeFileSync(publisherPath, `${JSON.stringify(workflow, null, 2)}\n`);
console.log("n8n publisher v3 synchronized with the approved-only public release policy.");
