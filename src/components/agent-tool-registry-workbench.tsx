"use client";

import { useMemo, useState } from "react";
import { authorizeAgentToolCall, impactAnalysis } from "@/lib/skill-governance";
import type { AgentToolDefinition, DataClassification, SkillWorkspace } from "@/lib/skill-schema";
import { Icons } from "./icons";

type Props = {
  workspace: SkillWorkspace;
  onEdit: (tool: AgentToolDefinition | "new") => void;
  onLifecycle: (tool: AgentToolDefinition) => void;
};

export function AgentToolRegistryWorkbench({ workspace, onEdit, onLifecycle }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(workspace.agentTools[0]?.id || "");
  const [classification, setClassification] = useState<DataClassification>("internal");
  const [action, setAction] = useState("execute");
  const [grantPermission, setGrantPermission] = useState(true);
  const [simulation, setSimulation] = useState<ReturnType<typeof authorizeAgentToolCall> | null>(null);
  const visible = useMemo(() => workspace.agentTools.filter((tool) => (status === "all" || tool.lifecycleStatus === status) && `${tool.id} ${tool.name} ${tool.purpose} ${tool.requiredPermission}`.toLowerCase().includes(query.toLowerCase())), [workspace.agentTools, status, query]);
  const selected = workspace.agentTools.find((tool) => tool.id === selectedId) || visible[0];
  const impact = selected ? impactAnalysis(workspace, selected.id) : null;
  const invocations = selected ? workspace.agentRuns.flatMap((run) => (run.invocations || []).map((invocation) => ({ ...invocation, runId: run.id, mode: run.mode }))).filter((item) => item.toolId === selected.id).slice(0, 8) : [];
  const active = workspace.agentTools.filter((tool) => tool.lifecycleStatus === "active").length;

  function simulate() {
    if (!selected) return;
    setSimulation(authorizeAgentToolCall(workspace, selected.id, { permissions: grantPermission ? [selected.requiredPermission] : [], dataClassification: classification, action, actingUser: "policy-simulator", correlationId: `SIM-${Date.now()}`, inputRef: `simulation://${selected.id}` }));
  }

  return <section className="agent-registry-workbench">
    <div className="agent-policy-strip">
      <article><span>DEFAULT ACCESS</span><b>Deny</b><small>Explicit tool + permission required</small></article>
      <article><span>CANONICAL TOOLS</span><b>{active} / 11</b><small>Active allowlisted implementations</small></article>
      <article><span>PROTECTED ACCESS</span><b>Blocked</b><small>Credentials · publication · licensed content</small></article>
      <article><span>TRACEABILITY</span><b>{workspace.agentRuns.reduce((count, run) => count + (run.invocations?.length || 0), 0)}</b><small>Recorded invocation decisions</small></article>
    </div>
    <div className="agent-registry-layout">
      <article className="panel agent-registry-list"><header><div><span className="section-kicker">EXPLICIT ALLOWLIST</span><h3>{workspace.agentTools.length} callable contracts</h3><p>Search, inspect and govern each implementation. Active status never bypasses runtime authorization.</p></div><button className="button primary" onClick={() => onEdit("new")}><Icons.plus/>Register draft</button></header><div className="agent-registry-filters"><label><span>Search tools</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID, purpose or permission"/></label><label><span>Lifecycle</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All states</option><option value="active">Active</option><option value="draft">Draft</option><option value="deprecated">Deprecated</option><option value="disabled">Disabled</option></select></label></div><div className="agent-tool-cards">{visible.map((tool) => { const toolImpact = impactAnalysis(workspace, tool.id); return <button key={tool.id} className={selected?.id === tool.id ? "active" : ""} onClick={() => { setSelectedId(tool.id); setSimulation(null); }}><span><b>{tool.name}</b><small>{tool.id} · {tool.requiredPermission}</small></span><em className={`lifecycle ${tool.lifecycleStatus}`}>{tool.version} · {tool.lifecycleStatus}</em><small>{tool.timeoutMs / 1000}s timeout · {tool.retryPolicy.maxAttempts} attempts · {toolImpact.agentToolInvocations.length} calls</small></button>; })}</div></article>
      {selected && <aside className="panel agent-tool-inspector"><header><div><span className="section-kicker">IMPLEMENTATION CONTRACT</span><h3>{selected.name}</h3><code>{selected.id}@{selected.version}</code></div><div className="record-actions"><button aria-label={`Edit ${selected.name}`} onClick={() => onEdit(selected)}><Icons.edit/></button><button aria-label={`Govern lifecycle ${selected.name}`} onClick={() => onLifecycle(selected)}><Icons.refresh/></button></div></header><p>{selected.purpose}</p><div className="agent-contract-grid"><span><small>Permission</small><b>{selected.requiredPermission}</b></span><span><small>Owner</small><b>{selected.owner}</b></span><span><small>Runtime</small><b>{selected.timeoutMs} ms · {selected.rateLimit.requests}/{selected.rateLimit.windowSeconds}s</b></span><span><small>Impact</small><b>{impact?.agentToolRuns.length || 0} runs · {impact?.agentToolInvocations.length || 0} calls</b></span></div><ContractList title="Allowed classifications" values={selected.allowedDataClassifications}/><ContractList title="Allowed actions" values={selected.allowedAgentActions}/><ContractList title="Retryable errors" values={selected.retryPolicy.retryableErrors}/><ContractList title="Error codes" values={selected.errorContract.codes}/><ContractList title="Required audit fields" values={selected.auditRequirements}/><details><summary>Input / output schemas</summary><div className="agent-schema-grid"><pre>{JSON.stringify(selected.inputSchema, null, 2)}</pre><pre>{JSON.stringify(selected.outputSchema, null, 2)}</pre></div></details><section className="agent-policy-simulator"><span className="section-kicker">AUTHORIZATION SIMULATOR</span><p>Run the same deterministic deny-by-default decision used by the governed workflow. No tool is executed.</p><div className="form-row"><label><span>Data classification</span><select value={classification} onChange={(event) => setClassification(event.target.value as DataClassification)}><option value="public">public</option><option value="internal">internal</option><option value="confidential">confidential</option><option value="licensed">licensed</option></select></label><label><span>Requested action</span><input value={action} onChange={(event) => setAction(event.target.value)}/></label><label className="checkbox"><input type="checkbox" checked={grantPermission} onChange={(event) => setGrantPermission(event.target.checked)}/><span>Grant exact permission</span></label></div><button className="button secondary" onClick={simulate}>Simulate authorization</button>{simulation && <div className={`policy-result ${simulation.allowed ? "allowed" : "denied"}`} role="status"><b>{simulation.code}</b><span>{simulation.reason}</span><small>{simulation.invocation.correlationId} · input redacted</small></div>}</section><section className="agent-invocation-history"><h4>Recent invocation history</h4>{invocations.length === 0 ? <p>No recorded calls for this version.</p> : invocations.map((item) => <article key={`${item.runId}-${item.correlationId}-${item.inputRef}`}><b>{item.result}</b><span>{item.mode} · {item.runId}</span><small>{item.toolVersion} · {item.durationMs} ms · retry {item.retryCount}{item.errorCode ? ` · ${item.errorCode}` : ""}</small></article>)}</section></aside>}
    </div>
  </section>;
}

function ContractList({ title, values }: { title: string; values: string[] }) {
  return <section className="agent-contract-list"><h4>{title}</h4><div>{values.map((value) => <span key={value}>{value}</span>)}</div></section>;
}
