"use client";

import { useState } from "react";
import { Icons } from "./icons";
import { applyControlledToolLifecycle, impactAnalysis, recordGovernedVersion, type ControlledToolLifecycleAction } from "@/lib/skill-governance";
import type { ControlledTool, SkillWorkspace } from "@/lib/skill-schema";

type Mutate = (update: (current: SkillWorkspace) => SkillWorkspace) => void;
type ToolDraft = Omit<ControlledTool, "id" | "allowedAgentActions" | "status"> & { id?: string };
type ActionDraft = { action: ControlledToolLifecycleAction; toolId: string; actor: string; reason: string; targetToolId: string };

const emptyTool: ToolDraft = { name: "", category: "technology", description: "", aliases: [], skillIds: [] };
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function ControlledToolWorkbench({ workspace, mutate }: { workspace: SkillWorkspace; mutate: Mutate }) {
  const [draft, setDraft] = useState<ToolDraft | null>(null);
  const [action, setAction] = useState<ActionDraft | null>(null);
  const source = action ? workspace.tools.find((tool) => tool.id === action.toolId) : undefined;
  const impact = source ? impactAnalysis(workspace, source.id) : undefined;

  function saveTool(actor: string, reason: string) {
    if (!draft?.name.trim()) return;
    const id = draft.id || `TOOL-${Date.now()}`;
    mutate((current) => {
      const prior = current.tools.find((item) => item.id === id);
      const record: ControlledTool = { ...draft, id, name: draft.name.trim(), description: draft.description.trim(), allowedAgentActions: prior?.allowedAgentActions || ["read", "suggest_mapping", "validate"], status: prior?.status === "approved" ? "in_review" : prior?.status || "draft" };
      const next = { ...current, tools: prior ? current.tools.map((item) => item.id === id ? record : item) : [record, ...current.tools] };
      return recordGovernedVersion(next, "controlled_tool", id, prior ? "tool.updated" : "tool.created", actor.trim(), { ...record, governanceReason: reason.trim() } as unknown as Record<string, unknown>);
    });
    setDraft(null);
  }

  function begin(toolId: string, next: ControlledToolLifecycleAction) { setAction({ action: next, toolId, actor: "", reason: "", targetToolId: "" }); }
  function applyAction() {
    if (!action) return;
    const newToolId = action.action === "duplicate" ? `TOOL-${Date.now().toString().slice(-8)}` : undefined;
    try {
      mutate((current) => applyControlledToolLifecycle(current, { action: action.action, toolId: action.toolId, actor: action.actor, reason: action.reason, targetToolId: action.targetToolId || undefined, newToolId }));
      setAction(null);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Controlled-tool lifecycle action failed."); }
  }

  return <section className="panel tool-catalog"><header><div><span className="section-kicker">CONTROLLED BUSINESS VOCABULARY</span><h3>Tools, methods, regulations and data assets</h3><p>This catalogue is separate from the callable AI agent-tool registry. Structural changes require impact review and accountable rationale.</p></div><button className="button primary" onClick={() => setDraft({ ...emptyTool })}><Icons.plus/>Add controlled tool</button></header><div className="tool-table"><div><b>Name</b><b>Category</b><b>Linked skills</b><b>Agent permissions</b><b>Status</b><b/></div>{workspace.tools.map((tool) => <div key={tool.id}><span><b>{tool.name}</b><small>{tool.description}</small>{tool.governance?.replacedById && <em>Replaced by {workspace.tools.find((item) => item.id === tool.governance?.replacedById)?.name || tool.governance.replacedById}</em>}</span><span>{tool.category}</span><span>{tool.skillIds.length}</span><span>{tool.allowedAgentActions.join(" · ")}</span><span><em className={`lifecycle ${tool.status}`}>{tool.status}</em></span><span className="record-actions"><button aria-label={`Edit ${tool.name}`} onClick={() => setDraft({ id: tool.id, name: tool.name, category: tool.category, description: tool.description, aliases: tool.aliases, skillIds: tool.skillIds })}><Icons.edit/></button><button aria-label={`Duplicate ${tool.name}`} onClick={() => begin(tool.id, "duplicate")}><Icons.copy/></button><button aria-label={`${tool.status === "archived" ? "Restore" : "Archive"} ${tool.name}`} onClick={() => begin(tool.id, tool.status === "archived" ? "restore" : "archive")}>{tool.status === "archived" ? <Icons.refresh/> : <Icons.trash/>}</button><button aria-label={`Deprecate ${tool.name}`} disabled={["archived", "retired"].includes(tool.status)} onClick={() => begin(tool.id, "deprecate")}><Icons.risk/></button><button aria-label={`Replace ${tool.name}`} disabled={["archived", "retired"].includes(tool.status)} onClick={() => begin(tool.id, "replace")}><Icons.arrow/></button><button aria-label={`Merge ${tool.name}`} disabled={["archived", "retired"].includes(tool.status)} onClick={() => begin(tool.id, "merge")}><Icons.layers/></button></span></div>)}</div>{draft && <ToolEditor draft={draft} workspace={workspace} onChange={setDraft} onSave={saveTool} onClose={() => setDraft(null)}/>} {action && source && <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); applyAction(); }}><header><div><span className="section-kicker">CONTROLLED-TOOL IMPACT</span><h3>{title(action.action)} {source.name}</h3></div><button type="button" aria-label="Close controlled-tool lifecycle action" onClick={() => setAction(null)}><Icons.close/></button></header><p>{impact?.dependencyCount || 0} dependencies are in scope: {impact?.toolSkills.length || 0} linked skills and {impact?.toolMappings.length || 0} job mappings. Replace or merge migrates mapping references and returns the target to review.</p>{["replace", "merge"].includes(action.action) && <label><span>Target controlled tool</span><select required value={action.targetToolId} onChange={(event) => setAction({ ...action, targetToolId: event.target.value })}><option value="">Select governed target</option>{workspace.tools.filter((tool) => tool.id !== source.id && !["archived", "retired"].includes(tool.status)).map((tool) => <option value={tool.id} key={tool.id}>{tool.name}</option>)}</select></label>}<label><span>Accountable actor</span><input required value={action.actor} onChange={(event) => setAction({ ...action, actor: event.target.value })}/></label><label><span>Governance reason</span><textarea required value={action.reason} onChange={(event) => setAction({ ...action, reason: event.target.value })}/></label><footer><button type="button" className="button secondary" onClick={() => setAction(null)}>Cancel</button><button className="button primary">Apply governed tool action</button></footer></form></div>}</section>;
}

function ToolEditor({ draft, workspace, onChange, onSave, onClose }: { draft: ToolDraft; workspace: SkillWorkspace; onChange: (draft: ToolDraft) => void; onSave: (actor: string, reason: string) => void; onClose: () => void }) {
  const [actor, setActor] = useState(""); const [reason, setReason] = useState("");
  return <div className="modal-backdrop"><form className="modal-card skill-modal" onSubmit={(event) => { event.preventDefault(); onSave(actor, reason); }}><header><h3>{draft.id ? "Edit" : "Create"} controlled tool</h3><button type="button" aria-label="Close controlled-tool editor" onClick={onClose}><Icons.close/></button></header><div className="form-row"><label><span>Name</span><input required value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })}/></label><label><span>Category</span><select value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value as ControlledTool["category"] })}>{["technology", "method", "regulation", "data", "workflow"].map((item) => <option key={item}>{item}</option>)}</select></label></div><label><span>Description and usage boundary</span><textarea required value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })}/></label><label><span>Aliases</span><input value={draft.aliases.join(", ")} onChange={(event) => onChange({ ...draft, aliases: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}/></label><fieldset className="skill-checkboxes"><legend>Linked approved skills</legend>{workspace.skills.filter((skill) => skill.status === "approved").map((skill) => <label key={skill.id}><input type="checkbox" checked={draft.skillIds.includes(skill.id)} onChange={(event) => onChange({ ...draft, skillIds: event.target.checked ? [...draft.skillIds, skill.id] : draft.skillIds.filter((id) => id !== skill.id) })}/>{skill.name}</label>)}</fieldset><div className="form-row"><label><span>Accountable actor</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Governance reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)}/></label></div><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save tool</button></footer></form></div>;
}
