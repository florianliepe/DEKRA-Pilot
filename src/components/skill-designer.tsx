"use client";

import { useEffect, useState } from "react";
import { Icons } from "./icons";
import { bootstrapSkillWorkspace } from "@/lib/skill-fixtures";
import { ingestSkillEvidence, loadApprovedSkillWorkspace, loadSkillWorkflowHealth, loadSkillWorkspace, publishSkillWorkspace, runSkillInterview, saveSkillWorkspace, SkillWorkflowError } from "@/lib/skill-client";
import { migrateSkillWorkspace, profileGuidance, proficiencyLevels, workspaceFindings, type Lifecycle, type ReleaseManifest, type RoleProfile, type Skill, type SkillDimension, type SkillWorkspace } from "@/lib/skill-schema";
import { JobMappingWorkbench } from "./job-mapping-workbench";
import { StrategicVectors } from "./strategic-vectors";
import { AgentRunLog } from "./agent-run-log";
import { TaxonomyStandardWorkbench } from "./taxonomy-standard-workbench";
import { ElicitationWorkbench } from "./elicitation-workbench";
import { GovernanceWorkbench } from "./governance-workbench";
import { GovernedSkillLibrary } from "./governed-skill-library";
import { applyReleaseReceiptToWorkingWorkspace, applyRoleProfileLifecycle, decideReview, impactAnalysis, prepareRelease, recordGovernedVersion, type RoleProfileLifecycleAction } from "@/lib/skill-governance";

type Tab = "overview" | "intake" | "elicitation" | "library" | "taxonomy" | "jobs" | "profiles" | "vectors" | "review" | "runs" | "governance";
type SkillDraft = Pick<Skill, "name" | "description" | "groupId" | "dimension" | "kflaCompetencyId" | "observability" | "futureRelevance" | "status"> & { aliases: string; action: string; object: string; outcome: string };

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "intake", label: "Intake & interview" },
  { id: "elicitation", label: "Elicitation wizard" },
  { id: "library", label: "Skill library" }, { id: "taxonomy", label: "Taxonomy" },
  { id: "jobs", label: "Jobs & mapping" }, { id: "profiles", label: "Role profiles" },
  { id: "vectors", label: "Strategic vectors" }, { id: "review", label: "Review queue" }, { id: "runs", label: "Agent runs" }, { id: "governance", label: "Governance" },
];
const emptySkill = (groupId: string): SkillDraft => ({ name: "", description: "", groupId, dimension: "technical", kflaCompetencyId: "", aliases: "", observability: "", futureRelevance: "core", status: "draft", action: "", object: "", outcome: "" });
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const displayConfidence = (value: number) => Math.round(value > 0 && value <= 1 ? value * 100 : value);

export function SkillDesigner({ workspaceSecret }: { workspaceSecret: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [workspace, setWorkspace] = useState<SkillWorkspace>(bootstrapSkillWorkspace);
  const [sync, setSync] = useState<"connecting" | "live" | "blueprint" | "saving">("connecting");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Skill | "new" | null>(null);
  const [approvedWorkspace, setApprovedWorkspace] = useState<SkillWorkspace | null>(null);
  const [releaseAttempt, setReleaseAttempt] = useState<{ manifest: ReleaseManifest; approvedBy: string; workspaceRevision: number; workspaceUpdatedAt: string } | null>(null);
  const [releaseFailure, setReleaseFailure] = useState<{ message: string; status?: number; findings: string[] } | null>(null);

  useEffect(() => {
    let current = true;
    void loadSkillWorkspace(workspaceSecret).then(async (payload) => {
      if (!current) return;
      if (payload.workspace?.skills && payload.workspace?.kfla) {
        const remote = migrateSkillWorkspace(payload.workspace, bootstrapSkillWorkspace);
        const isFreshV3Store = remote.skills.length === 0 && remote.kfla.length === 0 && remote.agentTools.length === 0;
        if (isFreshV3Store) {
          const seed = { ...bootstrapSkillWorkspace, revision: remote.revision, publication: { ...bootstrapSkillWorkspace.publication, ...remote.publication, state: "working" as const } };
          const initialized = await saveSkillWorkspace(workspaceSecret, seed);
          if (!current) return;
          setWorkspace(initialized.workspace ? migrateSkillWorkspace(initialized.workspace, seed) : seed);
          setMessage("Governed v3 working state initialized in n8n; human review decisions remain pending.");
        } else setWorkspace(remote);
        setSync("live");
      }
      else setSync("blueprint");
    }).catch((reason) => { if (current) { setSync("blueprint"); setError(reason instanceof Error ? reason.message : "Unable to connect to the governed n8n workspace."); } });
    return () => { current = false; };
  }, [workspaceSecret]);

  async function refreshApprovedWorkspace() {
    try { setApprovedWorkspace(migrateSkillWorkspace(await loadApprovedSkillWorkspace(), bootstrapSkillWorkspace)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the approved GitHub snapshot."); }
  }

  useEffect(() => {
    let current = true;
    void loadApprovedSkillWorkspace().then((approved) => { if (current) setApprovedWorkspace(migrateSkillWorkspace(approved, bootstrapSkillWorkspace)); }).catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "Unable to load the approved GitHub snapshot."); });
    return () => { current = false; };
  }, []);

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
      setWorkspace(payload.workspace ? migrateSkillWorkspace(payload.workspace, candidate) : candidate); setSync("live"); setMessage("Working state saved to n8n.");
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
      const prepared = prepareRelease(workspace, approvedBy.trim(), workspace.publication.revision, approvedWorkspace?.publication.expectedGitHubSha || workspace.publication.expectedGitHubSha);
      const attempt = { manifest: prepared.manifest, approvedBy: approvedBy.trim(), workspaceRevision: workspace.revision, workspaceUpdatedAt: workspace.updatedAt };
      setReleaseAttempt(attempt); setReleaseFailure(null);
      await executeRelease(attempt);
    } catch (reason) { handleReleaseFailure(reason); }
  }

  function handleReleaseFailure(reason: unknown) {
    const message = reason instanceof Error ? reason.message : "Unable to publish the approved release.";
    const workflowError = reason instanceof SkillWorkflowError ? reason : null;
    setSync("blueprint"); setError(message);
    setReleaseFailure({ message, status: workflowError?.status, findings: workflowError?.payload.findings?.map((finding) => `${finding.ruleId || "RELEASE"}: ${finding.explanation || "Release check failed."}`) || [] });
  }

  async function executeRelease(attempt: NonNullable<typeof releaseAttempt>) {
    if (workspace.revision !== attempt.workspaceRevision || workspace.updatedAt !== attempt.workspaceUpdatedAt) {
      setReleaseFailure({ message: "Working state changed after the release was prepared. Prepare a new release instead of retrying the stale transaction.", findings: [] });
      setSync("blueprint"); return;
    }
    setSync("saving"); setError("");
    try {
      const payload = await publishSkillWorkspace(workspaceSecret, workspace, attempt.approvedBy, attempt.manifest);
      if (!payload.commit || !payload.manifest) throw new Error("Publisher completed without a verifiable commit and release manifest receipt.");
      const published = migrateSkillWorkspace(await loadApprovedSkillWorkspace(), payload.workspace ? migrateSkillWorkspace(payload.workspace, workspace) : workspace);
      const receiptWorking = applyReleaseReceiptToWorkingWorkspace(workspace, published, payload.manifest, payload.commit);
      const receiptPayload = await saveSkillWorkspace(workspaceSecret, receiptWorking);
      const persistedWorking = receiptPayload.workspace ? migrateSkillWorkspace(receiptPayload.workspace, receiptWorking) : receiptWorking;
      setWorkspace(persistedWorking); setApprovedWorkspace(published); setReleaseFailure(null); setReleaseAttempt(null); setSync("live");
      setMessage(payload.message || `Approved JSON release committed to GitHub main${payload.commit ? ` at ${payload.commit.slice(0, 8)}` : ""}.`);
    } catch (reason) { handleReleaseFailure(reason); }
  }

  function saveSkill(values: SkillDraft, actor: string, reason: string, id?: string) {
    const prior = id ? workspace.skills.find((item) => item.id === id) : undefined;
    const requestedApproval = values.status === "approved";
    const materialApprovedEdit = prior?.status === "approved";
    const governedStatus: Lifecycle = requestedApproval || materialApprovedEdit ? "in_review" : values.status;
    const record: Skill = {
      id: id || `SK-${Date.now().toString().slice(-6)}`, name: values.name.trim(), description: values.description.trim(), groupId: values.groupId,
      dimension: values.dimension, kflaCompetencyId: values.dimension === "competency" ? values.kflaCompetencyId || undefined : undefined,
      aliases: values.aliases.split(",").map((item) => item.trim()).filter(Boolean), evidence: id ? workspace.skills.find((item) => item.id === id)?.evidence || [] : ["Manual design entry"],
      confidence: id ? workspace.skills.find((item) => item.id === id)?.confidence || 70 : 70, observability: values.observability.trim(), futureRelevance: values.futureRelevance, status: governedStatus,
      syntax: { action: values.action.trim(), object: values.object.trim(), outcome: values.outcome.trim() || undefined },
    };
    mutate((current) => {
      const needsReview = requestedApproval || materialApprovedEdit;
      const reviewId = `REV-${record.id}-${Date.now()}`;
      const next = { ...current, skills: id ? current.skills.map((item) => item.id === id ? record : item) : [record, ...current.skills], reviewQueue: needsReview ? [{ id: reviewId, entityId: record.id, title: `Review ${record.name}`, type: "taxonomy_change" as const, summary: materialApprovedEdit ? "Material edit to an approved skill requires accountable re-approval." : "Approval request created from the governed skill editor.", confidence: record.confidence, evidence: record.evidence.join(" · ") || "Manual governed edit", status: "pending" as const, frameworkVersion: current.framework.version, rulesVersion: current.framework.rulesVersion, payload: { requestedBy: actor.trim(), requestReason: reason.trim() } }, ...current.reviewQueue] : current.reviewQueue };
      return recordGovernedVersion(next, "skill", record.id, id ? "skill.updated" : "skill.created", actor.trim(), { ...record, governanceReason: reason.trim() } as unknown as Record<string, unknown>);
    });
    setEditing(null); setMessage(`${record.name} ${id ? "updated" : "created"}${governedStatus === "in_review" ? " and routed for accountable review" : ""}.`);
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
    {tab === "elicitation" && <ElicitationWorkbench workspace={workspace} secret={workspaceSecret} mutate={mutate} onWorkspace={(next) => setWorkspace(migrateSkillWorkspace(next, workspace))} onMessage={setMessage} onError={setError}/>}
    {tab === "library" && <Library workspace={workspace} query={query} onQuery={setQuery} onEdit={setEditing} mutate={mutate} onMessage={setMessage} onError={setError}/>}
    {tab === "taxonomy" && <TaxonomyStandardWorkbench workspace={workspace} mutate={mutate}/>}
    {tab === "jobs" && <JobMappingWorkbench workspace={workspace} approvedWorkspace={approvedWorkspace} secret={workspaceSecret} mutate={mutate} onWorkspace={(next) => setWorkspace(migrateSkillWorkspace(next, workspace))} onMessage={setMessage} onError={setError}/>}
    {tab === "profiles" && <Profiles workspace={workspace} mutate={mutate}/>}
    {tab === "vectors" && <StrategicVectors workspace={workspace} mutate={mutate}/>}
    {tab === "review" && <Review workspace={workspace} mutate={mutate}/>}
    {tab === "runs" && <AgentRunLog workspace={workspace}/>}
    {tab === "governance" && <GovernanceWorkbench workspace={workspace} approvedWorkspace={approvedWorkspace} releaseFailure={releaseFailure} canRetryRelease={Boolean(releaseAttempt)} mutate={mutate} onMessage={setMessage} onError={setError} onRefreshApproved={() => void refreshApprovedWorkspace()} onRetryRelease={() => releaseAttempt && void executeRelease(releaseAttempt)} onHealthCheck={async () => { const payload = await loadSkillWorkflowHealth(workspaceSecret); if (!payload.health) throw new Error("The governed workflow returned no health contract."); return payload.health; }}/>}
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
  return <div className="intake-layout"><section className="panel skill-intake-panel"><header><div><span className="section-kicker">AGENT-LED ELICITATION</span><h3>Build skills from evidence</h3></div><div className="type-switch"><button className={mode === "documents" ? "active" : ""} onClick={() => setMode("documents")}>Documents</button><button className={mode === "interview" ? "active" : ""} onClick={() => setMode("interview")}>Interview</button></div></header>{mode === "documents" ? <div className="skill-form"><label><span>Role or job title</span><input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)}/></label><label><span>Role brief or responsibility statements</span><textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Paste responsibilities, outcomes, context, tools and constraints…"/></label><label className="skill-drop"><Icons.upload/><b>Drop role evidence here</b><span>DOCX, PPTX, PDF, XLSX, text, CSV or image · maximum 29 MB</span><input aria-label="Skill evidence files" type="file" multiple accept=".docx,.pptx,.pdf,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg" onChange={(event) => setFiles(Array.from(event.target.files || []))}/><small>{files.length ? files.map((file) => file.name).join(" · ") : "No files selected"}</small></label><button className="button primary" disabled={busy || (!brief.trim() && !files.length)} onClick={() => void ingest()}><Icons.spark/>{busy ? "Agents analysing…" : "Extract skill proposals"}</button></div> : <div className="skill-form"><div className="form-row"><label><span>Role title</span><input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)}/></label><label><span>Perspective</span><select value={stakeholder} onChange={(event) => setStakeholder(event.target.value)}>{["Incumbent", "Manager", "SME", "HR"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label><span>Interviewee</span><input value={interviewee} onChange={(event) => setInterviewee(event.target.value)} placeholder="Name or participant ID"/></label><div className="agent-question"><span>AGENT QUESTION {active ? active.currentQuestion + 1 : 1} / {questions.length}</span><h4>{questions[active?.currentQuestion || 0]}</h4><small>Probe for action + object + outcome + context + evidence. Avoid task lists and personality labels.</small></div><label><span>Response</span><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Capture the concrete example and observable evidence…"/></label><button className="button primary" disabled={busy || !answer.trim()} onClick={() => void interview()}><Icons.spark/>{busy ? "Agent reasoning…" : active ? "Save and continue" : "Start interview"}</button></div>}</section><AgentRail/></div>;
}

function AgentRail() { return <aside className="panel agent-rail"><span className="section-kicker">ORCHESTRATION</span><h3>Specialist agent chain</h3>{[["01", "Evidence auditor", "Removes administrative noise and preserves sources."], ["02", "Semantic extractor", "Finds action, object, outcome, context and method."], ["03", "Skill normalizer", "De-layers tasks into durable capabilities."], ["04", "Taxonomy matcher", "Detects aliases, overlap and hierarchy fit."], ["05", "Profile composer", "Proposes proficiency, weight and role relevance."], ["06", "Governance gate", "Routes uncertain or material changes to humans."]].map(([step, name, copy]) => <div key={step}><b>{step}</b><span><strong>{name}</strong><small>{copy}</small></span><i/></div>)}</aside>; }

function Library({ workspace, query, onQuery, onEdit, mutate, onMessage, onError }: { workspace: SkillWorkspace; query: string; onQuery: (value: string) => void; onEdit: (skill: Skill | "new") => void; mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void; onMessage: (message: string) => void; onError: (message: string) => void }) {
  return <GovernedSkillLibrary workspace={workspace} query={query} onQuery={onQuery} onEdit={onEdit} mutate={mutate} onMessage={onMessage} onError={onError}/>;
}

type ProfileActionDraft = { action: RoleProfileLifecycleAction; actor: string; reason: string; targetProfileId: string };
type ProfileSkillLinkDraft = { skillId: string; update: "add" | "remove" | { targetLevel: 1 | 2 | 3 | 4 }; actor: string; reason: string };

function Profiles({ workspace, mutate }: { workspace: SkillWorkspace; mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void }) {
  const [selected, setSelected] = useState(workspace.profiles[0]?.id || "");
  const [editing, setEditing] = useState<RoleProfile | "new" | null>(null);
  const [action, setAction] = useState<ProfileActionDraft | null>(null);
  const [linkAction, setLinkAction] = useState<ProfileSkillLinkDraft | null>(null);
  const profile = workspace.profiles.find((item) => item.id === selected) || workspace.profiles[0];
  const guidance = profile ? profileGuidance(profile, workspace.skills) : null;
  const impact = profile ? impactAnalysis(workspace, profile.id) : null;

  function saveProfile(value: RoleProfile, actor: string, reason: string) {
    const exists = workspace.profiles.some((item) => item.id === value.id);
    const id = value.id || `PROF-${Date.now().toString().slice(-8)}`;
    const saved: RoleProfile = { ...value, id, status: exists && value.status === "approved" ? "in_review" : value.status || "draft" };
    mutate((current) => recordGovernedVersion({ ...current, profiles: exists ? current.profiles.map((item) => item.id === id ? saved : item) : [saved, ...current.profiles] }, "role_profile", id, exists ? "profile.updated" : "profile.created", actor.trim(), { ...saved, governanceReason: reason.trim() } as unknown as Record<string, unknown>));
    setSelected(id); setEditing(null);
  }

  function updateSkillLink(skillId: string, update: "add" | "remove" | { targetLevel: 1 | 2 | 3 | 4 }, actor?: string, reason?: string) {
    if (!profile) return;
    if (!actor?.trim() || !reason?.trim()) { setLinkAction({ skillId, update, actor: "", reason: "" }); return; }
    mutate((current) => {
      const currentProfile = current.profiles.find((item) => item.id === profile.id);
      if (!currentProfile) return current;
      const skills = update === "add"
        ? [...currentProfile.skills, { skillId, targetLevel: 2 as const, weight: 10, critical: false }]
        : update === "remove"
          ? currentProfile.skills.filter((item) => item.skillId !== skillId)
          : currentProfile.skills.map((item) => item.skillId === skillId ? { ...item, targetLevel: update.targetLevel } : item);
      const next = { ...currentProfile, skills, status: currentProfile.status === "approved" ? "in_review" as const : currentProfile.status };
      return recordGovernedVersion({ ...current, profiles: current.profiles.map((item) => item.id === profile.id ? next : item) }, "role_profile", profile.id, `profile.skill_${typeof update === "string" ? update : "level_changed"}`, actor.trim(), { skillId, profile: next, governanceReason: reason.trim() } as unknown as Record<string, unknown>);
    });
    setLinkAction(null);
  }

  function beginAction(next: RoleProfileLifecycleAction) { setAction({ action: next, actor: "", reason: "", targetProfileId: "" }); }
  function applyAction() {
    if (!profile || !action) return;
    const duplicateId = action.action === "duplicate" ? `PROF-${Date.now().toString().slice(-8)}` : undefined;
    try {
      mutate((current) => applyRoleProfileLifecycle(current, { action: action.action, profileId: profile.id, actor: action.actor, reason: action.reason, targetProfileId: action.targetProfileId || undefined, newProfileId: duplicateId }));
      if (duplicateId) setSelected(duplicateId);
      else if (["replace", "merge"].includes(action.action)) setSelected(action.targetProfileId);
      setAction(null);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Profile lifecycle action failed."); }
  }

  if (linkAction && profile) {
    const skill = workspace.skills.find((candidate) => candidate.id === linkAction.skillId);
    const actionLabel = typeof linkAction.update === "string" ? linkAction.update : `change ${skill?.name || linkAction.skillId} proficiency to level ${linkAction.update.targetLevel}`;
    return <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); updateSkillLink(linkAction.skillId, linkAction.update, linkAction.actor, linkAction.reason); }}><header><div><span className="section-kicker">ACCOUNTABLE PROFILE CHANGE</span><h3>{title(actionLabel)} in {profile.title}</h3></div><button type="button" onClick={() => setLinkAction(null)}><Icons.close/></button></header><p>The profile returns to review when an approved skill composition or target changes.</p><label><span>Accountable actor</span><input required value={linkAction.actor} onChange={(event) => setLinkAction({ ...linkAction, actor: event.target.value })}/></label><label><span>Governance reason</span><textarea required value={linkAction.reason} onChange={(event) => setLinkAction({ ...linkAction, reason: event.target.value })}/></label><footer><button type="button" className="button secondary" onClick={() => setLinkAction(null)}>Cancel</button><button className="button primary">Apply profile skill change</button></footer></form></div>;
  }

  const available = profile ? workspace.skills.find((skill) => skill.status === "approved" && !profile.skills.some((item) => item.skillId === skill.id)) : undefined;
  return <div className="profile-layout"><aside className="panel profile-list"><header><div><span className="section-kicker">ROLE PROFILES</span><small>{workspace.profiles.length} governed profiles</small></div><button aria-label="Create role profile" onClick={() => setEditing("new")}><Icons.plus/></button></header>{workspace.profiles.map((item) => <button key={item.id} className={selected === item.id ? "active" : ""} onClick={() => setSelected(item.id)}><b>{item.title}</b><small>{item.jobFamily} · {item.skills.length} skills · {title(item.status)}</small></button>)}</aside>{!profile || !guidance ? <section className="panel empty-state"><Icons.document/><b>No role profiles yet</b><span>Create a governed profile and connect it to approved job evidence.</span><button className="button primary" onClick={() => setEditing("new")}><Icons.plus/>Create role profile</button></section> : <section className="panel profile-detail"><header><div><span className="section-kicker">SUCCESS PROFILE</span><h3>{profile.title}</h3><p>{profile.purpose}</p></div><div className="profile-governance-actions"><em className={`lifecycle ${profile.status}`}>{title(profile.status)}</em><span className="record-actions"><button aria-label={`Edit ${profile.title} profile`} onClick={() => setEditing(profile)}><Icons.edit/></button><button aria-label={`Duplicate ${profile.title} profile`} onClick={() => beginAction("duplicate")}><Icons.copy/></button><button aria-label={`${profile.status === "archived" ? "Restore" : "Archive"} ${profile.title} profile`} onClick={() => beginAction(profile.status === "archived" ? "restore" : "archive")}>{profile.status === "archived" ? <Icons.refresh/> : <Icons.trash/>}</button></span></div></header><div className={`profile-guidance ${guidance.validCount ? "valid" : "warning"}`}><Icons.risk/><span><b>{guidance.count} of 8–12 core skills</b><small>{guidance.composition} · Suggested: 5–6 technical, 3–4 behavioral, 1–2 traits/drivers.</small></span></div><div className="profile-impact-strip"><span><b>{impact?.profileMappings.length || 0}</b> related mappings</span><span><b>{impact?.profileJobs.length || 0}</b> source jobs</span><button className="button ghost" onClick={() => beginAction("deprecate")}>Deprecate</button><button className="button ghost" onClick={() => beginAction("replace")}>Replace</button><button className="button ghost" onClick={() => beginAction("merge")}>Merge</button></div><div className="profile-skill-head"><span>Core skill</span><span>Target proficiency</span><span>Weight</span><span/></div>{profile.skills.map((mapping) => { const skill = workspace.skills.find((item) => item.id === mapping.skillId); if (!skill) return null; return <div className="profile-skill" key={mapping.skillId}><span><i className={`dimension-dot ${skill.dimension}`}/><b>{skill.name}</b><small>{title(skill.dimension)}{mapping.critical ? " · Critical" : ""}</small></span><select aria-label={`${skill.name} target proficiency`} value={mapping.targetLevel} onChange={(event) => updateSkillLink(mapping.skillId, { targetLevel: Number(event.target.value) as 1 | 2 | 3 | 4 })}>{proficiencyLevels.map((level) => <option key={level.id} value={level.id}>{level.id} · {level.name}</option>)}</select><span>{mapping.weight}%</span><button aria-label={`Remove ${skill.name} from profile`} onClick={() => updateSkillLink(mapping.skillId, "remove")}><Icons.trash/></button></div>; })}<button className="button secondary" disabled={!available} onClick={() => available && updateSkillLink(available.id, "add")}><Icons.plus/>Add core skill</button><div className="proficiency-rubric">{proficiencyLevels.map((level) => <div key={level.id}><b>{level.id}</b><span><strong>{level.name}</strong><small>{level.description}</small></span></div>)}</div></section>}{editing && <ProfileEditor profile={editing === "new" ? { id: "", title: "", jobFamily: "", purpose: "", status: "draft", skills: [], jobDescriptionId: workspace.jobDescriptions[0]?.id } : editing} workspace={workspace} onClose={() => setEditing(null)} onSave={saveProfile}/>} {action && profile && <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); applyAction(); }}><header><div><span className="section-kicker">PROFILE IMPACT & APPROVAL</span><h3>{title(action.action)} {profile.title}</h3></div><button type="button" aria-label="Close profile lifecycle action" onClick={() => setAction(null)}><Icons.close/></button></header><p>{impact?.dependencyCount || 0} dependencies are in scope, including {impact?.profileMappings.length || 0} mappings and {impact?.profileJobs.length || 0} source job descriptions. The operation remains working state until accountable release approval.</p>{["replace", "merge"].includes(action.action) && <label><span>Target profile</span><select required value={action.targetProfileId} onChange={(event) => setAction({ ...action, targetProfileId: event.target.value })}><option value="">Select governed target</option>{workspace.profiles.filter((item) => item.id !== profile.id && !["archived", "retired"].includes(item.status)).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}<label><span>Accountable actor</span><input required value={action.actor} onChange={(event) => setAction({ ...action, actor: event.target.value })}/></label><label><span>Governance reason</span><textarea required value={action.reason} onChange={(event) => setAction({ ...action, reason: event.target.value })}/></label><footer><button type="button" className="button secondary" onClick={() => setAction(null)}>Cancel</button><button className="button primary">Apply governed action</button></footer></form></div>}</div>;
}

function ProfileEditor({ profile, workspace, onClose, onSave }: { profile: RoleProfile; workspace: SkillWorkspace; onClose: () => void; onSave: (profile: RoleProfile, actor: string, reason: string) => void }) {
  const [value, setValue] = useState(profile);
  const [actor, setActor] = useState(""); const [reason, setReason] = useState("");
  const set = <K extends keyof RoleProfile>(key: K, next: RoleProfile[K]) => setValue((current) => ({ ...current, [key]: next }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(value, actor, reason); }}><header><div><span className="section-kicker">GOVERNED ROLE PROFILE</span><h2>{profile.id ? `Edit ${profile.title}` : "Create role profile"}</h2></div><button type="button" aria-label="Close role profile editor" onClick={onClose}><Icons.close/></button></header><div className="form-row"><label><span>Profile title</span><input required value={value.title} onChange={(event) => set("title", event.target.value)}/></label><label><span>Job family</span><input required value={value.jobFamily} onChange={(event) => set("jobFamily", event.target.value)}/></label></div><label><span>Profile purpose</span><textarea required value={value.purpose} onChange={(event) => set("purpose", event.target.value)}/></label><div className="form-row"><label><span>Source job description</span><select value={value.jobDescriptionId || ""} onChange={(event) => set("jobDescriptionId", event.target.value || undefined)}><option value="">No source selected</option>{workspace.jobDescriptions.filter((item) => item.status !== "archived").map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label><span>Working lifecycle</span><select value={value.status} onChange={(event) => set("status", event.target.value as RoleProfile["status"])}>{["draft", "in_review", "archived", "deprecated"].map((item) => <option key={item}>{item}</option>)}</select><small>Approval is recorded only through the review gate.</small></label></div><div className="form-row"><label><span>Accountable actor</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Governance reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)}/></label></div><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save governed profile</button></footer></form></div>;
}

function Review({ workspace, mutate }: { workspace: SkillWorkspace; mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void }) {
  const items = workspace.reviewQueue.filter((item) => item.status === "pending");
  const [decision, setDecision] = useState<{ id: string; action: "accepted" | "rejected" | "deferred" | "merged" } | null>(null);
  const [actor, setActor] = useState(""); const [reason, setReason] = useState(""); const [mergeTarget, setMergeTarget] = useState("");
  const [editingReview, setEditingReview] = useState<{ id: string; summary: string } | null>(null);
  const [reevaluateId, setReevaluateId] = useState<string | null>(null);
  function applyDecision() {
    if (!decision) return;
    try { mutate((current) => decideReview(current, decision.id, decision.action, actor, reason, mergeTarget || undefined)); setDecision(null); setActor(""); setReason(""); setMergeTarget(""); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Decision could not be recorded."); }
  }
  function editSuggestion(id: string) {
    const item = workspace.reviewQueue.find((candidate) => candidate.id === id); if (!item) return;
    setActor(""); setReason(""); setEditingReview({ id, summary: item.summary });
  }
  function applyReviewEdit() {
    if (!editingReview) return;
    const item = workspace.reviewQueue.find((candidate) => candidate.id === editingReview.id); if (!item) return;
    mutate((current) => recordGovernedVersion({ ...current, reviewQueue: current.reviewQueue.map((candidate) => candidate.id === editingReview.id ? { ...candidate, summary: editingReview.summary.trim() } : candidate) }, "review_item", editingReview.id, "review.edited", actor.trim(), { ...item, summary: editingReview.summary.trim(), governanceReason: reason.trim() }));
    setEditingReview(null); setActor(""); setReason("");
  }
  function reevaluate(id: string) { setActor(""); setReason(""); setReevaluateId(id); }
  function applyReevaluation() {
    if (!reevaluateId) return;
    const now = new Date().toISOString();
    mutate((current) => recordGovernedVersion({ ...current, agentRuns: [{ id: `RUN-REVIEW-${Date.now()}`, mode: "regression", status: "needs_review", startedAt: now, completedAt: now, model: "governed-agent", tools: ["syntax_validator", "granularity_validator", "taxonomy_search", "review_package_generator"], trace: [{ step: "Re-evaluation requested", result: `Review ${reevaluateId} remains pending; no approval state changed.` }], policyVersion: current.framework.version, promptVersion: current.framework.promptVersion }, ...current.agentRuns] }, "review_item", reevaluateId, "review.reevaluation_requested", actor.trim(), { governanceReason: reason.trim(), status: "pending", allowedTools: ["syntax_validator", "granularity_validator", "taxonomy_search", "review_package_generator"] }));
    setReevaluateId(null); setActor(""); setReason("");
  }
  function canMergeSuggestion(id: string) {
    const item = workspace.reviewQueue.find((candidate) => candidate.id === id);
    return item?.type === "new_skill" || item?.type === "duplicate";
  }
  if (editingReview) return <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); applyReviewEdit(); }}><header><div><span className="section-kicker">ACCOUNTABLE REVIEW EDIT</span><h3>Edit pending suggestion</h3></div><button type="button" onClick={() => setEditingReview(null)}><Icons.close/></button></header><label><span>Review summary</span><textarea required value={editingReview.summary} onChange={(event) => setEditingReview({ ...editingReview, summary: event.target.value })}/></label><label><span>Reviewer name</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Edit reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)}/></label><footer><button type="button" className="button secondary" onClick={() => setEditingReview(null)}>Cancel</button><button className="button primary">Save review edit</button></footer></form></div>;
  if (reevaluateId) return <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); applyReevaluation(); }}><header><div><span className="section-kicker">CONTROLLED RE-EVALUATION</span><h3>Re-evaluate pending suggestion</h3></div><button type="button" onClick={() => setReevaluateId(null)}><Icons.close/></button></header><p>The four allowlisted validators may add evidence, but the review remains pending and no approval state changes.</p><label><span>Reviewer name</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Re-evaluation reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)}/></label><footer><button type="button" className="button secondary" onClick={() => setReevaluateId(null)}>Cancel</button><button className="button primary">Request controlled re-evaluation</button></footer></form></div>;
  return <div className="review-layout"><section className="panel review-queue"><header><div><span className="section-kicker">HUMAN GOVERNANCE GATE</span><h3>{items.length} decisions pending</h3></div></header>{items.length === 0 && <div className="empty-state"><Icons.check/><b>Review queue is clear</b><span>New agent proposals will appear here.</span></div>}{items.map((item) => <article key={item.id}><header><span className="review-type">{title(item.type)}</span><b>{displayConfidence(item.confidence)}% confidence</b></header><h4>{item.title}</h4><p>{item.summary}</p><small><Icons.document/>{item.evidence}</small><small>{item.frameworkVersion || workspace.framework.version} · {item.rulesVersion || workspace.framework.rulesVersion}</small><footer className="review-actions"><button className="button ghost" onClick={() => setDecision({ id: item.id, action: "rejected" })}>Reject</button><button className="button ghost" onClick={() => setDecision({ id: item.id, action: "deferred" })}>Defer</button><button className="button ghost" onClick={() => editSuggestion(item.id)}>Edit</button><button className="button ghost" onClick={() => reevaluate(item.id)}>Re-evaluate</button>{canMergeSuggestion(item.id) && <button className="button ghost" onClick={() => setDecision({ id: item.id, action: "merged" })}>Merge</button>}<button className="button primary" onClick={() => setDecision({ id: item.id, action: "accepted" })}><Icons.check/>Approve</button></footer></article>)}</section><aside className="panel governance-checks"><span className="section-kicker">REVIEW CHECKLIST</span><h3>Before approval</h3>{["Atomic capability, not a task", "Action and outcome are observable", "No duplicate or overlapping meaning", "Taxonomy placement is coherent", "Dimension mapping is defensible", "Evidence and confidence are sufficient", "Proficiency can be demonstrated"].map((value) => <label key={value}><input type="checkbox"/><span>{value}</span></label>)}<p>The agent recommends; an accountable human approves. Every decision and reason is retained in immutable version history.</p></aside>{decision && <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); applyDecision(); }}><header><div><span className="section-kicker">ACCOUNTABLE DECISION</span><h3>{title(decision.action)} review item</h3></div><button type="button" onClick={() => setDecision(null)}><Icons.close/></button></header><label><span>Reviewer name</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Decision reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reference the evidence and governance rationale."/></label>{decision.action === "merged" && <label><span>Approved merge target</span><select required value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Select canonical skill</option>{workspace.skills.filter((skill) => skill.status === "approved").map((skill) => <option value={skill.id} key={skill.id}>{skill.name}</option>)}</select></label>}<footer><button type="button" className="button secondary" onClick={() => setDecision(null)}>Cancel</button><button className="button primary">Record decision</button></footer></form></div>}</div>;
}

function SkillEditor({ workspace, skill, onClose, onSave }: { workspace: SkillWorkspace; skill?: Skill; onClose: () => void; onSave: (values: SkillDraft, actor: string, reason: string, id?: string) => void }) {
  const [values, setValues] = useState<SkillDraft>(skill ? { name: skill.name, description: skill.description, groupId: skill.groupId, dimension: skill.dimension, kflaCompetencyId: skill.kflaCompetencyId || "", aliases: skill.aliases.join(", "), observability: skill.observability, futureRelevance: skill.futureRelevance, status: skill.status, action: skill.syntax?.action || "", object: skill.syntax?.object || "", outcome: skill.syntax?.outcome || "" } : emptySkill(workspace.groups[0]?.id || ""));
  const [actor, setActor] = useState(""); const [reason, setReason] = useState("");
  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal skill-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(values, actor, reason, skill?.id); }}><header><div><span className="section-kicker">CORE SKILL</span><h2>{skill ? `Edit ${skill.name}` : "Create governed skill"}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="form-row"><label><span>Canonical name</span><input required value={values.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Data Visualization"/></label><label><span>Skill group</span><select value={values.groupId} onChange={(event) => set("groupId", event.target.value)}>{workspace.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label></div><label><span>Definition</span><textarea required value={values.description} onChange={(event) => set("description", event.target.value)} placeholder="What durable capability does this represent?"/></label><div className="syntax-standard"><span>ACTION + OBJECT SYNTAX</span><div className="form-row"><label><span>Action</span><input required value={values.action} onChange={(event) => set("action", event.target.value)} placeholder="e.g. Visualise"/></label><label><span>Object</span><input required value={values.object} onChange={(event) => set("object", event.target.value)} placeholder="e.g. business data"/></label></div><label><span>Outcome qualifier</span><input value={values.outcome} onChange={(event) => set("outcome", event.target.value)} placeholder="e.g. to enable decision-making"/></label></div><label><span>Observable evidence</span><textarea required value={values.observability} onChange={(event) => set("observability", event.target.value)} placeholder="What would demonstrate the capability in real work?"/></label><div className="form-row"><label><span>Dimension</span><select value={values.dimension} onChange={(event) => set("dimension", event.target.value as SkillDimension)}>{["technical", "competency", "experience", "trait", "driver"].map((value) => <option value={value} key={value}>{title(value)}</option>)}</select></label>{values.dimension === "competency" && <label><span>KFLA mapping</span><select value={values.kflaCompetencyId} onChange={(event) => set("kflaCompetencyId", event.target.value)}><option value="">Select mapping</option>{workspace.kfla.filter((item) => item.enabled).map((item) => <option value={item.id} key={item.id}>{item.number}. {item.name}</option>)}</select></label>}</div><label><span>Aliases</span><input value={values.aliases} onChange={(event) => set("aliases", event.target.value)} placeholder="Comma-separated alternative labels"/></label><div className="form-row"><label><span>Future relevance</span><select value={values.futureRelevance} onChange={(event) => set("futureRelevance", event.target.value as SkillDraft["futureRelevance"])}>{["core", "emerging", "legacy"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Lifecycle</span><select value={values.status} onChange={(event) => set("status", event.target.value as Lifecycle)}>{["draft", "in_review", "approved", "retired"].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="form-row"><label><span>Accountable actor</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Governance reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)}/></label></div><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">{skill ? "Apply changes" : "Create skill"}</button></footer></form></div>;
}
