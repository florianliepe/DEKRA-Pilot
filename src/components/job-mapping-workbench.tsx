"use client";

import { useMemo, useState } from "react";
import { Icons } from "./icons";
import { runJobMapping } from "@/lib/skill-client";
import { proficiencyLevels, type JobDescription, type SkillWorkspace } from "@/lib/skill-schema";

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

  function addManualMapping() {
    if (!job) return;
    const skill = workspace.skills.find((item) => item.status === "approved" && !mappings.some((mapping) => mapping.skillId === item.id));
    if (!skill) return;
    mutate((current) => ({ ...current, mappings: [...current.mappings, { id: `MAP-${Date.now()}`, jobDescriptionId: job.id, skillId: skill.id, targetLevel: 2, weight: 10, critical: false, relevance: 70, rationale: "Manual mapping pending reviewer rationale.", evidence: [], strategicVectorIds: [], source: "manual", status: "proposed" }] }));
  }

  if (!job) return <div className="empty-state"><Icons.document/><b>No job descriptions yet</b><button className="button primary" onClick={() => setEditing("new")}><Icons.plus/>Create job description</button>{editing && <JobEditor job={emptyJob()} onClose={() => setEditing(null)} onSave={saveJob}/>}</div>;

  const totalWeight = mappings.filter((item) => item.status !== "rejected").reduce((sum, item) => sum + item.weight, 0);
  return <div className="mapping-workbench">
    <aside className="panel job-list"><header><div><span className="section-kicker">JOB CATALOG</span><h3>{workspace.jobDescriptions.length} descriptions</h3></div><button aria-label="Create job description" onClick={() => setEditing("new")}><Icons.plus/></button></header>{workspace.jobDescriptions.map((item) => <button key={item.id} className={item.id === job.id ? "active" : ""} onClick={() => setSelected(item.id)}><span><b>{item.title}</b><small>{item.jobFamily} · v{item.version}</small></span><em>{item.status}</em></button>)}</aside>
    <section className="mapping-main">
      <article className="panel job-source"><header><div><span className="section-kicker">SOURCE OF TRUTH</span><h3>{job.title}</h3><p>{job.purpose}</p></div><div className="record-actions"><button aria-label={`Edit ${job.title}`} onClick={() => setEditing(job)}><Icons.edit/></button><button aria-label={`Delete ${job.title}`} onClick={deleteJob}><Icons.trash/></button></div></header><div className="job-meta"><span>{job.jobFamily}</span><span>{job.country}</span><span>{job.language}</span><span>Version {job.version}</span></div><div className="job-source-text">{job.sourceText}</div><footer><span>{job.responsibilities.length} responsibility statements</span><span>{job.outcomes.length} outcomes</span></footer></article>
      <article className="panel ai-mapping-command"><div className="agent-orb"><Icons.spark/></div><div><span className="section-kicker">AI SKILL DESIGN AGENT</span><h3>Map this job against the approved catalog</h3><p>The agent can read taxonomy, find duplicates, propose mappings and draft a profile. It cannot approve or delete records.</p><div className="tool-chips">{["read_catalog", "find_duplicates", "map_job_skills", "propose_profile"].map((tool) => <span key={tool}>{tool}</span>)}</div></div><button className="button primary" disabled={busy} onClick={() => void analyse()}><Icons.spark/>{busy ? "Agent mapping…" : "Run governed mapping"}</button></article>
      <article className="panel mapping-table"><header><div><span className="section-kicker">SKILL PROFILE PROPOSAL</span><h3>{mappings.length} mapped skills</h3></div><div className={totalWeight === 100 ? "weight-valid" : "weight-warning"}>{totalWeight}% allocated</div></header><div className="mapping-head"><span>Catalog skill</span><span>Evidence & rationale</span><span>Level</span><span>Weight</span><span>Fit</span><span/></div>{mappings.map((mapping) => { const skill = workspace.skills.find((item) => item.id === mapping.skillId); if (!skill) return null; return <div className="mapping-row" key={mapping.id}><span><i className={`dimension-dot ${skill.dimension}`}/><b>{skill.name}</b><small>{skill.dimension} · {mapping.critical ? "critical" : "supporting"}</small></span><span><b>{mapping.rationale}</b><small>{mapping.evidence[0] || "Reviewer evidence required"}</small></span><select aria-label={`${skill.name} mapped level`} value={mapping.targetLevel} onChange={(event) => mutate((current) => ({ ...current, mappings: current.mappings.map((item) => item.id === mapping.id ? { ...item, targetLevel: Number(event.target.value) as 1 | 2 | 3 | 4 } : item) }))}>{proficiencyLevels.map((level) => <option value={level.id} key={level.id}>{level.id} · {level.name}</option>)}</select><input aria-label={`${skill.name} mapping weight`} type="number" min="0" max="100" value={mapping.weight} onChange={(event) => mutate((current) => ({ ...current, mappings: current.mappings.map((item) => item.id === mapping.id ? { ...item, weight: Number(event.target.value) } : item) }))}/><span className="fit-score"><b>{mapping.relevance}%</b><small>{mapping.status}</small></span><button aria-label={`Remove ${skill.name} mapping`} onClick={() => mutate((current) => ({ ...current, mappings: current.mappings.filter((item) => item.id !== mapping.id) }))}><Icons.trash/></button></div>; })}<footer><button className="button secondary" onClick={addManualMapping}><Icons.plus/>Add catalog skill</button><span>Maximum 10 core skills per pilot role · agent proposals require approval</span></footer></article>
      <article className="panel enriched-preview"><header><div><span className="section-kicker">UTILIZATION LAYER</span><h3>Job-description enrichment preview</h3></div><button className="button secondary" onClick={() => navigator.clipboard.writeText(buildEnrichedDescription(job, mappings, workspace))}>Copy draft</button></header><pre>{buildEnrichedDescription(job, mappings, workspace)}</pre></article>
    </section>
    {editing && <JobEditor job={editing === "new" ? emptyJob() : editing} onClose={() => setEditing(null)} onSave={saveJob}/>} 
  </div>;
}

function buildEnrichedDescription(job: JobDescription, mappings: SkillWorkspace["mappings"], workspace: SkillWorkspace) {
  const lines = mappings.filter((item) => item.status !== "rejected").slice(0, 10).map((item) => { const skill = workspace.skills.find((value) => value.id === item.skillId); const level = proficiencyLevels.find((value) => value.id === item.targetLevel); return skill ? `• ${skill.name} — ${level?.name || `Level ${item.targetLevel}`}${item.critical ? " (critical)" : ""}` : ""; }).filter(Boolean);
  return `${job.title}\n\nPurpose\n${job.purpose}\n\nCore responsibilities\n${job.responsibilities.map((item) => `• ${item}`).join("\n")}\n\nRequired skill profile\n${lines.join("\n") || "• Pending governed mapping"}`;
}

function JobEditor({ job, onClose, onSave }: { job: JobDescription; onClose: () => void; onSave: (job: JobDescription) => void }) {
  const [value, setValue] = useState(job); const set = (key: keyof JobDescription, next: string) => setValue((current) => ({ ...current, [key]: next }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal job-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(value); }}><header><div><span className="section-kicker">JOB DESCRIPTION</span><h2>{job.id ? `Edit ${job.title}` : "Create job description"}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="form-row"><label><span>Job title</span><input required value={value.title} onChange={(event) => set("title", event.target.value)}/></label><label><span>Job family</span><input required value={value.jobFamily} onChange={(event) => set("jobFamily", event.target.value)}/></label></div><div className="form-row"><label><span>Country / scope</span><input value={value.country} onChange={(event) => set("country", event.target.value)}/></label><label><span>Language</span><select value={value.language} onChange={(event) => set("language", event.target.value)}><option>English</option><option>German</option></select></label></div><label><span>Role purpose</span><textarea required value={value.purpose} onChange={(event) => set("purpose", event.target.value)}/></label><label><span>Full job description</span><textarea className="large-textarea" required value={value.sourceText} onChange={(event) => set("sourceText", event.target.value)} placeholder="Paste responsibilities, outcomes, decision scope, tools, methods and context…"/></label><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Save job description</button></footer></form></div>;
}
