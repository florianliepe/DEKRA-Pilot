import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const requiredJson = [
  "data/skill-workspace.approved.json",
  "data/framework-config.json",
  "data/framework-version.json",
  "data/prompt-versions.json",
  "data/mapping-model-versions.json",
  "data/validation-rules.json",
  "data/agent-tool-registry.json",
  "data/releases/index.json",
  "data/releases/revision-0.bootstrap.manifest.json",
  "data/schemas/skill-workspace.schema.json",
  "data/schemas/release-manifest.schema.json",
  "data/schemas/agent-tool-registry.schema.json",
  "data/schemas/mapping-evaluation.schema.json",
  "data/evaluation/mapping-golden-baseline.json",
];
for (const path of requiredJson) json(path);

const snapshot = json("data/skill-workspace.approved.json");
const requiredWorkspaceArrays = ["domains", "groups", "relationships", "skills", "profiles", "interviews", "elicitationSessions", "reviewQueue", "kflaFactors", "kflaClusters", "kfla", "jobDescriptions", "mappings", "strategicVectors", "agentRuns", "tools", "agentTools", "validationRules", "proficiencyDefinitions", "sources", "evidenceRecords", "auditLog", "objectVersions", "releaseHistory"];
if (requiredWorkspaceArrays.some((key) => !Array.isArray(snapshot[key]))) throw new Error("Approved workspace bootstrap is missing a schema-v3 collection.");
if (!snapshot.framework?.mappingWeights || Object.keys(snapshot.framework.mappingWeights).length !== 13 || !snapshot.publication) throw new Error("Approved workspace bootstrap is missing framework or publication contracts.");

const registry = json("data/agent-tool-registry.json");
if (registry.policy?.defaultAccess !== "deny" || registry.tools?.length !== 11) throw new Error("Agent-tool registry must be deny-by-default with exactly eleven tools.");
for (const tool of registry.tools) {
  const required = ["id", "name", "purpose", "inputSchema", "outputSchema", "requiredPermission", "allowedDataClassifications", "timeoutMs", "retryPolicy", "rateLimit", "errorContract", "auditRequirements", "version", "lifecycleStatus", "owner", "allowedAgentActions"];
  if (required.some((key) => tool[key] === undefined)) throw new Error(`Agent tool ${tool.id || "unknown"} has an incomplete contract.`);
  if (tool.allowedDataClassifications.includes("licensed")) throw new Error(`Agent tool ${tool.id} may not access licensed content.`);
}

const framework = json("data/framework-config.json");
if (Object.keys(framework.mappingWeights || {}).length !== 13) throw new Error("Framework configuration must contain all thirteen mapping weights.");

const workflows = [
  ["docs/n8n-skill-designer-v3.workflow.json", "skill-designer-orchestrator-v3"],
  ["docs/n8n-skill-publisher-v3.workflow.json", "skill-designer-publisher-v3"],
];
for (const [path, expectedWebhook] of workflows) {
  const workflow = json(path);
  const webhookPaths = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.webhook").map((node) => node.parameters?.path);
  if (!webhookPaths.includes(expectedWebhook)) throw new Error(`${path} does not expose ${expectedWebhook}.`);
  for (const node of workflow.nodes.filter((node) => typeof node.parameters?.jsCode === "string")) {
    try { new Function(node.parameters.jsCode); }
    catch (reason) { throw new Error(`${path} node ${node.name} contains invalid JavaScript: ${reason.message}`); }
  }
  if (path.includes("publisher") && (!JSON.stringify(workflow).includes("PROFICIENCY-INTEGRITY-001") || !JSON.stringify(workflow).includes("evidenceRecords"))) throw new Error("Publisher v3 must validate and sanitize proficiency, source and evidence contracts.");
}

console.log(`Governance artifacts verified: ${requiredJson.length} JSON contracts, 11 agent tools and 2 n8n v3 workflows.`);
