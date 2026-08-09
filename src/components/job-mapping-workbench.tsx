"use client";

import { useState } from "react";
import { Icons } from "./icons";
import { governedIdempotencyKey, ingestJobDescription, runJobClarification, runJobMapping } from "@/lib/skill-client";
import { decideReview, impactAnalysis, mappingCalibrationSummary, recalculateMapping, recordGovernedVersion, recordMappingFeedback } from "@/lib/skill-governance";
import { proficiencyLevels, type JobDescription, type JobSkillMapping, type MappingFeedback, type MappingScoreBreakdown, type SkillWorkspace } from "@/lib/skill-schema";

type Props = {
  workspace: SkillWorkspace;
  approvedWorkspace?: SkillWorkspace | null;
  secret: string;
  mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void;
  onWorkspace: (workspace: SkillWorkspace) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

const emptyJob = (): JobDescription => ({ id: "", title: "", jobFamily: "", country: "Global", language: "English", purpose: "", sourceText: "", responsibilities: [], outcomes: [], activities: [], tools: [], qualifications: [], context: [], constraints: [], evidenceSegments: [], sourceFiles: [], intakeFindings: [], status: "draft", version: 1, updatedAt: new Date().toISOString() });
const scoreFields: Array<keyof MappingScoreBreakdown> = ["semanticRelevance", "directEvidenceStrength", "responsibilityCoverage", "outcomeRelevance", "taxonomyCompatibility", "granularityCompatibility", "kflaCompatibility", "controlledToolRelevance", "proficiencyCompatibility", "approvedMappingSimilarity", "duplicatePenalty", "contradictionPenalty", "missingEvidencePenalty"];
const titleScore = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

export function JobMappingWorkbench({ workspace, approvedWorkspace, secret, mutate, onWorkspace, onMessage, onError }: Props) {
  const activeJobs = workspace.jobDescriptions.filter((item) => item.status !== "archived");
  const [selected, setSelected] = useState(activeJobs[0]?.id || "");
  const [editing, setEditing] = useState<JobDescription | "new" | null>(null);
  const [editingMapping, setEditingMapping] = useState<JobSkillMapping | "new" | null>(null);
  const [feedbackMapping, setFeedbackMapping] = useState<JobSkillMapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const [archiveActor, setArchiveActor] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState("");
  const [mappingRunKey, setMappingRunKey] = useState("");
  const job = activeJobs.find((item) => item.id === selected) || activeJobs[0];
  const mappings = workspace.mappings.filter((item) => item.jobDescriptionId === job?.id && item.status !== "rejected").sort((a, b) => b.relevance - a.relevance);
  const calibration = mappingCalibrationSummary(workspace);

  function saveJob(record: JobDescription, actor: string, reason: string) {
    const now = new Date().toISOString();
    const value = { ...record, id: record.id || `JD-${Date.now()}`, version: record.id ? record.version + 1 : 1, responsibilities: record.sourceText.split(/[.\n]+/).map((item) => item.trim()).filter((item) => item.length > 20), updatedAt: now };
    mutate((current) => recordGovernedVersion({ ...current, jobDescriptions: record.id ? current.jobDescriptions.map((item) => item.id === record.id ? value : item) : [value, ...current.jobDescriptions] }, "job_description", value.id, record.id ? "job.updated" : "job.created", actor.trim(), { ...value, governanceReason: reason.trim() } as unknown as Record<string, unknown>));
    setSelected(value.id); setEditing(null); onMessage(`${value.title} saved as job-description version ${value.version}.`);
  }

  function archiveJob() {
    if (!job) return;
    mutate((current) => recordGovernedVersion({ ...current, jobDescriptions: current.jobDescriptions.map((item) => item.id === job.id ? { ...item, status: "archived" } : item), mappings: current.mappings.map((item) => item.jobDescriptionId === job.id ? { ...item, status: "rejected" } : item) }, "job_description", job.id, "job.archived", archiveActor.trim(), { ...job, governanceReason: archiveReason.trim(), affectedMappings: jobImpact.mappings.length } as unknown as Record<string, unknown>));
    setSelected(""); setImpactOpen(false); setArchiveActor(""); setArchiveReason(""); onMessage(`${job.title} archived with its draft mappings preserved in version history.`);
  }

  async function analyse() {
    if (!job) return;
    setBusy(true); onError("");
    try {
      const idempotencyKey = mappingRunKey || governedIdempotencyKey("skill.map_job", job.id);
      setMappingRunKey(idempotencyKey);
      const failedRun = workspace.agentRuns.find((run) => run.jobDescriptionId === job.id && run.status === "failed");
      const payload = await runJobMapping(secret, job.id, workspace, idempotencyKey, failedRun?.id);
      if (payload.workspace) onWorkspace(payload.workspace);
      setMappingRunKey("");
      onMessage(payload.message || "AI profile proposal added to the governance queue.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "AI job mapping failed."); }
    finally { setBusy(false); }
  }

  function saveMapping(mapping: JobSkillMapping, actor: string, reason: string) {
    if (!job) return;
    const candidate = { ...mapping, id: mapping.id || `MAP-MANUAL-${workspace.mappings.length + 1}`, jobDescriptionId: job.id, source: mapping.id ? mapping.source : "manual" as const, status: mapping.id ? mapping.status : "proposed" as const };
    const value = candidate.overrideReason?.trim() ? candidate : recalculateMapping(candidate, workspace);
    mutate((current) => recordGovernedVersion({ ...current, mappings: mapping.id ? current.mappings.map((item) => item.id === mapping.id ? value : item) : [...current.mappings, value], jobDescriptions: current.jobDescriptions.map((item) => item.id === job.id ? { ...item, status: "mapped" } : item) }, "job_mapping", value.id, mapping.id ? "mapping.updated" : "mapping.created", actor.trim(), { ...value, governanceReason: reason.trim() } as unknown as Record<string, unknown>));
    setEditingMapping(null);
  }

  if (!job) return <div className="empty-state"><Icons.document/><b>No active job descriptions</b><button className="button primary" onClick={() => setIntakeOpen(true)}><Icons.upload/>Ingest job description</button>{intakeOpen && <JobIntakeEditor secret={secret} workspace={workspace} onClose={() => setIntakeOpen(false)} onWorkspace={onWorkspace} onMessage={onMessage} onError={onError}/>}</div>;

  const totalWeight = mappings.filter((item) => item.status !== "deferred").reduce((sum, item) => sum + item.weight, 0);
  const jobImpact = impactAnalysis(workspace, job.id);
  return <div className="mapping-workbench">
    <aside className="panel job-list"><header><div><span className="section-kicker">JOB CATALOG</span><h3>{activeJobs.length} descriptions</h3></div><div className="record-actions"><button aria-label="Create job description" onClick={() => setEditing("new")}><Icons.plus/></button><button aria-label="Ingest job description" onClick={() => setIntakeOpen(true)}><Icons.upload/></button></div></header>{activeJobs.map((item) => <button key={item.id} className={item.id === job.id ? "active" : ""} onClick={() => { setSelected(item.id); setSelectedEvidence(""); }}><span><b>{item.title}</b><small>{item.jobFamily} · v{item.version}</small></span><em>{item.status}</em></button>)}</aside>
    <section className="mapping-main">
      <article className="panel job-source"><header><div><span className="section-kicker">TRACEABLE JOB EVIDENCE</span><h3>{job.title}</h3><p>{job.purpose}</p></div><div className="record-actions"><button aria-label={`Edit ${job.title}`} onClick={() => setEditing(job)}><Icons.edit/></button><button aria-label={`Delete ${job.title}`} onClick={() => setImpactOpen(true)}><Icons.trash/></button></div></header><div className="job-meta"><span>{job.jobFamily}</span><span>{job.country}</span><span>{job.language}</span><span>Version {job.version}</span><span>{job.sourceFiles.length} source file(s)</span></div><div className="evidence-split"><div><b>Source text</b><div className="job-source-text">{job.sourceText}</div></div><div><b>Normalized evidence</b><div className="evidence-segments">{job.evidenceSegments.map((segment) => <button key={segment.id} className={segment.id === selectedEvidence ? "active" : ""} onClick={() => setSelectedEvidence(segment.id)}><span>{segment.normalizedType} · {segment.confidence}%</span><b>{segment.normalizedValue}</b><small>{segment.sourceName} · {segment.location}</small></button>)}</div></div></div>{job.intakeFindings.length > 0 && <details><summary>{job.intakeFindings.length} intake quality finding(s)</summary>{job.intakeFindings.map((finding) => <p key={`${finding.code}-${finding.message}`} className={`finding ${finding.severity}`}><b>{finding.code}</b> {finding.message}</p>)}</details>}<footer><span>{job.responsibilities.length} responsibilities</span><span>{job.outcomes.length} outcomes</span><span>{job.activities.length} activities</span><span>{job.tools.length} tools</span></footer></article>
      <JobClarificationPanel workspace={workspace} job={job} secret={secret} onWorkspace={onWorkspace} onMessage={onMessage} onError={onError}/>
      <article className="panel ai-mapping-command"><div className="agent-orb"><Icons.spark/></div><div><span className="section-kicker">AI SKILL DESIGN AGENT</span><h3>Map this job against approved skills and controlled tools</h3><p>The agent uses eleven allowlisted tools, retains evidence and creates drafts only. It cannot approve, publish, delete or access licensed definitions.</p><div className="tool-chips">{workspace.agentTools.filter((tool) => tool.lifecycleStatus === "active").slice(0, 6).map((tool) => <span key={tool.id}>{tool.id}</span>)}</div></div><button className="button primary" disabled={busy} onClick={() => void analyse()}><Icons.spark/>{busy ? "Agent mapping…" : "Run governed mapping"}</button></article>
      <article className="panel mapping-table"><header><div><span className="section-kicker">SKILL PROFILE PROPOSAL</span><h3>{mappings.length} mapped skills</h3></div><div className={totalWeight === 100 ? "weight-valid" : "weight-warning"}>{totalWeight}% allocated</div></header><div className="mapping-head"><span>Catalog skill</span><span>Evidence & rationale</span><span>Level</span><span>Weight</span><span>Fit</span><span/></div>{mappings.map((mapping) => <MappingRow key={mapping.id} mapping={mapping} workspace={workspace} mutate={mutate} selectedEvidence={selectedEvidence} onEvidence={setSelectedEvidence} onEdit={() => setEditingMapping(mapping)} onFeedback={() => setFeedbackMapping(mapping)}/>)}<footer><button className="button secondary" onClick={() => setEditingMapping("new")} disabled={mappings.length >= 10}><Icons.plus/>Add catalog skill</button><span>Every agent proposal requires accountable approval · score model {workspace.framework.mappingScoreVersion}</span></footer></article>
      <MappingGovernanceSummary workspace={workspace} approvedWorkspace={approvedWorkspace} job={job} mutate={mutate}/>
      <article className="panel calibration-panel"><header><div><span className="section-kicker">CONFIDENCE CALIBRATION</span><h3>{calibration.sampleSize} accountable review records</h3></div><b>{calibration.evidenceCompleteness}% evidence completeness</b></header><div className="form-row"><p><b>{calibration.predicted}%</b><small>Mean predicted confidence</small></p><p><b>{calibration.observed}%</b><small>Confirmed by reviewers</small></p><p><b>{calibration.calibrationGap > 0 ? "+" : ""}{calibration.calibrationGap}</b><small>Calibration gap</small></p></div>{calibration.bins.map((bin) => <p key={bin.label}><b>{bin.label}</b><span>{bin.count} reviews · predicted {bin.predicted}% · observed {bin.observed}%</span></p>)}</article>
      <article className="panel enriched-preview"><header><div><span className="section-kicker">UTILIZATION LAYER</span><h3>Job-description enrichment preview</h3></div><button className="button secondary" onClick={() => navigator.clipboard.writeText(buildEnrichedDescription(job, mappings, workspace))}>Copy draft</button></header><pre>{buildEnrichedDescription(job, mappings, workspace)}</pre></article>
    </section>
    {impactOpen && <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); archiveJob(); }}><header><div><span className="section-kicker">CHANGE IMPACT</span><h3>Archive {job.title}?</h3></div><button type="button" aria-label="Close impact analysis" onClick={() => setImpactOpen(false)}><Icons.close/></button></header><p>{jobImpact.mappings.length} mappings, {jobImpact.profiles.length} profiles and {jobImpact.relationships.length} relationships are affected. Records remain recoverable through governed history.</p><label><span>Accountable actor</span><input required value={archiveActor} onChange={(event) => setArchiveActor(event.target.value)}/></label><label><span>Governance reason</span><textarea required value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)}/></label><footer><button type="button" className="button secondary" onClick={() => setImpactOpen(false)}>Cancel</button><button className="button primary">Archive job</button></footer></form></div>}
    {editing && <JobEditor job={editing === "new" ? emptyJob() : editing} onClose={() => setEditing(null)} onSave={saveJob}/>} 
    {intakeOpen && (
      <JobIntakeEditor secret={secret} workspace={workspace} onClose={() => setIntakeOpen(false)} onWorkspace={(next) => { onWorkspace(next); setIntakeOpen(false); }} onMessage={onMessage} onError={onError}/>
    )}
    {editingMapping && <MappingEditor mapping={editingMapping === "new" ? emptyMapping(job.id, workspace, mappings) : editingMapping} workspace={workspace} mappings={mappings} onClose={() => setEditingMapping(null)} onSave={saveMapping}/>}
    {feedbackMapping && <MappingFeedbackEditor
      mapping={feedbackMapping}
      onClose={() => setFeedbackMapping(null)}
      onSave={(value) => {
        try {
          mutate((current) => recordMappingFeedback(current, value));
          setFeedbackMapping(null);
          onMessage("Accountable mapping feedback recorded. Mapping approval status was not changed.");
        } catch (reason) {
          onError(reason instanceof Error ? reason.message : "Mapping feedback could not be recorded.");
        }
      }}
    />}
  </div>;
}

function JobIntakeEditor({ secret, workspace, onClose, onWorkspace, onMessage, onError }: { secret: string; workspace: SkillWorkspace; onClose: () => void; onWorkspace: (workspace: SkillWorkspace) => void; onMessage: (message: string) => void; onError: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [jobFamily, setJobFamily] = useState("");
  const [country, setCountry] = useState("Global");
  const [language, setLanguage] = useState("English");
  const [dataClassification, setDataClassification] = useState<"public" | "internal" | "confidential">("internal");
  const [sourceText, setSourceText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); onError("");
    try {
      if (files.some((file) => workspace.jobDescriptions.some((job) => job.sourceFiles.some((source) => source.name === file.name && source.size === file.size)))) throw new Error("A source file with the same name and size is already governed. Review the existing job before re-ingesting it.");
      const payload = await ingestJobDescription(secret, files, sourceText, { title, jobFamily, country, language, dataClassification });
      if (!payload.workspace) throw new Error("The intake workflow returned no governed working state.");
      onWorkspace(payload.workspace); onMessage(payload.message || "Job evidence normalized and saved as a draft. Review its traceability before mapping.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "Job intake failed."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal job-intake-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void submit(); }}><header><div><span className="section-kicker">GOVERNED JOB INTAKE</span><h2>Normalize job evidence</h2></div><button type="button" onClick={onClose}><Icons.close/></button></header><p className="helper-text">The agent may normalize and flag evidence, but saves drafts only. Human approval remains mandatory.</p><div className="form-row"><label><span>Job title</span><input required value={title} onChange={(event) => setTitle(event.target.value)}/></label><label><span>Job family</span><input required value={jobFamily} onChange={(event) => setJobFamily(event.target.value)}/></label></div><div className="form-row"><label><span>Country / scope</span><input value={country} onChange={(event) => setCountry(event.target.value)}/></label><label><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>English</option><option>German</option></select></label><label><span>Data classification</span><select value={dataClassification} onChange={(event) => setDataClassification(event.target.value as typeof dataClassification)}><option value="public">Public</option><option value="internal">Internal</option><option value="confidential">Confidential</option></select></label></div><label><span>Paste job description</span><textarea className="large-textarea" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Purpose, responsibilities, outcomes, activities, tools, qualifications, context and constraints…"/></label><label className="skill-drop"><Icons.upload/><b>Add governed sources</b><span>DOCX, PDF, JSON, text, CSV, XLSX or image · max 20 files / 29 MB</span><input aria-label="Job description files" type="file" multiple accept=".docx,.pdf,.json,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg" onChange={(event) => setFiles(Array.from(event.target.files || []))}/><small>{files.length ? files.map((file) => file.name).join(" · ") : "No files selected"}</small></label><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || (!sourceText.trim() && !files.length)}><Icons.spark/>{busy ? "Normalizing…" : "Ingest and normalize"}</button></footer></form></div>;
}

function JobClarificationPanel({ workspace, job, secret, onWorkspace, onMessage, onError }: { workspace: SkillWorkspace; job: JobDescription; secret: string; onWorkspace: (workspace: SkillWorkspace) => void; onMessage: (message: string) => void; onError: (message: string) => void }) {
  const session = workspace.jobClarifications.find((item) => item.jobDescriptionId === job.id);
  const question = session?.questions.find((item) => item.status === "open");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: "start" | "answer" | "skip") {
    setBusy(true); onError("");
    try {
      const payload = await runJobClarification(secret, { jobDescriptionId: job.id, action, questionId: question?.id, answer, idempotencyKey: governedIdempotencyKey(`skill.clarify_job.${action}`, job.id), workspace });
      if (payload.workspace) onWorkspace(payload.workspace);
      setAnswer(""); onMessage(payload.message || "Clarification progress saved with governed evidence traceability.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "Job clarification failed."); }
    finally { setBusy(false); }
  }
  const answered = session?.questions.filter((item) => item.status === "answered").length || 0;
  const total = session?.questions.length || 5;
  return <article className="panel clarification-panel"><header><div><span className="section-kicker">SAVE / RESUME CLARIFICATION</span><h3>Outcome, critical incident, autonomy, complexity and level</h3></div><b>{answered}/{total}</b></header>{!session ? <div><p>Start a job-specific, evidence-seeking agent interview before mapping.</p><button className="button primary" disabled={busy} onClick={() => void act("start")}><Icons.spark/>Start clarification</button></div> : question ? <div><span className="progress-track"><i style={{ width: `${Math.round(answered / total * 100)}%` }}/></span><small>{question.dimension.replaceAll("_", " ")} · {question.rationale}</small><h4>{question.question}</h4><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Provide a concrete example and observable evidence…"/><div className="record-actions"><button className="button secondary" disabled={busy} onClick={() => void act("skip")}>Defer question</button><button className="button primary" disabled={busy || !answer.trim()} onClick={() => void act("answer")}>Save answer and continue</button></div></div> : <p>Clarification complete. All answers are stored as governed evidence records.</p>}</article>;
}

function MappingGovernanceSummary({ workspace, approvedWorkspace, job, mutate }: { workspace: SkillWorkspace; approvedWorkspace?: SkillWorkspace | null; job: JobDescription; mutate: Props["mutate"] }) {
  const omissions = workspace.mappingOmissions.filter((item) => item.jobDescriptionId === job.id && item.status !== "superseded");
  const current = workspace.mappings.filter((item) => item.jobDescriptionId === job.id && item.status !== "rejected");
  const approved = approvedWorkspace?.mappings.filter((item) => item.jobDescriptionId === job.id && item.status === "approved") || [];
  const proposedSkillIds = new Set(current.map((item) => item.skillId));
  const approvedSkillIds = new Set(approved.map((item) => item.skillId));
  const additions = current.filter((item) => !approvedSkillIds.has(item.skillId));
  const removals = approved.filter((item) => !proposedSkillIds.has(item.skillId));
  const reviewItems = workspace.reviewQueue.filter((item) => item.status === "pending" && item.type === "mapping" && current.some((mapping) => mapping.id === item.entityId));
  const totalWeight = current.filter((item) => !["deferred", "rejected"].includes(item.status)).reduce((sum, item) => sum + item.weight, 0);
  const approvedLinks = current.filter((item) => item.status === "approved").length;
  return <article className="panel mapping-governance"><header><div><span className="section-kicker">GOVERNANCE & PROFILE COMPOSITION</span><h3>Proposed versus approved baseline</h3></div><b>{reviewItems.length} review(s) pending</b></header><div className="mapping-diagnostics"><span><b>{totalWeight}%</b><small>profile weight {totalWeight === 100 ? "valid" : "needs adjustment"}</small></span><span><b>{approvedLinks}/{current.length}</b><small>approved mapping links</small></span><span><b>+{additions.length} / −{removals.length}</b><small>changes vs approved</small></span><span><b>{omissions.length}</b><small>explained omissions</small></span></div>{omissions.length > 0 && <details open><summary>Why candidate skills were omitted</summary>{omissions.map((item) => <p key={item.id}><b>{workspace.skills.find((skill) => skill.id === item.skillId)?.name || item.skillId}</b><span>{item.reason}</span><small>Evidence: {item.evidenceRefs.join(" · ")} · score {item.score ?? "n/a"}</small></p>)}</details>}{reviewItems.length > 0 && <div className="inline-review-list">{reviewItems.map((review) => <div key={review.id}><span><b>{review.title}</b><small>{review.summary}</small></span>{(["accepted", "deferred", "rejected"] as const).map((decision) => <button key={decision} onClick={() => { const actor = window.prompt("Accountable reviewer name"); const reason = window.prompt(`Evidence-based reason to mark this mapping ${decision}`); if (actor?.trim() && reason?.trim()) mutate((state) => decideReview(state, review.id, decision, actor, reason)); }}>{decision === "accepted" ? "approve" : decision}</button>)}</div>)}</div>}<p className="helper-text">Only approved mappings and profiles can enter an approved JSON release. Unapproved, rejected and deferred links remain visible here and are excluded from publication.</p></article>;
}

function MappingRow({ mapping, workspace, mutate, selectedEvidence, onEvidence, onEdit, onFeedback }: { mapping: JobSkillMapping; workspace: SkillWorkspace; mutate: Props["mutate"]; selectedEvidence: string; onEvidence: (id: string) => void; onEdit: () => void; onFeedback: () => void }) {
  const [inlineChange, setInlineChange] = useState<{ next: JobSkillMapping; action: string; actor: string; reason: string } | null>(null);
  const skill = workspace.skills.find((item) => item.id === mapping.skillId);
  if (!skill) return null;
  const vectors = mapping.strategicVectorIds.map((id) => workspace.strategicVectors.find((item) => item.id === id)?.name).filter(Boolean);
  const tools = (mapping.toolIds || []).map((id) => workspace.tools.find((item) => item.id === id)?.name).filter(Boolean);
  if (inlineChange) return <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); mutate((current) => recordGovernedVersion({ ...current, mappings: current.mappings.map((item) => item.id === mapping.id ? inlineChange.next : item) }, "job_mapping", mapping.id, inlineChange.action, inlineChange.actor.trim(), { ...inlineChange.next, governanceReason: inlineChange.reason.trim() } as unknown as Record<string, unknown>)); setInlineChange(null); }}><header><div><span className="section-kicker">ACCOUNTABLE MAPPING CHANGE</span><h3>{inlineChange.action.replaceAll("_", " ")}</h3></div><button type="button" onClick={() => setInlineChange(null)}><Icons.close/></button></header><p>{skill.name} remains versioned; removal is a soft rejection and never deletes mapping history.</p><label><span>Accountable actor</span><input required value={inlineChange.actor} onChange={(event) => setInlineChange({ ...inlineChange, actor: event.target.value })}/></label><label><span>Governance reason</span><textarea required value={inlineChange.reason} onChange={(event) => setInlineChange({ ...inlineChange, reason: event.target.value })}/></label><footer><button type="button" className="button secondary" onClick={() => setInlineChange(null)}>Cancel</button><button className="button primary">Apply mapping change</button></footer></form></div>;
  const scoreEntries = Object.entries(mapping.scoreBreakdown || {});
  return <div className="mapping-row"><span><i className={`dimension-dot ${skill.dimension}`}/><b>{skill.name}</b><small>{skill.dimension} · {mapping.critical ? "critical" : "supporting"}</small>{vectors.length > 0 && <em>{vectors.join(" · ")}</em>}{tools.length > 0 && <em>Tools: {tools.join(" · ")}</em>}</span><span><b>{mapping.rationale}</b><small>{mapping.evidence[0] || "Reviewer evidence required"}</small>{Boolean(mapping.evidenceRefs?.length) && <span className="evidence-ref-list">{mapping.evidenceRefs!.map((id) => <button type="button" className={selectedEvidence === id ? "active" : ""} key={id} onClick={() => onEvidence(id)}>{id}</button>)}</span>} {mapping.scoreBreakdown && <details className="score-composition"><summary>13-part score · {mapping.scoreVersion}</summary>{scoreEntries.map(([key, value]) => <span key={key} className={key.endsWith("Penalty") ? "penalty" : "contribution"}><i>{titleScore(key)}</i><b>{key.endsWith("Penalty") ? "−" : "+"}{value}</b></span>)}</details>}{mapping.overrideReason && <em>Override: {mapping.overrideReason}</em>}{mapping.reviewerFeedback && <em>Review: {mapping.reviewerFeedback}</em>}</span><select aria-label={`${skill.name} mapped level`} value={mapping.targetLevel} onChange={(event) => setInlineChange({ next: { ...mapping, targetLevel: Number(event.target.value) as 1 | 2 | 3 | 4 }, action: "mapping.level_changed", actor: "", reason: "" })}>{proficiencyLevels.map((level) => <option value={level.id} key={level.id}>{level.id} · {level.name}</option>)}</select><input aria-label={`${skill.name} mapping weight`} type="number" min="0" max="100" value={mapping.weight} onChange={(event) => setInlineChange({ next: { ...mapping, weight: Number(event.target.value) }, action: "mapping.weight_changed", actor: "", reason: "" })}/><span className="fit-score"><b>{mapping.relevance}%</b><small>{mapping.status}</small><em>{mapping.confidence ?? mapping.relevance}% confidence</em><em>{mapping.evidenceCompleteness ?? "—"}% evidence</em></span><span className="record-actions"><button aria-label={`Record feedback for ${skill.name}`} onClick={onFeedback}>Review</button><button aria-label={`Edit ${skill.name} mapping`} onClick={onEdit}><Icons.edit/></button><button aria-label={`Remove ${skill.name} mapping`} onClick={() => setInlineChange({ next: { ...mapping, status: "rejected" }, action: "mapping.rejected", actor: "", reason: "" })}><Icons.trash/></button></span></div>;
}

function MappingFeedbackEditor({ mapping, onClose, onSave }: { mapping: JobSkillMapping; onClose: () => void; onSave: (value: Pick<MappingFeedback, "mappingId" | "decision" | "reviewer" | "reason"> & { confidenceAfter?: number }) => void }) {
  const [decision, setDecision] = useState<MappingFeedback["decision"]>("confirmed");
  const [reviewer, setReviewer] = useState("");
  const [reason, setReason] = useState("");
  const [confidenceAfter, setConfidenceAfter] = useState(mapping.confidence ?? mapping.relevance);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave({ mappingId: mapping.id, decision, reviewer, reason, confidenceAfter: decision === "adjusted" ? confidenceAfter : undefined }); }}><header><div><span className="section-kicker">ACCOUNTABLE REVIEW</span><h2>Record mapping feedback</h2></div><button type="button" onClick={onClose}><Icons.close/></button></header><div className="form-row"><label><span>Decision</span><select value={decision} onChange={(event) => setDecision(event.target.value as MappingFeedback["decision"])}>{["confirmed", "adjusted", "rejected", "needs_evidence"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Reviewer</span><input required value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Accountable reviewer name"/></label></div>{decision === "adjusted" && <label><span>Calibrated confidence (%)</span><input type="number" min="0" max="100" required value={confidenceAfter} onChange={(event) => setConfidenceAfter(Number(event.target.value))}/></label>}<label><span>Evidence-based reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this mapping confirmed, adjusted, rejected or missing evidence?"/></label><p className="helper-text">This records feedback and calibration history only. It does not approve or publish the mapping.</p><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Record feedback</button></footer></form></div>;
}

function emptyMapping(jobDescriptionId: string, workspace: SkillWorkspace, mappings: JobSkillMapping[]): JobSkillMapping {
  const skill = workspace.skills.find((item) => item.status === "approved" && !mappings.some((mapping) => mapping.skillId === item.id));
  const scoreBreakdown = Object.fromEntries(scoreFields.map((field) => [field, field.endsWith("Penalty") ? 0 : 70])) as unknown as MappingScoreBreakdown;
  return { id: "", jobDescriptionId, skillId: skill?.id || "", targetLevel: 2, weight: 10, critical: false, relevance: 70, confidence: 70, rationale: "", evidence: [], strategicVectorIds: [], toolIds: [], scoreBreakdown, scoreVersion: workspace.framework.mappingScoreVersion, source: "manual", status: "proposed" };
}

function buildEnrichedDescription(job: JobDescription, mappings: SkillWorkspace["mappings"], workspace: SkillWorkspace) {
  const active = mappings.filter((item) => item.status !== "rejected" && item.status !== "deferred").slice(0, 10);
  const lines = active.map((item) => { const skill = workspace.skills.find((value) => value.id === item.skillId); const level = proficiencyLevels.find((value) => value.id === item.targetLevel); return skill ? `• ${skill.name} — ${level?.name || `Level ${item.targetLevel}`}${item.critical ? " (critical)" : ""}` : ""; }).filter(Boolean);
  const vectorIds = [...new Set(active.flatMap((item) => item.strategicVectorIds))];
  const vectorLines = vectorIds.map((id) => workspace.strategicVectors.find((item) => item.id === id)).filter(Boolean).map((vector) => `• ${vector!.name}: ${vector!.description}`);
  return `${job.title}\n\nPurpose\n${job.purpose}\n\nCore responsibilities\n${job.responsibilities.map((item) => `• ${item}`).join("\n")}\n\nRequired skill profile\n${lines.join("\n") || "• Pending governed mapping"}\n\nStrategic capability vectors\n${vectorLines.join("\n") || "• No strategic uplift applied"}`;
}

function MappingEditor({ mapping, workspace, mappings, onClose, onSave }: { mapping: JobSkillMapping; workspace: SkillWorkspace; mappings: JobSkillMapping[]; onClose: () => void; onSave: (mapping: JobSkillMapping, actor: string, reason: string) => void }) {
  const [value, setValue] = useState(mapping);
  const [actor, setActor] = useState(""); const [reason, setReason] = useState("");
  const set = <K extends keyof JobSkillMapping>(key: K, next: JobSkillMapping[K]) => setValue((current) => ({ ...current, [key]: next }));
  const available = workspace.skills.filter((skill) => skill.status === "approved" && (skill.id === value.skillId || !mappings.some((item) => item.skillId === skill.id)));
  const setScore = (key: keyof MappingScoreBreakdown, next: number) => set("scoreBreakdown", { ...value.scoreBreakdown!, [key]: next });
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal mapping-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(value, actor, reason); }}><header><div><span className="section-kicker">GOVERNED MAPPING</span><h2>{mapping.id ? "Edit skill mapping" : "Add catalog skill"}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><label><span>Approved catalog skill</span><select required value={value.skillId} onChange={(event) => set("skillId", event.target.value)}><option value="">Select skill</option>{available.map((skill) => <option value={skill.id} key={skill.id}>{skill.name}</option>)}</select></label><label><span>Mapping rationale</span><textarea required value={value.rationale} onChange={(event) => set("rationale", event.target.value)} placeholder="Why is this durable capability required for the role?"/></label><label><span>Job-description evidence</span><textarea required value={value.evidence.join("\n")} onChange={(event) => set("evidence", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} placeholder="Paste one exact responsibility or outcome per line."/></label><div className="form-row"><label><span>Target proficiency</span><select value={value.targetLevel} onChange={(event) => set("targetLevel", Number(event.target.value) as 1 | 2 | 3 | 4)}>{proficiencyLevels.map((level) => <option value={level.id} key={level.id}>{level.id} · {level.name}</option>)}</select></label><label><span>Profile weight (%)</span><input type="number" min="0" max="100" required value={value.weight} onChange={(event) => set("weight", Number(event.target.value))}/></label></div><details className="score-editor"><summary>Transparent 13-part score</summary><div className="score-field-grid">{scoreFields.map((field) => <label key={field}><span>{titleScore(field)}</span><input aria-label={titleScore(field)} type="number" min="0" max="100" value={value.scoreBreakdown?.[field] || 0} onChange={(event) => setScore(field, Number(event.target.value))}/></label>)}</div></details><label><span>Reviewer override reason (required only when overriding calculated fit)</span><textarea value={value.overrideReason || ""} onChange={(event) => set("overrideReason", event.target.value)} placeholder="Leave blank to use the calculated score."/></label><label className="inline-check"><input type="checkbox" checked={value.critical} onChange={(event) => set("critical", event.target.checked)}/><span>Critical skill for this role</span></label><fieldset className="skill-checkboxes"><legend>Controlled tools and methods</legend>{workspace.tools.filter((tool) => tool.status === "approved").map((tool) => <label key={tool.id}><input type="checkbox" checked={(value.toolIds || []).includes(tool.id)} onChange={() => set("toolIds", (value.toolIds || []).includes(tool.id) ? (value.toolIds || []).filter((id) => id !== tool.id) : [...(value.toolIds || []), tool.id])}/><span>{tool.name}</span></label>)}</fieldset><fieldset className="skill-checkboxes"><legend>Strategic uplift</legend>{workspace.strategicVectors.filter((vector) => vector.status === "approved").map((vector) => <label key={vector.id}><input type="checkbox" checked={value.strategicVectorIds.includes(vector.id)} onChange={() => set("strategicVectorIds", value.strategicVectorIds.includes(vector.id) ? value.strategicVectorIds.filter((id) => id !== vector.id) : [...value.strategicVectorIds, vector.id])}/><span>{vector.name}</span></label>)}</fieldset><div className="form-row"><label><span>Accountable actor</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Governance reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)}/></label></div><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Save mapping</button></footer></form></div>;
}

function JobEditor({ job, onClose, onSave }: { job: JobDescription; onClose: () => void; onSave: (job: JobDescription, actor: string, reason: string) => void }) {
  const [value, setValue] = useState(job); const [actor, setActor] = useState(""); const [reason, setReason] = useState(""); const set = (key: keyof JobDescription, next: string) => setValue((current) => ({ ...current, [key]: next }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal job-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(value, actor, reason); }}><header><div><span className="section-kicker">JOB DESCRIPTION</span><h2>{job.id ? `Edit ${job.title}` : "Create job description"}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="form-row"><label><span>Job title</span><input required value={value.title} onChange={(event) => set("title", event.target.value)}/></label><label><span>Job family</span><input required value={value.jobFamily} onChange={(event) => set("jobFamily", event.target.value)}/></label></div><div className="form-row"><label><span>Country / scope</span><input value={value.country} onChange={(event) => set("country", event.target.value)}/></label><label><span>Language</span><select value={value.language} onChange={(event) => set("language", event.target.value)}><option>English</option><option>German</option></select></label></div><label><span>Role purpose</span><textarea required value={value.purpose} onChange={(event) => set("purpose", event.target.value)}/></label><label><span>Full job description</span><textarea className="large-textarea" required value={value.sourceText} onChange={(event) => set("sourceText", event.target.value)} placeholder="Paste responsibilities, outcomes, decision scope, tools, methods and context…"/></label><div className="form-row"><label><span>Accountable actor</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Governance reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)}/></label></div><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Save job description</button></footer></form></div>;
}
