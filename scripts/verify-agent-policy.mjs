import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "docs/n8n-skill-designer-v3.workflow.json"), "utf8"));
const code = (name) => workflow.nodes.find((node) => node.name === name)?.parameters?.jsCode;
const executorCode = code("Deterministic Tool Policy Executor");
const storeCode = code("Governance Gate and v3 Store");
if (!executorCode || !storeCode) throw new Error("Agent policy workflow nodes are missing.");

const framework = { version: "3.1.0", rulesVersion: "rules-3.1.0", promptVersion: "skill-agent-2.0.0", mappingScoreVersion: "mapping-2.0.0" };
const workspace = { schemaVersion: 3, revision: 1, skills: [], mappings: [], mappingFeedback: [], profiles: [], strategicVectors: [], interviews: [], elicitationSessions: [], reviewQueue: [], agentRuns: [], auditLog: [], tools: [], agentTools: [], validationRules: [], proficiencyDefinitions: [], sources: [], evidenceRecords: [], localizedLabels: [], objectVersions: [], releaseHistory: [], relationships: [], kflaFactors: [], kflaClusters: [], kfla: [], jobDescriptions: [], framework, publication: { revision: 0, state: "working", githubPath: "data/skill-workspace.approved.json" } };
const tool = { id: "mapping_scorer", version: "1.0.0", permission: "skill.mapping.score", lifecycleStatus: "active", inputSchema: { required: ["mappingRef", "evidenceRef"] }, allowedDataClassifications: ["public", "internal"], allowedAgentActions: ["execute"], rateLimit: { requests: 1, windowSeconds: 60 } };
const executorStaticData = {};
const invoke = (toolCall, grantedPermissions = ["skill.mapping.score"]) => new Function("$node", "$json", "$getWorkflowStaticData", executorCode)(
  { "Build Governed Agent Context": { json: { ok: true, workspaceCandidate: structuredClone(workspace), registry: [tool], grantedPermissions, operationClassification: "internal", correlationId: "CORR-POLICY-1", receivedAt: "2026-08-07T00:00:00.000Z", mode: "skill.map_job", body: { workspace } } } },
  { output: JSON.stringify({ tool_calls: [{ arguments: { mappingRef: "working://mapping/1", evidenceRef: "working://evidence/1" }, ...toolCall }], mapping_proposals: [], new_skill_proposals: [] }) },
  () => executorStaticData,
)[0].json;

const allowed = invoke({ name: "mapping_scorer", inputRef: "working://mapping/1", action: "execute", dataClassification: "internal" });
if (allowed.policyDenied || allowed.agentRun.invocations[0].result !== "success") throw new Error("A valid least-privilege tool call was denied.");
if (!allowed.agentRun.invocations[0].outputRef?.startsWith("working://agent-tools/mapping_scorer/") || allowed.agentResult.tool_outputs?.length !== 1) throw new Error("Successful implementation did not return an opaque versioned output reference.");

const deniedInput = invoke({ name: "mapping_scorer", inputRef: "working://mapping/invalid", action: "execute", dataClassification: "internal", arguments: {} });
if (!deniedInput.policyDenied || deniedInput.agentRun.invocations[0].errorCode !== "INVALID_INPUT") throw new Error("Required tool arguments were not enforced.");

const deniedClassification = invoke({ name: "mapping_scorer", inputRef: "working://mapping/2", action: "execute", dataClassification: "licensed" });
if (!deniedClassification.policyDenied || deniedClassification.agentRun.invocations[0].errorCode !== "DATA_CLASSIFICATION_DENIED") throw new Error("Licensed data was not denied.");

const deniedPermission = invoke({ name: "mapping_scorer", inputRef: "working://mapping/3", action: "execute", dataClassification: "internal" }, []);
if (!deniedPermission.policyDenied || deniedPermission.agentRun.invocations[0].errorCode !== "PERMISSION_DENIED") throw new Error("Missing permission was not denied.");

const deniedAction = invoke({ name: "mapping_scorer", inputRef: "working://mapping/4", action: "publish", dataClassification: "internal" });
if (!deniedAction.policyDenied || deniedAction.agentRun.invocations[0].errorCode !== "ACTION_DENIED") throw new Error("Non-allowlisted action was not denied.");

const deniedRate = invoke({ name: "mapping_scorer", inputRef: "working://mapping/5", action: "execute", dataClassification: "internal" });
if (!deniedRate.policyDenied || deniedRate.agentRun.invocations[0].errorCode !== "RATE_LIMITED") throw new Error("Per-tool rate limit was not enforced.");

const staticData = {};
const persisted = new Function("$json", "$getWorkflowStaticData", "items", storeCode)(deniedAction, () => staticData, [] )[0].json;
if (persisted.ok !== false || persisted.statusCode !== 403) throw new Error("Denied invocation did not return the policy error contract.");
if (!staticData.workspace?.auditLog?.some((event) => event.action === "agent_tool.denied" && event.correlationId === "CORR-POLICY-1")) throw new Error("Denied invocation was not persisted to the audit trail.");

console.log("Agent policy verified: deterministic output plus input, classification, permission, action and rate denials with persisted audit evidence.");
