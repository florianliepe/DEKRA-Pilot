"use client";

import { useEffect, useState } from "react";
import { Icons } from "./icons";
import { bootstrapSkillWorkspace } from "@/lib/skill-fixtures";
import { ingestSkillEvidence, loadSkillWorkspace, publishSkillWorkspace, runSkillInterview, saveSkillWorkspace } from "@/lib/skill-client";
import { migrateSkillWorkspace, profileGuidance, proficiencyLevels, skillQuality, workspaceFindings, type Lifecycle, type Skill, type SkillDimension, type SkillWorkspace } from "@/lib/skill-schema";
import { JobMappingWorkbench } from "./job-mapping-workbench";
import { StrategicVectors } from "./strategic-vectors";
import { AgentRunLog } from "./agent-run-log";
import { TaxonomyStandardWorkbench } from "./taxonomy-standard-workbench";

type Tab = "overview" | "intake" | "library" | "taxonomy" | "jobs" | "profiles" | "vectors" | "review" | "runs";
type SkillDraft = Pick<Skill, "name" | "description" | "groupId" | "dimension" | "kflaCompetencyId" | "observability" | "futureRelevance" | "status"> & { aliases: string; action: string; object: string; outcome: string };

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "intake", label: "Intake & interview" },
  { id: "library", label: "Skill library" }, { id: "taxonomy", label: "Taxonomy" },
  { id: "jobs", label: "Jobs & mapping" }, { id: "profiles", label: "Role profiles" },
  { id: "vectors", label: "Strategic vectors" }, { id: "review", label: "Review queue" }, { id: "runs", label: "Agent runs" },
];
const emptySkill = (groupId: string): SkillDraft => ({ name: "", description: "", groupId, dimension: "technical", kflaCompetencyId: "", aliases: "", observability: "", futureRelevance: "core", status: "draft", action: "", object: "", outcome: "" });
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function SkillDesigner({ workspaceSecret }: { workspaceSecret: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [workspace, setWorkspace] = useState<SkillWorkspace>(bootstrapSkillWorkspace);
  const [sync, setSync] = useState<"connecting" | "live" | "blueprint" | "saving">("connecting");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Skill | "new" | null>(null);

  useEffect(() => {
    let current = true;
    void loadSkillWorkspace(workspaceSecret).then((payload) => {
      if (!current) return;
      if (payload.workspace?.skills && payload.workspace?.kfla) { setWorkspace(migrateSkillWorkspace(payload.workspace, bootstrapSkillWorkspace)); setSync("live"); }
      else setSync("blueprint");
    }).catch(() => { if (current) setSync("blueprint"); });
    return () => { current = false; };
  }, [workspaceSecret]);

  const pending = workspace.reviewQueue.filter((item) => item.status === "pending").length;
  const approved = workspace.skills.filter((skill) => skill.status === "approved").length;
  const evidence = workspace.skills.reduce((sum, skill) => sum + skill.evidence.length, 0);

  function mutate(update: (current: SkillWorkspace) => SkillWorkspace) {
    setWorkspace((current) => ({ ...update(current), updatedAt: new Date().toISOString() }));
    setSync("blueprint");
  }

  async function saveWorkingState() {
    setSync("saving"); setError("");
    try {
      const candidate = { ...workspace, updatedAt: new Date().toISOString(), publication: { ...workspace.publication, state: "working" as const } };
      const payload = await saveSkillWorkspace(workspaceSecret, candidate);
      setWorkspace(payload.workspace || candidate); setSync("live"); setMessage("Working state saved to n8n.");
    } catch (reason) { setSync("blueprint"); setError(reason instanceof Error ? reason.message : "Unable to save the n8n working state."); }
  }

  async function publish() {
    const findings = workspaceFindings(workspace);
    const pendingReviews = workspace.reviewQueue.filter((item) => item.status === "pending");
    if (findings.length || pendingReviews.length) { setError(`Release blocked: resolve ${findings.length} validation finding(s) and ${pendingReviews.length} pending review(s).`); return; }
    const approvedBy = window.prompt("Accountable approver name");
    if (!approvedBy?.trim()) return;
    setSync("saving"); setError("");
    try {
      const payload = await publishSkillWorkspace(workspaceSecret, workspace, approvedBy.trim());
      setWorkspace(payload.workspace || workspace); setSync("live"); setMessage(payload.message || "Approved JSON release committed to GitHub main.");
    } catch (reason) { setSync("blueprint"); setError(reason instanceof Error ? reason.message : "Unable to publish the approved release."); }
  }

  function saveSkill(values: SkillDraft, id?: string) {
    const record: Skill = {
      id: id || `SK-${Date.now().toString().slice(-6)}`, name: values.name.trim(), description: values.description.trim(), groupId: values.groupId,
      dimension: values.dimension, kflaCompetencyId: values.dimension === "competency" ? values.kflaCompetencyId || undefined : undefined,
      aliases: values.aliases.split(",").map((item) => item.trim()).filter(Boolean), evidence: id ? workspace.skills.find((item) => item.id === id)?.evidence || [] : ["Manual design entry"],
      confidence: id ? workspace.skills.find((item) => item.id === id)?.confidence || 70 : 70, observability: values.observability.trim(), futureRelevance: values.futureRelevance, status: values.status,
      syntax: { action: values.action.trim(), object: values.object.trim(), outcome: values.outcome.trim() || undefined },
    };
    mutate((current) => ({ ...current, skills: id ? current.skills.map((item) => item.id === id ? record : item) : [record, ...current.skills] }));
    setEditing(null); setMessage(`${record.name} ${id ? "updated" : "created"}.`);
  }

  function deleteSkill(skill: Skill) {
    if (workspace.profiles.some((profile) => profile.skills.some((item) => item.skillId === skill.id))) {
      setError(`${skill.name} is linked to a role profile. Remove the mapping before deleting it.`); return;
    }
    mutate((current) => ({ ...current, skills: current.skills.filter((item) => item.id !== skill.id) }));
  }

  return <div className="skill-designer">
    <section className="skill-command-bar">
      <div className="skill-tabs" role="tablist" aria-label="Skill Designer sections">{tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}{item.id === "review" && pending > 0 && <em>{pending}</em>}</button>)}</div>
      <div className="skill-actions"><span className={`skill-sync ${sync}`}>{sync === "live" ? "n8n working state" : sync === "saving" ? "Saving..." : sync === "connecting" ? "Connecting..." : "Unsaved changes"}</span><button className="button secondary" disabled={sync === "saving"} onClick={() => void saveWorkingState()}>Save working state</button><button className="button primary" disabled={sync === "saving"} onClick={() => void publish()}><Icons.github/>Release approved JSON</button></div>
    </section>
    {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}><Icons.close/></button></div>}
    {message && <div className="success-banner"><span>{message}</span><button onClick={() => setMessage("")}><Icons.close/></button></div>}
    {tab === "overview" && <Overview workspace={workspace} approved={approved} pending={pending} evidence={evidence} onNavigate={setTab}/>}
    {tab === "intake" && <Intake workspace={workspace} secret={workspaceSecret} onWorkspace={setWorkspace} onMessage={setMessage} onError={setError}/>}
    {tab === "library" && <Library workspace={workspace} query={query} onQuery={setQuery} onEdit={setEditing} onDelete={deleteSkill}/>}
    {tab === "taxonomy" && <TaxonomyStandardWorkbench workspace={workspace} mutate={mutate}/>}
    {tab === "jobs" && <JobMappingWorkbench workspace={workspace} secret={workspaceSecret} mutate={mutate} onWorkspace={(next) => setWorkspace(migrateSkillWorkspace(next, workspace))} onMessage={setMessage} onError={setError}/>}
    {tab === "profiles" && <Profiles workspace={workspace} mutate={mutate}/>}
    {tab === "vectors" && <StrategicVectors workspace={workspace} mutate={mutate}/>}
    {tab === "review" && <Review workspace={workspace} mutate={mutate}/>}
    {tab === "runs" && <AgentRunLog workspace={workspace}/>}
    {editing && <SkillEditor workspace={workspace} skill={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={saveSkill}/>}
    {tab === "library" && <button className="skill-fab button primary" onClick={() => setEditing("new")}><Icons.plus/>Create skill</button>}
  </div>;
}

function Overview({ workspace, approved, pending, evidence, onNavigate }: { workspace: SkillWorkspace; approved: number; pending: number; evidence: number; onNavigate: (tab: Tab) => void }) {
  return <div className="skill-stack">
    <section className="skill-hero"><div><span>SKILL DESIGN CONTROL PLANE</span><h2>From role evidence to governed capability.</h2><p>Agent-led elicitation converts real work into observable, reusable skills. Human reviewers retain control over every taxonomy and profile decision.</p><div className="hero-actions"><button className="button primary" onClick={() => onNavigate("intake")}><Icons.spark/>Start evidence intake</button><button className="button secondary" onClick={() => onNavigate("review")}>Review proposals</button></div></div><div className="skill-pipeline"><span>01<b>Gather</b><small>JDs · interviews</small></span><i/><span>02<b>Extract</b><small>action · object · outcome</small></span><i/><span>03<b>Govern</b><small>MECE · evidence</small></span><i/><span>04<b>Apply</b><small>profiles · proficiency</small></span></div></section>
    <section className="skill-kpis"><article><span>CORE SKILLS</span><b>{workspace.skills.length}</b><small>{approved} approved</small></article><article><span>TAXONOMY</span><b>{workspace.domains.length} / {workspace.groups.length}</b><small>domains / skill groups</small></article><article><span>EVIDENCE LINKS</span><b>{evidence}</b><small>traceable source references</small></article><article><span>REVIEW QUEUE</span><b>{pending}</b><small>human decisions required</small></article></section>
    <section className="skill-two-col"><article className="panel design-system-card"><header><span className="section-kicker">DESIGN PRINCIPLES</span><h3>Quality before volume</h3></header><div className="principle-grid">{[
      ["Robust granularity", "One durable capability, neither task nor umbrella."], ["Observable action", "Expressed through evidence someone can see."], ["Future relevance", "Prioritise the 80% core and flag emerging skills."], ["Uniqueness / MECE", "Resolve duplicates, aliases and overlapping meaning."], ["Identity of meaning", "Stable name, description and boundaries."], ["Evidence confidence", "Every proposal retains source and confidence."],
    ].map(([name, copy], index) => <div key={name}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{name}</strong><small>{copy}</small></span></div>)}</div></article>
    <article className="panel dimension-card"><header><span className="section-kicker">KORN FERRY-ALIGNED FACETS</span><h3>Whole-person mapping</h3></header>{[["Technical skills", "Tools, methods, regulations and domain practice."], ["Competencies", "Observable behavior mapped to configurable KFLA references."], ["Experiences", "Career assignments and contexts that build readiness."], ["Traits", "Natural inclinations and personal tendencies."], ["Drivers", "Motives and conditions that sustain engagement."]].map(([name, copy]) => <div key={name}><i/><span><b>{name}</b><small>{copy}</small></span></div>)}<p>Framework names are seeded from public Korn Ferry references. Licensed definitions remain blank until an authorized source is supplied.</p></article></section>
  </div>;
}

function Intake({ workspace, secret, onWorkspace, onMessage, onError }: { workspace: SkillWorkspace; secret: string; onWorkspace: (workspace: SkillWorkspace) => void; onMessage: (message: string) => void; onError: (error: string) => void }) {
  const [mode, setMode] = useState<"documents" | "interview">("documents");
  const [roleTitle, setRoleTitle] = useState("Global Reporting Analyst"); const [brief, setBrief] = useState(""); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  const [stakeholder, setStakeholder] = useState("Manager"); const [interviewee, setInterviewee] = useState(""); const [answer, setAnswer] = useState("");
  const questions = ["What outcomes make this role successful?", "Describe a critical incident that separates strong from average performance.", "Which tools, methods or regulations are essential?", "If this capability were missing, could the role still deliver its core outcome?", "Which capabilities will matter more in the next three years?"];
  const active = workspace.interviews.find((item) => item.status === "in_progress");
  async function ingest() { setBusy(true); onError(""); try { const payload = await ingestSkillEvidence(secret, files, brief, roleTitle); if (payload.workspace) onWorkspace(payload.workspace); onMessage(payload.message || `${payload.proposals?.length || 0} governed proposals added to review.`); setBrief(""); setFiles([]); } catch (reason) { onError(reason instanceof Error ? reason.message : "Evidence intake failed."); } finally { setBusy(false); } }
  async function interview() { setBusy(true); onError(""); try { const payload = await runSkillInterview(secret, { action: active ? "answer" : "start", roleTitle, stakeholder, interviewee, answer, interviewId: active?.id }); if (payload.workspace) onWorkspace(payload.workspace); onMessage(payload.message || "Interview progress saved by the agent."); setAnswer(""); } catch (reason) { onError(reason instanceof Error ? reason.message : "Interview agent failed."); } finally { setBusy(false); } }
  return <div className="intake-layout"><section className="panel skill-intake-panel"><header><div><span className="section-kicker">AGENT-LED ELICITATION</span><h3>Build skills from evidence</h3></div><div className="type-switch"><button className={mode === "documents" ? "active" : ""} onClick={() => setMode("documents")}>Documents</button><button className={mode === "interview" ? "active" : ""} onClick={() => setMode("interview")}>Interview</button></div></header>{mode === "documents" ? <div className="skill-form"><label><span>Role or job title</span><input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)}/></label><label><span>Role brief or responsibility statements</span><textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Paste responsibilities, outcomes, context, tools and constraints…"/></label><label className="skill-drop"><Icons.upload/><b>Drop role evidence here</b><span>PDF, Excel, text, CSV or image · maximum 29 MB</span><input aria-label="Skill evidence files" type="file" multiple accept=".pdf,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg" onChange={(event) => setFiles(Array.from(event.target.files || []))}/><small>{files.length ? files.map((file) => file.name).join(" · ") : "No files selected"}</small></label><button className="button primary" disabled={busy || (!brief.trim() && !files.length)} onClick={() => void ingest()}><Icons.spark/>{busy ? "Agents analysing…" : "Extract skill proposals"}</button></div> : <div className="skill-form"><div className="form-row"><label><span>Role title</span><input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)}/></label><label><span>Perspective</span><select value={stakeholder} onChange={(event) => setStakeholder(event.target.value)}>{["Incumbent", "Manager", "SME", "HR"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label><span>Interviewee</span><input value={interviewee} onChange={(event) => setInterviewee(event.target.value)} placeholder="Name or participant ID"/></label><div className="agent-question"><span>AGENT QUESTION {active ? active.currentQuestion + 1 : 1} / {questions.length}</span><h4>{questions[active?.currentQuestion || 0]}</h4><small>Probe for action + object + outcome + context + evidence. Avoid task lists and personality labels.</small></div><label><span>Response</span><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Capture the concrete example and observable evidence…"/></label><button className="button primary" disabled={busy || !answer.trim()} onClick={() => void interview()}><Icons.spark/>{busy ? "Agent reasoning…" : active ? "Save and continue" : "Start interview"}</button></div>}</section><AgentRail/></div>;
}

function AgentRail() { return <aside className="panel agent-rail"><span className="section-kicker">ORCHESTRATION</span><h3>Specialist agent chain</h3>{[["01", "Evidence auditor", "Removes administrative noise and preserves sources."], ["02", "Semantic extractor", "Finds action, object, outcome, context and method."], ["03", "Skill normalizer", "De-layers tasks into durable capabilities."], ["04", "Taxonomy matcher", "Detects aliases, overlap and hierarchy fit."], ["05", "Profile composer", "Proposes proficiency, weight and role relevance."], ["06", "Governance gate", "Routes uncertain or material changes to humans."]].map(([step, name, copy]) => <div key={step}><b>{step}</b><span><strong>{name}</strong><small>{copy}</small></span><i/></div>)}</aside>; }

function Library({ workspace, query, onQuery, onEdit, onDelete }: { workspace: SkillWorkspace; query: string; onQuery: (value: string) => void; onEdit: (skill: Skill | "new") => void; onDelete: (skill: Skill) => void }) {
  const filtered = workspace.skills.filter((skill) => `${skill.name} ${skill.description} ${skill.aliases.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="skill-stack"><section className="library-toolbar"><div className="search-box"><Icons.search/><input aria-label="Search skill library" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search skills, aliases or descriptions…"/></div><span>{filtered.length} skills</span><button className="button primary" onClick={() => onEdit("new")}><Icons.plus/>Create skill</button></section><section className="skill-table panel"><header><span>Skill</span><span>Taxonomy</span><span>Dimension</span><span>Confidence</span><span>Quality</span><span>Status</span><span/></header>{filtered.map((skill) => { const group = workspace.groups.find((item) => item.id === skill.groupId); const domain = workspace.domains.find((item) => item.id === group?.domainId); const kfla = workspace.kfla.find((item) => item.id === skill.kflaCompetencyId); const quality = skillQuality(skill, workspace); return <div key={skill.id}><span><b>{skill.name}</b><small>{skill.description}</small>{skill.aliases.length > 0 && <em>Aliases: {skill.aliases.join(", ")}</em>}</span><span><b>{domain?.name}</b><small>{group?.name}</small></span><span><i className={`dimension-dot ${skill.dimension}`}/>{title(skill.dimension)}{kfla && <small>{kfla.number}. {kfla.name}</small>}</span><span><b>{skill.confidence}%</b><small>{skill.evidence.length} evidence links</small></span><span><b>{quality.score}%</b><small>{Object.values(quality.checks).filter(Boolean).length}/6 standards</small></span><span><em className={`lifecycle ${skill.status}`}>{title(skill.status)}</em></span><span className="record-actions"><button aria-label={`Edit ${skill.name}`} onClick={() => onEdit(skill)}><Icons.edit/></button><button aria-label={`Delete ${skill.name}`} onClick={() => onDelete(skill)}><Icons.trash/></button></span></div>; })}</section></div>;
}

function Profiles({ workspace, mutate }: { workspace: SkillWorkspace; mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void }) {
  const [selected, setSelected] = useState(workspace.profiles[0]?.id || ""); const profile = workspace.profiles.find((item) => item.id === selected);
  if (!profile) return <div className="empty-state">No role profiles yet.</div>;
  const guidance = profileGuidance(profile, workspace.skills);
  const profileId = profile.id;
  const profileSkills = profile.skills;
  function addSkill() { const available = workspace.skills.find((skill) => !profileSkills.some((item) => item.skillId === skill.id)); if (!available) return; mutate((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === profileId ? { ...item, skills: [...item.skills, { skillId: available.id, targetLevel: 2, weight: 10, critical: false }] } : item) })); }
  return <div className="profile-layout"><aside className="panel profile-list"><span className="section-kicker">ROLE PROFILES</span>{workspace.profiles.map((item) => <button key={item.id} className={selected === item.id ? "active" : ""} onClick={() => setSelected(item.id)}><b>{item.title}</b><small>{item.jobFamily} · {item.skills.length} skills</small></button>)}</aside><section className="panel profile-detail"><header><div><span className="section-kicker">SUCCESS PROFILE</span><h3>{profile.title}</h3><p>{profile.purpose}</p></div><em className={`lifecycle ${profile.status}`}>{title(profile.status)}</em></header><div className={`profile-guidance ${guidance.validCount ? "valid" : "warning"}`}><Icons.risk/><span><b>{guidance.count} of 8–12 core skills</b><small>{guidance.composition} · Suggested: 5–6 technical, 3–4 behavioral, 1–2 traits/drivers.</small></span></div><div className="profile-skill-head"><span>Core skill</span><span>Target proficiency</span><span>Weight</span><span/></div>{profile.skills.map((mapping) => { const skill = workspace.skills.find((item) => item.id === mapping.skillId); if (!skill) return null; return <div className="profile-skill" key={mapping.skillId}><span><i className={`dimension-dot ${skill.dimension}`}/><b>{skill.name}</b><small>{title(skill.dimension)}{mapping.critical ? " · Critical" : ""}</small></span><select aria-label={`${skill.name} target proficiency`} value={mapping.targetLevel} onChange={(event) => mutate((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === profile.id ? { ...item, skills: item.skills.map((value) => value.skillId === mapping.skillId ? { ...value, targetLevel: Number(event.target.value) as 1 | 2 | 3 | 4 } : value) } : item) }))}>{proficiencyLevels.map((level) => <option key={level.id} value={level.id}>{level.id} · {level.name}</option>)}</select><span>{mapping.weight}%</span><button aria-label={`Remove ${skill.name} from profile`} onClick={() => mutate((current) => ({ ...current, profiles: current.profiles.map((item) => item.id === profile.id ? { ...item, skills: item.skills.filter((value) => value.skillId !== mapping.skillId) } : item) }))}><Icons.trash/></button></div>; })}<button className="button secondary" onClick={addSkill}><Icons.plus/>Add core skill</button><div className="proficiency-rubric">{proficiencyLevels.map((level) => <div key={level.id}><b>{level.id}</b><span><strong>{level.name}</strong><small>{level.description}</small></span></div>)}</div></section></div>;
}

function Review({ workspace, mutate }: { workspace: SkillWorkspace; mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void }) {
  const items = workspace.reviewQueue.filter((item) => item.status === "pending");
  function decide(id: string, status: "accepted" | "rejected") {
    mutate((current) => {
      const review = current.reviewQueue.find((item) => item.id === id);
      return {
        ...current,
        reviewQueue: current.reviewQueue.map((item) => item.id === id ? { ...item, status } : item),
        skills: status === "accepted"
          ? current.skills.map((skill) => (skill.name === review?.title || skill.id === review?.entityId) ? { ...skill, status: "approved" as Lifecycle } : skill)
          : current.skills,
        mappings: current.mappings.map((mapping) => mapping.id === review?.entityId
          ? { ...mapping, status: status === "accepted" ? "approved" : "rejected" }
          : mapping),
        profiles: current.profiles.map((profile) => profile.id === review?.entityId && status === "accepted"
          ? { ...profile, status: "approved" as Lifecycle }
          : profile),
      };
    });
  }
  return <div className="review-layout"><section className="panel review-queue"><header><div><span className="section-kicker">HUMAN GOVERNANCE GATE</span><h3>{items.length} decisions pending</h3></div></header>{items.length === 0 && <div className="empty-state"><Icons.check/><b>Review queue is clear</b><span>New agent proposals will appear here.</span></div>}{items.map((item) => <article key={item.id}><header><span className="review-type">{title(item.type)}</span><b>{item.confidence}% confidence</b></header><h4>{item.title}</h4><p>{item.summary}</p><small><Icons.document/>{item.evidence}</small><footer><button className="button ghost" onClick={() => decide(item.id, "rejected")}>Reject</button><button className="button primary" onClick={() => decide(item.id, "accepted")}><Icons.check/>Accept proposal</button></footer></article>)}</section><aside className="panel governance-checks"><span className="section-kicker">REVIEW CHECKLIST</span><h3>Before approval</h3>{["Atomic capability, not a task", "Action and outcome are observable", "No duplicate or overlapping meaning", "Taxonomy placement is coherent", "Dimension mapping is defensible", "Evidence and confidence are sufficient", "Proficiency can be demonstrated"].map((value) => <label key={value}><input type="checkbox"/><span>{value}</span></label>)}<p>The agent recommends; an accountable human approves. Every decision is retained in the revision history.</p></aside></div>;
}

function SkillEditor({ workspace, skill, onClose, onSave }: { workspace: SkillWorkspace; skill?: Skill; onClose: () => void; onSave: (values: SkillDraft, id?: string) => void }) {
  const [values, setValues] = useState<SkillDraft>(skill ? { name: skill.name, description: skill.description, groupId: skill.groupId, dimension: skill.dimension, kflaCompetencyId: skill.kflaCompetencyId || "", aliases: skill.aliases.join(", "), observability: skill.observability, futureRelevance: skill.futureRelevance, status: skill.status, action: skill.syntax?.action || "", object: skill.syntax?.object || "", outcome: skill.syntax?.outcome || "" } : emptySkill(workspace.groups[0]?.id || ""));
  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal skill-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(values, skill?.id); }}><header><div><span className="section-kicker">CORE SKILL</span><h2>{skill ? `Edit ${skill.name}` : "Create governed skill"}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="form-row"><label><span>Canonical name</span><input required value={values.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Data Visualization"/></label><label><span>Skill group</span><select value={values.groupId} onChange={(event) => set("groupId", event.target.value)}>{workspace.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label></div><label><span>Definition</span><textarea required value={values.description} onChange={(event) => set("description", event.target.value)} placeholder="What durable capability does this represent?"/></label><div className="syntax-standard"><span>ACTION + OBJECT SYNTAX</span><div className="form-row"><label><span>Action</span><input required value={values.action} onChange={(event) => set("action", event.target.value)} placeholder="e.g. Visualise"/></label><label><span>Object</span><input required value={values.object} onChange={(event) => set("object", event.target.value)} placeholder="e.g. business data"/></label></div><label><span>Outcome qualifier</span><input value={values.outcome} onChange={(event) => set("outcome", event.target.value)} placeholder="e.g. to enable decision-making"/></label></div><label><span>Observable evidence</span><textarea required value={values.observability} onChange={(event) => set("observability", event.target.value)} placeholder="What would demonstrate the capability in real work?"/></label><div className="form-row"><label><span>Dimension</span><select value={values.dimension} onChange={(event) => set("dimension", event.target.value as SkillDimension)}>{["technical", "competency", "experience", "trait", "driver"].map((value) => <option value={value} key={value}>{title(value)}</option>)}</select></label>{values.dimension === "competency" && <label><span>KFLA mapping</span><select value={values.kflaCompetencyId} onChange={(event) => set("kflaCompetencyId", event.target.value)}><option value="">Select mapping</option>{workspace.kfla.filter((item) => item.enabled).map((item) => <option value={item.id} key={item.id}>{item.number}. {item.name}</option>)}</select></label>}</div><label><span>Aliases</span><input value={values.aliases} onChange={(event) => set("aliases", event.target.value)} placeholder="Comma-separated alternative labels"/></label><div className="form-row"><label><span>Future relevance</span><select value={values.futureRelevance} onChange={(event) => set("futureRelevance", event.target.value as SkillDraft["futureRelevance"])}>{["core", "emerging", "legacy"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Lifecycle</span><select value={values.status} onChange={(event) => set("status", event.target.value as Lifecycle)}>{["draft", "in_review", "approved", "retired"].map((value) => <option key={value}>{value}</option>)}</select></label></div><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">{skill ? "Apply changes" : "Create skill"}</button></footer></form></div>;
}
