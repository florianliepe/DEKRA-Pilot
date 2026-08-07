"use client";

import { useMemo, useState } from "react";
import { Icons } from "./icons";
import { workspaceFindings, type ControlledTool, type KflaCompetency, type SkillWorkspace, type TaxonomyNode } from "@/lib/skill-schema";

type Mutate = (update: (current: SkillWorkspace) => SkillWorkspace) => void;
type NodeDraft = { kind: "domain" | "group"; id?: string; name: string; description: string; domainId: string };
type ToolDraft = Omit<ControlledTool, "id" | "allowedAgentActions" | "status"> & { id?: string };

const emptyNode = (kind: NodeDraft["kind"], domainId = ""): NodeDraft => ({ kind, name: "", description: "", domainId });
const emptyTool: ToolDraft = { name: "", category: "technology", description: "", aliases: [], skillIds: [] };

export function TaxonomyStandardWorkbench({ workspace, mutate }: { workspace: SkillWorkspace; mutate: Mutate }) {
  const [view, setView] = useState<"hierarchy" | "kfla" | "tools" | "quality">("kfla");
  const [factor, setFactor] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<KflaCompetency | null>(null);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [toolDraft, setToolDraft] = useState<ToolDraft | null>(null);
  const findings = workspaceFindings(workspace);
  const kfla = useMemo(() => workspace.kfla.filter((item) => (factor === "All" || item.factor === factor) && `${item.name} ${item.publicSummary}`.toLowerCase().includes(query.toLowerCase())), [workspace.kfla, factor, query]);

  function audit(current: SkillWorkspace, eventId: string, eventAt: string, action: string, entityType: string, entityId: string, summary: string): SkillWorkspace {
    return { ...current, auditLog: [{ id: eventId, at: eventAt, actor: "human" as const, action, entityType, entityId, summary }, ...current.auditLog].slice(0, 250) };
  }

  function saveNode() {
    if (!nodeDraft?.name.trim()) return;
    const timestamp = Date.now();
    const eventAt = new Date(timestamp).toISOString();
    const id = nodeDraft.id || `${nodeDraft.kind === "domain" ? "DOM" : "GRP"}-${timestamp}`;
    mutate((current) => {
      const record: TaxonomyNode = { id, name: nodeDraft.name.trim(), description: nodeDraft.description.trim(), status: "draft" };
      const next = nodeDraft.kind === "domain"
        ? { ...current, domains: nodeDraft.id ? current.domains.map((item) => item.id === id ? { ...item, ...record } : item) : [...current.domains, record] }
        : { ...current, groups: nodeDraft.id ? current.groups.map((item) => item.id === id ? { ...item, ...record, domainId: nodeDraft.domainId } : item) : [...current.groups, { ...record, domainId: nodeDraft.domainId }] };
      return audit(next, `AUD-${timestamp}`, eventAt, nodeDraft.id ? "taxonomy.updated" : "taxonomy.created", nodeDraft.kind, id, `${record.name} saved as a governed draft.`);
    });
    setNodeDraft(null);
  }

  function archiveNode(kind: "domain" | "group", id: string, timestamp: number) {
    const eventAt = new Date(timestamp).toISOString();
    mutate((current) => {
      const linked = kind === "domain" ? current.groups.some((item) => item.domainId === id && item.status !== "retired") : current.skills.some((item) => item.groupId === id && item.status !== "retired");
      if (linked) return current;
      const next = kind === "domain" ? { ...current, domains: current.domains.map((item) => item.id === id ? { ...item, status: "retired" as const } : item) } : { ...current, groups: current.groups.map((item) => item.id === id ? { ...item, status: "retired" as const } : item) };
      return audit(next, `AUD-${timestamp}`, eventAt, "taxonomy.archived", kind, id, "Unused taxonomy node archived; history retained.");
    });
  }

  function saveTool() {
    if (!toolDraft?.name.trim()) return;
    const timestamp = Date.now();
    const eventAt = new Date(timestamp).toISOString();
    const id = toolDraft.id || `TOOL-${timestamp}`;
    mutate((current) => {
      const record: ControlledTool = { ...toolDraft, id, name: toolDraft.name.trim(), description: toolDraft.description.trim(), allowedAgentActions: ["read", "suggest_mapping", "validate"], status: "draft" };
      const next = { ...current, tools: toolDraft.id ? current.tools.map((item) => item.id === id ? { ...item, ...record } : item) : [record, ...current.tools] };
      return audit(next, `AUD-${timestamp}`, eventAt, toolDraft.id ? "tool.updated" : "tool.created", "controlled_tool", id, `${record.name} saved to the controlled catalogue.`);
    });
    setToolDraft(null);
  }

  function archiveTool(tool: ControlledTool, timestamp: number) {
    const eventAt = new Date(timestamp).toISOString();
    mutate((current) => audit({ ...current, tools: current.tools.map((item) => item.id === tool.id ? { ...item, status: "retired" } : item) }, `AUD-${timestamp}`, eventAt, "tool.archived", "controlled_tool", tool.id, `${tool.name} archived.`));
  }

  return <div className="standard-workbench skill-stack">
    <section className="standard-hero panel">
      <div><span className="section-kicker">GOVERNED STANDARD WORKBENCH</span><h3>Design, test and release a consistent capability language.</h3><p>Working changes stay in n8n. Only approved, validated revisions are released as GitHub-managed JSON.</p></div>
      <div className="standard-state"><b>Revision {workspace.revision}</b><span>{workspace.publication.state === "approved_release" ? "Approved release" : "Working state"}</span><small>{findings.length} validation findings</small></div>
    </section>
    <nav className="standard-tabs" aria-label="Taxonomy workbench views">{[["hierarchy", "Hierarchy CRUD"], ["kfla", "38 KFLA dimensions"], ["tools", "Controlled tools"], ["quality", "Syntax & quality"]].map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id as typeof view)}>{label}</button>)}</nav>

    {view === "hierarchy" && <section className="taxonomy-tree panel"><header><div><span className="section-kicker">L1-L3 TAXONOMY</span><h3>Capability hierarchy</h3></div><div><button className="button secondary" onClick={() => setNodeDraft(emptyNode("group", workspace.domains[0]?.id))}>Add group</button><button className="button primary" onClick={() => setNodeDraft(emptyNode("domain"))}>Add domain</button></div></header>{workspace.domains.map((domain) => <article className="domain-row" key={domain.id}><div><b>L1</b><span><strong>{domain.name}</strong><small>{domain.description || "Description required"} · {domain.status}</small></span><span className="record-actions"><button aria-label={`Edit ${domain.name}`} onClick={() => setNodeDraft({ kind: "domain", id: domain.id, name: domain.name, description: domain.description, domainId: "" })}><Icons.edit/></button><button aria-label={`Archive ${domain.name}`} onClick={() => archiveNode("domain", domain.id, Date.now())}><Icons.trash/></button></span></div>{workspace.groups.filter((group) => group.domainId === domain.id).map((group) => <div className="group-row" key={group.id}><b>L2</b><span><strong>{group.name}</strong><small>{group.description || "Description required"} · {group.status}</small></span><span className="record-actions"><button aria-label={`Edit ${group.name}`} onClick={() => setNodeDraft({ kind: "group", id: group.id, name: group.name, description: group.description, domainId: group.domainId })}><Icons.edit/></button><button aria-label={`Archive ${group.name}`} onClick={() => archiveNode("group", group.id, Date.now())}><Icons.trash/></button></span><div>{workspace.skills.filter((skill) => skill.groupId === group.id && skill.status !== "retired").map((skill) => <em key={skill.id}>{skill.name}</em>)}</div></div>)}</article>)}</section>}

    {view === "kfla" && <section className="kfla-panel panel"><header><div><span className="section-kicker">PUBLIC-SOURCE REFERENCE LAYER</span><h3>38 KFLA competency names</h3><p>Hover for the internal summary or open a deep dive. Licensed definitions and rating anchors remain separately controlled.</p></div><div className="kfla-filters"><input aria-label="Search KFLA dimensions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dimensions"/><select aria-label="Filter KFLA factor" value={factor} onChange={(event) => setFactor(event.target.value)}>{["All", "Thought", "Results", "People", "Self"].map((item) => <option key={item}>{item}</option>)}</select></div></header><div className="kfla-grid">{kfla.map((item) => <button className="kfla-card" key={item.id} title={item.publicSummary} onClick={() => setSelected(item)}><b>{String(item.number).padStart(2, "0")}</b><span><strong>{item.name}</strong><small>{item.factor} · {item.source}</small><em>{item.publicSummary}</em></span></button>)}</div></section>}

    {view === "tools" && <section className="panel tool-catalog"><header><div><span className="section-kicker">CONTROLLED VOCABULARY</span><h3>Tools, methods, regulations and data assets</h3><p>The agent may read, validate and suggest mappings; it cannot create or approve catalogue records.</p></div><button className="button primary" onClick={() => setToolDraft({ ...emptyTool })}><Icons.plus/>Add controlled tool</button></header><div className="tool-table"><div><b>Name</b><b>Category</b><b>Linked skills</b><b>Agent permissions</b><b>Status</b><b/></div>{workspace.tools.map((tool) => <div key={tool.id}><span><b>{tool.name}</b><small>{tool.description}</small></span><span>{tool.category}</span><span>{tool.skillIds.length}</span><span>{tool.allowedAgentActions.join(" · ")}</span><span><em className={`lifecycle ${tool.status}`}>{tool.status}</em></span><span className="record-actions"><button aria-label={`Edit ${tool.name}`} onClick={() => setToolDraft({ id: tool.id, name: tool.name, category: tool.category, description: tool.description, aliases: tool.aliases, skillIds: tool.skillIds })}><Icons.edit/></button><button aria-label={`Archive ${tool.name}`} onClick={() => archiveTool(tool, Date.now())}><Icons.trash/></button></span></div>)}</div></section>}

    {view === "quality" && <section className="quality-grid"><article className="panel"><span className="section-kicker">CANONICAL SYNTAX</span><h3>Action + object + outcome</h3><p>Names express a durable capability. Definitions establish meaning and boundaries. Observable evidence proves application. Context, tools and qualifications remain mapped metadata rather than skill names.</p><div className="syntax-example"><b>Visualise</b><span>business data</span><em>to enable decision-making</em></div></article><article className="panel"><span className="section-kicker">RELEASE GATE</span><h3>{findings.length ? `${findings.length} findings need attention` : "Ready for accountable approval"}</h3>{findings.length ? <ul>{findings.slice(0, 12).map((finding) => <li key={finding}>{finding}</li>)}</ul> : <p>All active mappings are grounded, taxonomy parents resolve and approved skills meet the design standard.</p>}</article><article className="panel governance-matrix"><span className="section-kicker">AGENT POLICY V1</span><h3>Suggestive, never authoritative</h3>{["Read approved taxonomy and controlled tools", "Extract evidence from untrusted job text", "Score and explain mapping proposals", "Create drafts in the human review queue", "Never approve, publish, delete or invent licensed content"].map((rule, index) => <p key={rule}><b>{String(index + 1).padStart(2, "0")}</b>{rule}</p>)}</article></section>}

    {selected && <div className="modal-backdrop"><article className="modal-card kfla-detail"><header><div><span className="section-kicker">KFLA {String(selected.number).padStart(2, "0")} · {selected.factor}</span><h3>{selected.name}</h3></div><button aria-label="Close KFLA detail" onClick={() => setSelected(null)}><Icons.close/></button></header><div className="source-guard"><b>Public-source navigation summary</b><span>{selected.boundaryNotes}</span></div><h4>Internal working summary</h4><p>{selected.publicSummary}</p><h4>Observable elicitation signals</h4><ul>{selected.observableSignals.map((signal) => <li key={signal}>{signal}</li>)}</ul><h4>Provenance</h4>{selected.provenance.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} · {source.access}</a>)}</article></div>}
    {nodeDraft && <div className="modal-backdrop"><form className="modal-card skill-modal" onSubmit={(event) => { event.preventDefault(); saveNode(); }}><header><h3>{nodeDraft.id ? "Edit" : "Create"} {nodeDraft.kind}</h3><button type="button" onClick={() => setNodeDraft(null)}><Icons.close/></button></header>{nodeDraft.kind === "group" && <label><span>Parent domain</span><select value={nodeDraft.domainId} onChange={(event) => setNodeDraft({ ...nodeDraft, domainId: event.target.value })}>{workspace.domains.filter((item) => item.status !== "retired").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}<label><span>Canonical name</span><input value={nodeDraft.name} onChange={(event) => setNodeDraft({ ...nodeDraft, name: event.target.value })}/></label><label><span>Definition and boundary</span><textarea value={nodeDraft.description} onChange={(event) => setNodeDraft({ ...nodeDraft, description: event.target.value })}/></label><footer><button type="button" className="button secondary" onClick={() => setNodeDraft(null)}>Cancel</button><button className="button primary">Save draft</button></footer></form></div>}
    {toolDraft && <div className="modal-backdrop"><form className="modal-card skill-modal" onSubmit={(event) => { event.preventDefault(); saveTool(); }}><header><h3>{toolDraft.id ? "Edit" : "Create"} controlled tool</h3><button type="button" onClick={() => setToolDraft(null)}><Icons.close/></button></header><div className="form-row"><label><span>Name</span><input value={toolDraft.name} onChange={(event) => setToolDraft({ ...toolDraft, name: event.target.value })}/></label><label><span>Category</span><select value={toolDraft.category} onChange={(event) => setToolDraft({ ...toolDraft, category: event.target.value as ControlledTool["category"] })}>{["technology", "method", "regulation", "data", "workflow"].map((item) => <option key={item}>{item}</option>)}</select></label></div><label><span>Description and usage boundary</span><textarea value={toolDraft.description} onChange={(event) => setToolDraft({ ...toolDraft, description: event.target.value })}/></label><label><span>Aliases (comma-separated)</span><input value={toolDraft.aliases.join(", ")} onChange={(event) => setToolDraft({ ...toolDraft, aliases: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}/></label><fieldset className="skill-checkboxes"><legend>Linked approved skills</legend>{workspace.skills.filter((skill) => skill.status === "approved").map((skill) => <label key={skill.id}><input type="checkbox" checked={toolDraft.skillIds.includes(skill.id)} onChange={(event) => setToolDraft({ ...toolDraft, skillIds: event.target.checked ? [...toolDraft.skillIds, skill.id] : toolDraft.skillIds.filter((id) => id !== skill.id) })}/>{skill.name}</label>)}</fieldset><footer><button type="button" className="button secondary" onClick={() => setToolDraft(null)}>Cancel</button><button className="button primary">Save tool</button></footer></form></div>}
  </div>;
}
