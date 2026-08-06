"use client";

import { useMemo, useState } from "react";
import { Icons } from "./icons";
import { runJobMapping } from "@/lib/skill-client";
import { proficiencyLevels, type JobDescription, type JobSkillMapping, type SkillWorkspace } from "@/lib/skill-schema";

type Props = {
  workspace: SkillWorkspace;
  secret: string;
  mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void;
  onWorkspace: (workspace: SkillWorkspace) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

const emptyJob = (): JobDescription => ({ id: "", title: "", jobFamily: "", country: "Global", language: "English", purpose: "", sourceText: "", responsibilities: [], outcomes: [], status: "draft", version: 1, updatedAt: new Date().toISOString() });

export function JobMappingWorkbench({ workspace, secret, mutate, onWorkspace, onMessage, onError }: Props) {
  const [selected, setSelected] = useState(workspace.jobDescriptions[0]?.id || "");
  const [editing, setEditing] = useState<JobDescription | "new" | null>(null);
  const [editingMapping, setEditingMapping] = useState<JobSkillMapping | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const job = workspace.jobDescriptions.find((item) => item.id === selected) || workspace.jobDescriptions[0];
  const mappings = useMemo(() => workspace.mappings.filter((item) => item.jobDescriptionId === job?.id).sort((a, b) => b.relevance - a.relevance), [workspace.mappings, job?.id]);

  function saveJob(record: JobDescription) {
    const value = { ...record, id: record.id || `JD-${Date.now()}`, responsibilities: record.sourceText.split(/[.\n]+/).map((item) => item.trim()).filter((item) => item.length > 20), updatedAt: new Date().toISOString() };
    mutate((current) => ({ ...current, jobDescriptions: record.id ? current.jobDescriptions.map((item) => item.id === record.id ? value : item) : [value, ...current.jobDescriptions] }));
    setSelected(value.id); setEditing(null); onMessage(`${value.title} saved as job-description version ${value.version}.`);
  }

  function deleteJob() {
    if (!job) return;
    mutate((current) => ({ ...current, jobDescriptions: current.jobDescriptions.filter((item) => item.id !== job.id), mappings: current.mappings.filter((item) => item.jobDescriptionId !== job.id), profiles: current.profiles.filter((item) => item.jobDescriptionId !== job.id) }));
    setSelected(""); onMessage(`${job.title} and its draft mappings were removed.`);
  }

  async function analyse() {
    if (!job) return;
    setBusy(true); onError("");
    try {
      const payload = await runJobMapping(secret, job.id, workspace);
      if (payload.workspace) onWorkspace(payload.workspace);
      onMessage(payload.message || "AI profile proposal added to the governance queue.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "AI job mapping failed."); }
    finally { setBusy(false); }
  }

  function saveMapping(mapping: JobSkillMapping) {
    const value = { ...mapping, id: mapping.id || `MAP-${Date.now()}`, jobDescriptionId: job.id, source: mapping.id ? mapping.source : "manual" as const, status: mapping.id ? mapping.status : "proposed" as const };
    mutate((current) => ({
      ...current,
      mappings: mapping.id ? current.mappings.map((item) => item.id === mapping.id ? value : item) : [...current.mappings, value],
      jobDescriptions: current.jobDescriptions.map((item) => item.id === job.id ? { ...item, status: "mapped" } : item),
    }));
    setEditingMapping(null);
  }

  if (!job) return <div className="empty-state"><Icons.document/><b>No job descriptions yet</b><button className="button primary" onClick={() => setEditing("new")}><Icons.plus/>Create job description</button>{editing && <JobEditor job={emptyJob()} onClose={() => setEditing(null)} onSave={saveJob}/>}</div>;

  const totalWeight = mappings.filter((item) => item.status !== "rejected").reduce((sum, item) => sum + item.weight, 0);
  return <div className="mapping-workbench">
    <aside className="panel job-list"><header><div><span className="section-kicker">JOB CATALOG</span><h3>{workspace.jobDescriptions.length} descriptions</h3></div><button aria-label="Create job description" onClick={() => setEditing("new")}><Icons.plus/></button></header>{workspace.jobDescriptions.map((item) => <button key={item.id} className={item.id === job.id ? "active" : ""} onClick={() => setSelected(item.id)}><span><b>{item.title}</b><small>{item.jobFamily} · v{item.version}</small></span><em>{item.status}</em></button>)}</aside>
    <section className="mapping-main">
      <article className="panel job-source"><header><div><span className="section-kicker">SOURCE OF TRUTH</span><h3>{job.title}</h3><p>{job.purpose}</p></div><div className="record-actions"><button aria-label={`Edit ${job.title}`} onClick={() => setEditing(job)}><Icons.edit/></button><button aria-label={`Delete ${job.title}`} onClick={deleteJob}><Icons.trash/></button></div></header><div className="job-meta"><span>{job.jobFamily}</span><span>{job.country}</span><span>{job.language}</span><span>Version {job.version}</span></div><div className="job-source-text">{job.sourceText}</div><footer><span>{job.responsibilities.length} responsibility statements</span><span>{job.outcomes.length} outcomes</span></footer></article>
      <article className="panel ai-mapping-command"><div className="agent-orb"><Icons.spark/></div><div><span className="section-kicker">AI SKILL DESIGN AGENT</span><h3>Map this job against the approved catalog</h3><p>The agent can read taxonomy, find duplicates, propose mappings and draft a profile. It cannot approve or delete records.</p><div className="tool-chips">{["read_catalog", "find_duplicates", "map_job_skills", "propose_profile"].map((tool) => <span key={tool}>{tool}</span>)}</div></div><button className="button primary" disabled={busy} onClick={() => void analyse()}><Icons.spark/>{busy ? "Agent mapping…" : "Run governed mapping"}</button></article>
      <article className="panel mapping-table"><header><div><span className="section-kicker">SKILL PROFILE PROPOSAL</span><h3>{mappings.length} mapped skills</h3></div><div className={totalWeight === 100 ? "weight-valid" : "weight-warning"}>{totalWeight}% allocated</div></header><div className="mapping-head"><span>Catalog skill</span><span>Evidence & rationale</span><span>Level</span><span>Weight</span><span>Fit</span><span/></div>{mappings.map((mapping) => { const skill = workspace.skills.find((item) => item.id === mapping.skillId); if (!skill) return null; const vectors = mapping.strategicVectorIds.map((id) => workspace.strategicVectors.find((item) => item.id === id)?.name).filter(Boolean); return <div className="mapping-row" key={mapping.id}><span><i className={`dimension-dot ${skill.dimension}`}/><b>{skill.name}</b><small>{skill.dimension} · {mapping.critical ? "critical" : "supporting"}</small>{vectors.length > 0 && <em>{vectors.join(" · ")}</em>}</span><span><b>{mapping.rationale}</b><small>{mapping.evidence[0] || "Reviewer evidence required"}</small></span><select aria-label={`${skill.name} mapped level`} value={mapping.targetLevel} onChange={(event) => mutate((current) => ({ ...current, mappings: current.mappings.map((item) => item.id === mapping.id ? { ...item, targetLevel: Number(event.target.value) as 1 | 2 | 3 | 4 } : item) }))}>{proficiencyLevels.map((level) => <option value={level.id} key={level.id}>{level.id} · {level.name}</option>)}</select><input aria-label={`${skill.name} mapping weight`} type="number" min="0" max="100" value={mapping.weight} onChange={(event) => mutate((current) => ({ ...current, mappings: current.mappings.map((item) => item.id === mapping.id ? { ...item, weight: Number(event.target.value) } : item) }))}/><span className="fit-score"><b>{mapping.relevance}%</b><small>{mapping.status}</small></span><span className="record-actions"><button aria-label={`Edit ${skill.name} mapping`} onClick={() => setEditingMapping(mapping)}><Icons.edit/></button><button aria-label={`Remove ${skill.name} mapping`} onClick={() => mutate((current) => ({ ...current, mappings: current.mappings.filter((item) => item.id !== mapping.id) }))}><Icons.trash/></button></span></div>; })}<footer><button className="button secondary" onClick={() => setEditingMapping("new")} disabled={mappings.length >= 10}><Icons.plus/>Add catalog skill</button><span>Maximum 10 core skills per pilot role · agent proposals require approval</span></footer></article>
      <article className="panel enriched-preview"><header><div><span className="section-kicker">UTILIZATION LAYER</span><h3>Job-description enrichment preview</h3></div><button className="button secondary" onClick={() => navigator.clipboard.writeText(buildEnrichedDescription(job, mappings, workspace))}>Copy draft</button></header><pre>{buildEnrichedDescription(job, mappings, workspace)}</pre></article>
    </section>
    {editing && <JobEditor job={editing === "new" ? emptyJob() : editing} onClose={() => setEditing(null)} onSave={saveJob}/>} 
    {editingMapping && <MappingEditor mapping={editingMapping === "new" ? emptyMapping(job.id, workspace, mappings) : editingMapping} workspace={workspace} mappings={mappings} onClose={() => setEditingMapping(null)} onSave={saveMapping}/>}
  </div>;
}

function emptyMapping(jobDescriptionId: string, workspace: SkillWorkspace, mappings: JobSkillMapping[]): JobSkillMapping {
  const skill = workspace.skills.find((item) => item.status === "approved" && !mappings.some((mapping) => mapping.skillId === item.id));
  return { id: "", jobDescriptionId, skillId: skill?.id || "", targetLevel: 2, weight: 10, critical: false, relevance: 70, rationale: "", evidence: [], strategicVectorIds: [], source: "manual", status: "proposed" };
}

function buildEnrichedDescription(job: JobDescription, mappings: SkillWorkspace["mappings"], workspace: SkillWorkspace) {
  const active = mappings.filter((item) => item.status !== "rejected").slice(0, 10);
  const lines = active.map((item) => { const skill = workspace.skills.find((value) => value.id === item.skillId); const level = proficiencyLevels.find((value) => value.id === item.targetLevel); return skill ? `• ${skill.name} — ${level?.name || `Level ${item.targetLevel}`}${item.critical ? " (critical)" : ""}` : ""; }).filter(Boolean);
  const vectorIds = [...new Set(active.flatMap((item) => item.strategicVectorIds))];
  const vectorLines = vectorIds.map((id) => workspace.strategicVectors.find((item) => item.id === id)).filter(Boolean).map((vector) => `• ${vector!.name}: ${vector!.description}`);
  return `${job.title}\n\nPurpose\n${job.purpose}\n\nCore responsibilities\n${job.responsibilities.map((item) => `• ${item}`).join("\n")}\n\nRequired skill profile\n${lines.join("\n") || "• Pending governed mapping"}\n\nStrategic capability vectors\n${vectorLines.join("\n") || "• No strategic uplift applied"}`;
}

function MappingEditor({ mapping, workspace, mappings, onClose, onSave }: { mapping: JobSkillMapping; workspace: SkillWorkspace; mappings: JobSkillMapping[]; onClose: () => void; onSave: (mapping: JobSkillMapping) => void }) {
  const [value, setValue] = useState(mapping);
  const set = <K extends keyof JobSkillMapping>(key: K, next: JobSkillMapping[K]) => setValue((current) => ({ ...current, [key]: next }));
  const available = workspace.skills.filter((skill) => skill.status === "approved" && (skill.id === value.skillId || !mappings.some((item) => item.skillId === skill.id)));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal mapping-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(value); }}><header><div><span className="section-kicker">GOVERNED MAPPING</span><h2>{mapping.id ? "Edit skill mapping" : "Add catalog skill"}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><label><span>Approved catalog skill</span><select required value={value.skillId} onChange={(event) => set("skillId", event.target.value)}><option value="">Select skill</option>{available.map((skill) => <option value={skill.id} key={skill.id}>{skill.name}</option>)}</select></label><label><span>Mapping rationale</span><textarea required value={value.rationale} onChange={(event) => set("rationale", event.target.value)} placeholder="Why is this durable capability required for the role?"/></label><label><span>Job-description evidence</span><textarea required value={value.evidence.join("\n")} onChange={(event) => set("evidence", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} placeholder="Paste one exact responsibility or outcome per line."/></label><div className="form-row"><label><span>Target proficiency</span><select value={value.targetLevel} onChange={(event) => set("targetLevel", Number(event.target.value) as 1 | 2 | 3 | 4)}>{proficiencyLevels.map((level) => <option value={level.id} key={level.id}>{level.id} · {level.name}</option>)}</select></label><label><span>Profile weight (%)</span><input type="number" min="0" max="100" required value={value.weight} onChange={(event) => set("weight", Number(event.target.value))}/></label></div><div className="form-row"><label><span>Evidence fit (%)</span><input type="number" min="0" max="100" required value={value.relevance} onChange={(event) => set("relevance", Number(event.target.value))}/></label><label className="inline-check"><input type="checkbox" checked={value.critical} onChange={(event) => set("critical", event.target.checked)}/><span>Critical skill for this role</span></label></div><fieldset className="skill-checkboxes"><legend>Strategic uplift</legend>{workspace.strategicVectors.filter((vector) => vector.status === "approved").map((vector) => <label key={vector.id}><input type="checkbox" checked={value.strategicVectorIds.includes(vector.id)} onChange={() => set("strategicVectorIds", value.strategicVectorIds.includes(vector.id) ? value.strategicVectorIds.filter((id) => id !== vector.id) : [...value.strategicVectorIds, vector.id])}/><span>{vector.name}</span></label>)}</fieldset><p className="mapping-help">Strategic vectors enrich an evidence-based mapping; they cannot substitute for current role evidence.</p><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Save mapping</button></footer></form></div>;
}

function JobEditor({ job, onClose, onSave }: { job: JobDescription; onClose: () => void; onSave: (job: JobDescription) => void }) {
  const [value, setValue] = useState(job); const set = (key: keyof JobDescription, next: string) => setValue((current) => ({ ...current, [key]: next }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal job-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(value); }}><header><div><span className="section-kicker">JOB DESCRIPTION</span><h2>{job.id ? `Edit ${job.title}` : "Create job description"}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="form-row"><label><span>Job title</span><input required value={value.title} onChange={(event) => set("title", event.target.value)}/></label><label><span>Job family</span><input required value={value.jobFamily} onChange={(event) => set("jobFamily", event.target.value)}/></label></div><div className="form-row"><label><span>Country / scope</span><input value={value.country} onChange={(event) => set("country", event.target.value)}/></label><label><span>Language</span><select value={value.language} onChange={(event) => set("language", event.target.value)}><option>English</option><option>German</option></select></label></div><label><span>Role purpose</span><textarea required value={value.purpose} onChange={(event) => set("purpose", event.target.value)}/></label><label><span>Full job description</span><textarea className="large-textarea" required value={value.sourceText} onChange={(event) => set("sourceText", event.target.value)} placeholder="Paste responsibilities, outcomes, decision scope, tools, methods and context…"/></label><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Save job description</button></footer></form></div>;
}
