"use client";

import { useMemo, useState } from "react";
import { Icons } from "./icons";
import type { Deliverable, Meeting, PmoDocument, Rag, Risk } from "@/lib/pmo-schema";
import { ingestEvidence, loadPmoDocument, savePmoDocument } from "@/lib/n8n-client";
import { DeleteDialog, EntityEditor, type EditableEntity, type EditorTarget } from "./entity-editor";
import { IntakeWorkbench, type IntakeSubmission } from "./intake-workbench";

type View = "intake" | "overview" | "plan" | "risks" | "meetings" | "activity" | "method";
type IntakeType = "risk" | "deliverable" | "meeting";

const navigation: Array<{ id: View; label: string; icon: keyof typeof Icons }> = [
  { id: "intake", label: "Workbench intake", icon: "upload" },
  { id: "overview", label: "Executive overview", icon: "dashboard" },
  { id: "plan", label: "Plan & deliverables", icon: "plan" },
  { id: "risks", label: "Risks & issues", icon: "risk" },
  { id: "meetings", label: "Meeting hub", icon: "meeting" },
  { id: "activity", label: "Activity log", icon: "activity" },
  { id: "method", label: "Method studio", icon: "layers" },
];

const viewMeta: Record<View, { eyebrow: string; title: string; description: string }> = {
  intake: { eyebrow: "PMO workbench", title: "Ingest and orchestrate", description: "Convert project evidence into governed, reviewable updates." },
  overview: { eyebrow: "Control tower", title: "Executive overview", description: "One live view of delivery health, decisions and exposure." },
  plan: { eyebrow: "Delivery", title: "Plan & deliverables", description: "Track gate milestones and workstream commitments." },
  risks: { eyebrow: "RAID", title: "Risks & issues", description: "Prioritise exposure and keep mitigation ownership visible." },
  meetings: { eyebrow: "Collaboration", title: "Meeting hub", description: "Turn discussions into decisions, actions and evidence." },
  activity: { eyebrow: "Traceability", title: "Activity log", description: "A chronological audit trail across people and automations." },
  method: { eyebrow: "Next capability", title: "Method studio", description: "The extension point for skill design, taxonomy and mapping." },
};

function cx(...classes: Array<string | false | undefined>) { return classes.filter(Boolean).join(" "); }
const DISPLAY_TIME_ZONE = "Europe/Berlin";
function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(value: string, compact = false) {
  return new Intl.DateTimeFormat("en-GB", compact
    ? { day: "2-digit", month: "short", timeZone: DISPLAY_TIME_ZONE }
    : { day: "2-digit", month: "short", year: "numeric", timeZone: DISPLAY_TIME_ZONE })
    .format(new Date(`${value}T12:00:00Z`));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}
function datePart(value: string, part: "day" | "month") {
  return new Intl.DateTimeFormat("en", part === "day"
    ? { day: "numeric", timeZone: DISPLAY_TIME_ZONE }
    : { month: "short", timeZone: DISPLAY_TIME_ZONE })
    .format(new Date(`${value}T12:00:00Z`));
}
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function riskScore(risk: Risk) { return risk.probability * risk.impact; }
function relativeDay(value: string, anchor: string) {
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round((new Date(value).getTime() - new Date(anchor).getTime()) / 86_400_000), "day");
}

function BrandMark() {
  return <div className="brand-lockup" aria-label="DEKRA and Eraneos"><span className="dekra-mark">DEKRA</span><span className="brand-x">×</span><span className="eraneos-mark"><span className="eraneos-glyph"><i/><i/><i/></span><b>ERANEOS</b></span></div>;
}

function RagDot({ rag, label = true }: { rag: Rag; label?: boolean }) {
  return <span className={cx("rag", `rag-${rag}`)}><i />{label && titleCase(rag)}</span>;
}

function ProgressBar({ value, tone = "green" }: { value: number; tone?: Rag }) {
  return <div className="progress-track" aria-label={`${value}% complete`}><span className={`progress-${tone}`} style={{ width: `${value}%` }} /></div>;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "done" || status === "complete" ? "success" : status === "blocked" || status === "at_risk" ? "danger" : "neutral";
  return <span className={`status-pill status-${tone}`}>{titleCase(status)}</span>;
}

export default function ControlTower({ initialData }: { initialData: PmoDocument }) {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<PmoDocument | null>(initialData);
  const [source, setSource] = useState<"github" | "bootstrap">("bootstrap");
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [workspaceSecret, setWorkspaceSecret] = useState("");
  const [accessOpen, setAccessOpen] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ entity: Exclude<EditableEntity, "project">; id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowResult, setWorkflowResult] = useState("");
  const [dirty, setDirty] = useState(false);

  async function loadData(secret = workspaceSecret) {
    setLoading(true); setError("");
    try {
      const payload = await loadPmoDocument(secret);
      if (!payload.ok || !payload.document) throw new Error(payload.error || "Unable to load project data.");
      setData(payload.document); setSource(payload.source || "bootstrap"); setStorageConfigured(Boolean(payload.storageConfigured)); setDirty(false);
      setWorkspaceSecret(secret); setAccessOpen(false); setAccessError("");
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "Unable to load project data.";
      if (accessOpen) setAccessError(message); else setError(message);
    }
    finally { setLoading(false); }
  }

  function mutate(update: (current: PmoDocument) => PmoDocument) {
    setData((current) => current ? update(current) : current); setDirty(true);
  }

  async function publish() {
    if (!data) return;
    setSaving(true); setError("");
    try {
      const payload = await savePmoDocument(workspaceSecret, data);
      if (!payload.ok || !payload.document) throw new Error(payload.error || "Publish failed.");
      setData(payload.document); setSource("github"); setDirty(false); setPublishOpen(false);
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Publish failed."); }
    finally { setSaving(false); }
  }

  async function runWorkflowIntake({ meta, files, textUpdate }: IntakeSubmission) {
    setWorkflowSaving(true); setError(""); setWorkflowResult("");
    try {
      const payload = await ingestEvidence(workspaceSecret, meta, files, textUpdate);
      if (!payload.ok) throw new Error(payload.error || "Workflow intake failed.");
      const wpId = payload.wpId || "work package";
      const reviewCount = payload.needs_review?.length ?? 0;
      const refreshed = payload.document ? { ok: true, document: payload.document, source: "github" as const, storageConfigured: true } : await loadPmoDocument(workspaceSecret);
      if (refreshed.document) {
        setData(refreshed.document);
        setSource(refreshed.source || "github");
        setStorageConfigured(Boolean(refreshed.storageConfigured));
        setDirty(false);
      }
      const applied = payload.appliedChanges?.length ?? 0;
      setWorkflowResult(`${wpId} analysed by n8n${applied ? ` and applied as ${applied} workbench change${applied === 1 ? "" : "s"}` : ""}${reviewCount ? ` with ${reviewCount} review item${reviewCount === 1 ? "" : "s"}` : ""}.`);
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Workflow intake failed."); }
    finally { setWorkflowSaving(false); }
  }

  function addRecord(type: IntakeType, values: Record<string, string>) {
    if (!data) return;
    const stamp = new Date().toISOString();
    const id = `${type.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    mutate((current) => {
      const activity = [{ id: `ACT-${Date.now()}`, timestamp: stamp, type, actor: "PMO user", message: `Added ${values.title}.`, entityId: id }, ...current.activity];
      if (type === "risk") {
        const record: Risk = { id, title: values.title, description: values.description, probability: Number(values.probability), impact: Number(values.impact), state: "open", owner: values.owner, mitigation: values.mitigation, updatedAt: today() };
        return { ...current, risks: [record, ...current.risks], activity };
      }
      if (type === "deliverable") {
        const record: Deliverable = { id, title: values.title, workstream: values.workstream, dueDate: values.date, status: "not_started", owner: values.owner, progress: 0, priority: "P2" };
        return { ...current, deliverables: [record, ...current.deliverables], activity };
      }
      const record: Meeting = { id, title: values.title, date: values.date, type: "working_session", participants: values.participants.split(",").map((item) => item.trim()).filter(Boolean), summary: values.description, decisions: [], actions: [] };
      return { ...current, meetings: [record, ...current.meetings], activity };
    });
    setIntakeOpen(false);
  }

  function saveEntity(target: EditorTarget, values: Record<string, string>) {
    const prefix: Record<Exclude<EditableEntity, "project">, string> = { workstream: "WS", milestone: "M", deliverable: "DEL", risk: "R", meeting: "MTG" };
    const id = target.id || (target.entity === "project" ? data?.project.id : `${prefix[target.entity]}-${Date.now().toString().slice(-6)}`);
    const stamp = new Date().toISOString();
    mutate((current) => {
      const message = `${target.id || target.entity === "project" ? "Updated" : "Added"} ${values.title || values.name || target.entity}.`;
      const activity = [{ id: `ACT-${Date.now()}`, timestamp: stamp, type: "update" as const, actor: "PMO user", message, entityId: id }, ...current.activity];
      if (target.entity === "project") return { ...current, project: { ...current.project, name: values.name, subtitle: values.subtitle, phase: values.phase, startDate: values.startDate, endDate: values.endDate, overallRag: values.overallRag as Rag, progress: Math.max(0, Math.min(100, Number(values.progress))), updatedAt: stamp }, activity };
      if (target.entity === "workstream") {
        const record = { id: id!, name: values.name, shortName: values.shortName, owner: values.owner, progress: Math.max(0, Math.min(100, Number(values.progress))), rag: values.rag as Rag };
        return { ...current, workstreams: target.id ? current.workstreams.map((item) => item.id === target.id ? record : item) : [...current.workstreams, record], activity };
      }
      if (target.entity === "milestone") {
        const record = { id: id!, title: values.title, phase: values.phase, date: values.date, status: values.status as "upcoming" | "at_risk" | "complete", owner: values.owner, description: values.description };
        return { ...current, milestones: target.id ? current.milestones.map((item) => item.id === target.id ? record : item) : [...current.milestones, record], activity };
      }
      if (target.entity === "deliverable") {
        const record: Deliverable = { id: id!, title: values.title, workstream: values.workstream, dueDate: values.dueDate, status: values.status as Deliverable["status"], owner: values.owner, progress: Math.max(0, Math.min(100, Number(values.progress))), priority: values.priority as Deliverable["priority"] };
        return { ...current, deliverables: target.id ? current.deliverables.map((item) => item.id === target.id ? record : item) : [record, ...current.deliverables], activity };
      }
      if (target.entity === "risk") {
        const record: Risk = { id: id!, title: values.title, description: values.description, probability: Number(values.probability), impact: Number(values.impact), state: values.state as Risk["state"], owner: values.owner, mitigation: values.mitigation, updatedAt: today() };
        return { ...current, risks: target.id ? current.risks.map((item) => item.id === target.id ? record : item) : [record, ...current.risks], activity };
      }
      const actions = values.actions.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
        const [text, owner = "PMO Lead", dueDate = today()] = line.split("|").map((part) => part.trim());
        return { text, owner, dueDate };
      });
      const record: Meeting = { id: id!, title: values.title, date: values.date, type: values.type as Meeting["type"], participants: values.participants.split(",").map((item) => item.trim()).filter(Boolean), summary: values.summary, decisions: values.decisions.split("\n").map((item) => item.trim()).filter(Boolean), actions };
      return { ...current, meetings: target.id ? current.meetings.map((item) => item.id === target.id ? record : item) : [record, ...current.meetings], activity };
    });
    setEditor(null);
  }

  function deleteEntity(target: NonNullable<typeof deleteTarget>) {
    mutate((current) => {
      const key = target.entity === "workstream" ? "workstreams" : target.entity === "milestone" ? "milestones" : target.entity === "deliverable" ? "deliverables" : target.entity === "risk" ? "risks" : "meetings";
      const activity = [{ id: `ACT-${Date.now()}`, timestamp: new Date().toISOString(), type: "update" as const, actor: "PMO user", message: `Deleted ${target.label}.`, entityId: target.id }, ...current.activity];
      return { ...current, [key]: current[key].filter((item) => item.id !== target.id), activity };
    });
    setDeleteTarget(null);
  }

  const exposure = useMemo(() => data?.risks.filter((risk) => risk.state !== "closed").reduce((sum, risk) => sum + riskScore(risk), 0) ?? 0, [data]);
  const openActions = useMemo(() => data?.meetings.reduce((sum, meeting) => sum + meeting.actions.length, 0) ?? 0, [data]);
  const completedDeliverables = data?.deliverables.filter((item) => item.status === "done").length ?? 0;
  const query = search.trim().toLowerCase();

  if (loading) return <div className="app-loading"><BrandMark/><div className="loading-line"/><p>Connecting to the project control tower…</p></div>;
  if (!data) return <div className="app-loading"><BrandMark/><p>{error || "Project data is unavailable."}</p><button className="button primary" onClick={() => void loadData()}>Try again</button></div>;

  const meta = viewMeta[view];
  return (
    <div className="app-shell">
      <aside className={cx("sidebar", mobileNav && "sidebar-open")}>
        <div className="sidebar-head"><BrandMark/><button className="icon-button mobile-only" onClick={() => setMobileNav(false)} aria-label="Close navigation"><Icons.close/></button></div>
        <div className="project-switcher"><span className="project-monogram">SB</span><div><b>SBO Pilot</b><small>DEKRA · Global</small></div><Icons.chevron/></div>
        <nav aria-label="Primary navigation">
          <span className="nav-label">Project control</span>
          {navigation.map((item) => { const NavIcon = Icons[item.icon]; return <button key={item.id} className={cx("nav-item", view === item.id && "active")} onClick={() => { setView(item.id); setMobileNav(false); }}><NavIcon/><span>{item.label}</span>{item.id === "risks" && <em>{data.risks.filter((risk) => risk.state !== "closed").length}</em>}</button>; })}
        </nav>
        <div className="sidebar-roadmap"><span>UP NEXT</span><b>Skill design workspace</b><p>Interview-led skill design, taxonomy and job mapping.</p><button onClick={() => setView("method")}>View architecture <Icons.arrow/></button></div>
        <div className="sidebar-foot"><span className="user-avatar">FL</span><div><b>Florian Liepe</b><small>Programme workspace</small></div><span className="online-dot"/></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Icons.menu/></button><div className="search-box"><Icons.search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search risks, deliverables, meetings…" aria-label="Search project"/><kbd>⌘ K</kbd></div><div className="top-actions"><button className="sync-state" onClick={() => void loadData()}><span className={source === "github" ? "sync-live" : "sync-seed"}/>{source === "github" ? "GitHub live" : "Starter data"}<Icons.refresh/></button><button className="button secondary" onClick={() => setView("intake")}><span className="n8n-button-mark">n8n</span>Workbench intake</button><button className="button secondary" onClick={() => setPublishOpen(true)} disabled={!dirty}><Icons.github/>{dirty ? "Publish changes" : "All changes saved"}</button><button className="button primary" onClick={() => setIntakeOpen(true)}><Icons.plus/>Quick add</button></div></header>

        <div className="content-wrap">
          {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}><Icons.close/></button></div>}
          {workflowResult && view !== "intake" && <div className="success-banner"><span>{workflowResult}</span><button onClick={() => setWorkflowResult("")}><Icons.close/></button></div>}
          <div className="page-heading"><div><span className="eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.description}</p></div><div className="heading-meta"><span>Last synced</span><b>{formatDateTime(data.project.updatedAt)}</b></div></div>

          {view === "intake" && <IntakeWorkbench saving={workflowSaving} result={workflowResult} onRun={(submission) => void runWorkflowIntake(submission)}/>}
          {view === "overview" && <Overview data={data} exposure={exposure} openActions={openActions} completedDeliverables={completedDeliverables} setView={setView} onEdit={setEditor} onDelete={(entity, id, label) => setDeleteTarget({ entity, id, label })}/>}
          {view === "plan" && <PlanView data={data} query={query} mutate={mutate} onEdit={setEditor} onDelete={(entity, id, label) => setDeleteTarget({ entity, id, label })}/>}
          {view === "risks" && <RiskView data={data} query={query} onEdit={setEditor} onDelete={(entity, id, label) => setDeleteTarget({ entity, id, label })}/>}
          {view === "meetings" && <MeetingView data={data} query={query} onEdit={setEditor} onDelete={(entity, id, label) => setDeleteTarget({ entity, id, label })}/>}
          {view === "activity" && <ActivityView data={data} storageConfigured={storageConfigured}/>} 
          {view === "method" && <MethodStudio/>}
        </div>
      </main>

      {intakeOpen && <UpdateDialog onClose={() => setIntakeOpen(false)} onSubmit={addRecord} workstreams={data.workstreams.map((item) => ({ id: item.id, name: item.shortName }))}/>} 
      {publishOpen && <PublishDialog saving={saving} revision={data.revision} onClose={() => setPublishOpen(false)} onPublish={publish}/>} 
      {editor && <EntityEditor target={editor} data={data} onClose={() => setEditor(null)} onSave={saveEntity}/>}
      {deleteTarget && <DeleteDialog label={deleteTarget.label} onClose={() => setDeleteTarget(null)} onDelete={() => deleteEntity(deleteTarget)}/>}
      {accessOpen && <AccessDialog loading={loading} error={accessError} onUnlock={(secret) => void loadData(secret)}/>}
    </div>
  );
}

function Overview({ data, exposure, openActions, completedDeliverables, setView, onEdit, onDelete }: { data: PmoDocument; exposure: number; openActions: number; completedDeliverables: number; setView: (view: View) => void; onEdit: (target: EditorTarget) => void; onDelete: (entity: "workstream", id: string, label: string) => void }) {
  const highRisks = [...data.risks].filter((risk) => risk.state !== "closed").sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 3);
  const upcoming = [...data.milestones].filter((item) => item.status !== "complete").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const nextGate = upcoming[0];
  return <>
    <section className="project-hero"><div><div className="hero-top"><RagDot rag={data.project.overallRag}/><span>Revision {data.revision}</span></div><h2>{data.project.name}</h2><p>{data.project.subtitle} · {data.project.phase}</p><button className="hero-edit" onClick={() => onEdit({ entity: "project", id: data.project.id })}><Icons.edit/>Edit project profile</button></div><div className="hero-progress"><div><b>{data.project.progress}%</b><span>overall progress</span></div><ProgressBar value={data.project.progress} tone={data.project.overallRag}/><small>{formatDate(data.project.startDate)} — {formatDate(data.project.endDate)}</small></div></section>
    <section className="metric-grid">
      <article className="metric-card"><span>DELIVERY PROGRESS</span><div><strong>{data.project.progress}%</strong><em className="trend good">+7 pts</em></div><ProgressBar value={data.project.progress}/><small>{completedDeliverables} of {data.deliverables.length} deliverables completed</small></article>
      <article className="metric-card"><span>ACTIVE EXPOSURE</span><div><strong>{exposure}</strong><em className="trend warn">{highRisks.length} high</em></div><div className="mini-bars">{data.risks.map((risk) => <i key={risk.id} style={{ height: `${Math.max(18, riskScore(risk) * 3.3)}%` }} className={riskScore(risk) >= 16 ? "bar-red" : riskScore(risk) >= 10 ? "bar-amber" : "bar-green"}/>)}</div><small>Weighted probability × impact</small></article>
      <article className="metric-card"><span>NEXT GATE</span><div><strong>{nextGate ? formatDate(nextGate.date, true) : "TBC"}</strong><em className="trend warn">{nextGate ? (nextGate.status === "at_risk" ? "At risk" : "On track") : "No gate"}</em></div><b className="metric-title">{nextGate?.title || "No upcoming gate"}</b><small>{nextGate?.owner || "Add a milestone to the plan"}</small></article>
      <article className="metric-card"><span>OPEN ACTIONS</span><div><strong>{openActions}</strong><em className="trend neutral">Across {data.meetings.length} meetings</em></div><b className="metric-title">Decision velocity</b><small>{data.meetings.reduce((sum, item) => sum + item.decisions.length, 0)} decisions captured</small></article>
    </section>
    <section className="dashboard-grid">
      <article className="panel workstream-panel"><div className="panel-head"><div><span className="section-kicker">DELIVERY HEALTH</span><h3>Workstream pulse</h3></div><div className="panel-actions"><button onClick={() => onEdit({ entity: "workstream" })}><Icons.plus/>Add</button><button onClick={() => setView("plan")}>Open plan <Icons.arrow/></button></div></div><div className="workstream-list">{data.workstreams.map((item) => <div className="workstream-row" key={item.id}><span className={`ws-icon ws-${item.id.toLowerCase()}`}>{item.id.slice(2)}</span><div className="ws-copy"><div><b>{item.shortName}</b><span>{item.owner}</span></div><ProgressBar value={item.progress} tone={item.rag}/></div><strong>{item.progress}%</strong><RagDot rag={item.rag} label={false}/><span className="record-actions"><button onClick={() => onEdit({ entity: "workstream", id: item.id })} aria-label={`Edit ${item.shortName}`}><Icons.edit/></button><button onClick={() => onDelete("workstream", item.id, item.shortName)} aria-label={`Delete ${item.shortName}`}><Icons.trash/></button></span></div>)}</div></article>
      <article className="panel milestones-panel"><div className="panel-head"><div><span className="section-kicker">CRITICAL PATH</span><h3>Upcoming gates</h3></div><button onClick={() => setView("plan")}>View all <Icons.arrow/></button></div><div className="milestone-list">{upcoming.map((item, index) => <div className="milestone-row" key={item.id}><div className={cx("date-tile", item.status === "at_risk" && "date-risk")}><b>{datePart(item.date, "day")}</b><span>{datePart(item.date, "month")}</span></div><div><span>{item.id} · {item.phase}</span><b>{item.title}</b><small>{item.description}</small></div>{index === 0 && <StatusPill status={item.status}/>}</div>)}</div></article>
      <article className="panel risk-panel"><div className="panel-head"><div><span className="section-kicker">ATTENTION REQUIRED</span><h3>Top exposure</h3></div><button onClick={() => setView("risks")}>Risk register <Icons.arrow/></button></div><div className="risk-list">{highRisks.map((risk) => <div className="risk-row" key={risk.id}><span className={cx("risk-score", riskScore(risk) >= 16 && "critical")}>{riskScore(risk)}</span><div><b>{risk.title}</b><span>{risk.owner} · {titleCase(risk.state)}</span></div><Icons.chevron/></div>)}</div></article>
      <article className="panel activity-panel"><div className="panel-head"><div><span className="section-kicker">LATEST SIGNALS</span><h3>Live activity</h3></div><button onClick={() => setView("activity")}>Full log <Icons.arrow/></button></div><div className="activity-list compact">{data.activity.slice(0, 4).map((item) => <div className="activity-row" key={item.id}><span className={`activity-icon activity-${item.type}`}>{item.type === "automation" ? "AI" : item.actor.split(" ").map((word) => word[0]).slice(0,2).join("")}</span><div><b>{item.message}</b><span>{item.actor} · {relativeDay(item.timestamp, data.project.updatedAt)}</span></div></div>)}</div></article>
    </section>
  </>;
}

function PlanView({ data, query, mutate, onEdit, onDelete }: { data: PmoDocument; query: string; mutate: (update: (current: PmoDocument) => PmoDocument) => void; onEdit: (target: EditorTarget) => void; onDelete: (entity: "milestone" | "deliverable", id: string, label: string) => void }) {
  const deliverables = data.deliverables.filter((item) => !query || `${item.title} ${item.owner} ${item.workstream}`.toLowerCase().includes(query));
  function advance(item: Deliverable) {
    const order: Deliverable["status"][] = ["not_started", "in_progress", "at_risk", "blocked", "done"];
    const next = order[Math.min(order.indexOf(item.status) + 1, order.length - 1)];
    mutate((current) => ({ ...current, deliverables: current.deliverables.map((record) => record.id === item.id ? { ...record, status: next, progress: next === "done" ? 100 : record.progress } : record), activity: [{ id: `ACT-${Date.now()}`, timestamp: new Date().toISOString(), type: "deliverable", actor: "PMO user", message: `Changed ${item.title} to ${titleCase(next)}.`, entityId: item.id }, ...current.activity] }));
  }
  return <div className="view-stack">
    <section className="panel"><div className="panel-head"><div><span className="section-kicker">16-WEEK ROADMAP</span><h3>Gate milestones</h3></div><div className="panel-actions"><span className="data-hint">Edit any gate or commitment</span><button onClick={() => onEdit({ entity: "milestone" })}><Icons.plus/>Add milestone</button></div></div><div className="timeline">{data.milestones.map((item, index) => <div className="timeline-item" key={item.id}><button className={cx("timeline-node", item.status === "complete" && "complete", item.status === "at_risk" && "at-risk")} onClick={() => onEdit({ entity: "milestone", id: item.id })} aria-label={`Edit ${item.title}`}>{item.status === "complete" ? <Icons.check/> : index + 1}</button><div><span>{item.id} · {formatDate(item.date)}</span><b>{item.title}</b><small>{item.phase}</small><button className="text-delete" onClick={() => onDelete("milestone", item.id, item.title)}>Delete</button></div></div>)}</div></section>
    <section className="panel table-panel"><div className="panel-head"><div><span className="section-kicker">COMMITMENTS</span><h3>Deliverable register</h3></div><div className="panel-actions"><span className="count-badge">{deliverables.length} items</span><button onClick={() => onEdit({ entity: "deliverable" })}><Icons.plus/>Add deliverable</button></div></div><div className="data-table"><div className="table-row table-head"><span>Deliverable</span><span>Workstream</span><span>Owner</span><span>Due</span><span>Progress</span><span>Status</span><span>Actions</span></div>{deliverables.map((item) => <div className="table-row" key={item.id}><span><small>{item.id} · {item.priority}</small><b>{item.title}</b></span><span>{data.workstreams.find((ws) => ws.id === item.workstream)?.shortName || item.workstream}</span><span>{item.owner}</span><span>{formatDate(item.dueDate, true)}</span><span className="table-progress"><ProgressBar value={item.progress}/><small>{item.progress}%</small></span><button onClick={() => advance(item)} aria-label={`Advance ${item.title}`}><StatusPill status={item.status}/></button><span className="record-actions"><button onClick={() => onEdit({ entity: "deliverable", id: item.id })} aria-label={`Edit ${item.title}`}><Icons.edit/></button><button onClick={() => onDelete("deliverable", item.id, item.title)} aria-label={`Delete ${item.title}`}><Icons.trash/></button></span></div>)}</div></section>
  </div>;
}

function RiskView({ data, query, onEdit, onDelete }: { data: PmoDocument; query: string; onEdit: (target: EditorTarget) => void; onDelete: (entity: "risk", id: string, label: string) => void }) {
  const risks = [...data.risks].filter((item) => !query || `${item.title} ${item.owner} ${item.mitigation}`.toLowerCase().includes(query)).sort((a, b) => riskScore(b) - riskScore(a));
  return <div className="risk-layout"><section className="panel matrix-panel"><div className="panel-head"><div><span className="section-kicker">PROBABILITY × IMPACT</span><h3>Exposure matrix</h3></div></div><div className="risk-matrix"><span className="axis-y">Probability</span>{[5,4,3,2,1].map((probability) => <div className="matrix-row" key={probability}><b>{probability}</b>{[1,2,3,4,5].map((impact) => { const cell = risks.filter((risk) => risk.probability === probability && risk.impact === impact); return <div className={cx("matrix-cell", impact * probability >= 16 ? "matrix-red" : impact * probability >= 10 ? "matrix-amber" : "matrix-green")} key={impact}>{cell.map((risk) => <button key={risk.id} title={risk.title} onClick={() => onEdit({ entity: "risk", id: risk.id })}>{risk.id.replace("R-", "")}</button>)}</div>; })}</div>)}<div className="axis-x"><span/><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><em>Impact</em></div></div></section><section className="panel risk-register"><div className="panel-head"><div><span className="section-kicker">REGISTER</span><h3>Prioritised risks</h3></div><div className="panel-actions"><span className="count-badge">{risks.length} open</span><button onClick={() => onEdit({ entity: "risk" })}><Icons.plus/>Add risk</button></div></div>{risks.map((risk) => <article className="risk-card" key={risk.id}><div className={cx("risk-score", riskScore(risk) >= 16 && "critical")}>{riskScore(risk)}</div><div><div className="risk-card-head"><span>{risk.id}</span><div className="risk-card-tools"><StatusPill status={risk.state}/><button onClick={() => onEdit({ entity: "risk", id: risk.id })} aria-label={`Edit ${risk.title}`}><Icons.edit/></button><button onClick={() => onDelete("risk", risk.id, risk.title)} aria-label={`Delete ${risk.title}`}><Icons.trash/></button></div></div><h4>{risk.title}</h4><p>{risk.description}</p><div className="mitigation"><b>Mitigation</b><span>{risk.mitigation}</span></div><footer><span>{risk.owner}</span><small>Updated {formatDate(risk.updatedAt, true)}</small></footer></div></article>)}</section></div>;
}

function MeetingView({ data, query, onEdit, onDelete }: { data: PmoDocument; query: string; onEdit: (target: EditorTarget) => void; onDelete: (entity: "meeting", id: string, label: string) => void }) {
  const meetings = data.meetings.filter((item) => !query || `${item.title} ${item.summary} ${item.decisions.join(" ")}`.toLowerCase().includes(query));
  return <div className="view-stack"><div className="view-toolbar"><div><b>{meetings.length} meeting records</b><span>Maintain summaries, decisions and actions in one place.</span></div><button className="button primary" onClick={() => onEdit({ entity: "meeting" })}><Icons.plus/>Add meeting</button></div><div className="meeting-grid">{meetings.map((meeting) => <article className="panel meeting-card" key={meeting.id}><header><div className="meeting-date"><b>{datePart(meeting.date, "day")}</b><span>{datePart(meeting.date, "month")}</span></div><div><span>{titleCase(meeting.type)}</span><h3>{meeting.title}</h3><small>{meeting.participants.join(" · ")}</small></div><div className="record-actions"><button onClick={() => onEdit({ entity: "meeting", id: meeting.id })} aria-label={`Edit ${meeting.title}`}><Icons.edit/></button><button onClick={() => onDelete("meeting", meeting.id, meeting.title)} aria-label={`Delete ${meeting.title}`}><Icons.trash/></button></div></header><p>{meeting.summary}</p><div className="meeting-evidence"><div><span>DECISIONS</span>{meeting.decisions.map((decision) => <p key={decision}><Icons.check/>{decision}</p>)}{meeting.decisions.length === 0 && <small>No decisions captured.</small>}</div><div><span>ACTIONS</span>{meeting.actions.map((action) => <p key={action.text}><i/><span><b>{action.text}</b><small>{action.owner} · {formatDate(action.dueDate, true)}</small></span></p>)}{meeting.actions.length === 0 && <small>No actions captured.</small>}</div></div></article>)}</div></div>;
}

function ActivityView({ data, storageConfigured }: { data: PmoDocument; storageConfigured: boolean }) {
  return <div className="activity-layout"><section className="panel"><div className="panel-head"><div><span className="section-kicker">AUDIT TRAIL</span><h3>Project activity</h3></div><span className="count-badge">Revision {data.revision}</span></div><div className="activity-list full">{data.activity.map((item) => <div className="activity-row" key={item.id}><span className={`activity-icon activity-${item.type}`}>{item.type === "automation" ? "AI" : item.actor.split(" ").map((word) => word[0]).slice(0,2).join("")}</span><div><b>{item.message}</b><span>{item.actor}{item.entityId ? ` · ${item.entityId}` : ""}</span></div><time>{formatDateTime(item.timestamp)}</time></div>)}</div></section><aside className="panel integration-panel"><div className="panel-head"><div><span className="section-kicker">PIPELINE</span><h3>Connected systems</h3></div></div><div className="integration"><Icons.github/><div><b>GitHub source of truth</b><span>{storageConfigured ? "Credentials configured" : "Awaiting runtime credentials"}</span></div><i className={storageConfigured ? "healthy" : "pending"}/></div><div className="integration"><span className="n8n-logo">n8n</span><div><b>PMO intake workflow</b><span>Webhook adapter ready</span></div><i className="healthy"/></div><div className="integration"><span className="ai-logo">AI</span><div><b>Canonical normalisation</b><span>n8n agent workflow</span></div><i className="healthy"/></div><p className="integration-note">Every published UI change creates a GitHub revision. Automated intake writes through the same canonical store.</p></aside></div>;
}

function MethodStudio() {
  const modules = [
    { step: "01", title: "Skill designer", status: "Next", copy: "Agent-led interviews across defined dimensions, with evidence and confidence capture.", tags: ["Interview", "Granularity", "Evidence"] },
    { step: "02", title: "Taxonomy framework", status: "Planned", copy: "Governed clusters, relationships, naming rules and lifecycle management.", tags: ["Clusters", "Ontology", "Governance"] },
    { step: "03", title: "Job-to-skill mapping", status: "Planned", copy: "Map validated skills to profiles, proficiency targets and coverage constraints.", tags: ["Profiles", "Proficiency", "Coverage"] },
    { step: "04", title: "Data ingestion", status: "Foundation", copy: "Structured files and workflow inputs normalised into canonical GitHub artifacts.", tags: ["n8n", "Validation", "GitHub"] },
  ];
  return <div className="method-view"><section className="method-hero"><span>MODULAR BY DESIGN</span><h2>From project control to skill architecture.</h2><p>The control tower is the operational shell. Each method module plugs into the same navigation, canonical data layer and audit stream.</p><div className="method-flow"><span>INPUT</span><i/><span>DESIGN</span><i/><span>GOVERN</span><i/><span>APPLY</span></div></section><section className="module-grid">{modules.map((module) => <article className="module-card" key={module.step}><header><span>{module.step}</span><em>{module.status}</em></header><h3>{module.title}</h3><p>{module.copy}</p><footer>{module.tags.map((tag) => <span key={tag}>{tag}</span>)}</footer></article>)}</section><section className="panel architecture-band"><div><span className="section-kicker">SHARED FOUNDATION</span><h3>One framework, one source of truth</h3></div><div className="architecture-nodes"><span>Responsive UI</span><Icons.arrow/><span>Validated API</span><Icons.arrow/><span>n8n workflows</span><Icons.arrow/><span>GitHub artifacts</span></div></section></div>;
}

function UpdateDialog({ onClose, onSubmit, workstreams }: { onClose: () => void; onSubmit: (type: IntakeType, values: Record<string, string>) => void; workstreams: Array<{ id: string; name: string }> }) {
  const [type, setType] = useState<IntakeType>("risk");
  const [values, setValues] = useState<Record<string, string>>({ title: "", description: "", owner: "", mitigation: "", probability: "3", impact: "3", date: today(), workstream: workstreams[0]?.id || "WS1", participants: "" });
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(type, values); }}><header><div><span className="section-kicker">QUICK CAPTURE</span><h2>Add project update</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="type-switch">{(["risk", "deliverable", "meeting"] as IntakeType[]).map((item) => <button type="button" className={type === item ? "active" : ""} onClick={() => setType(item)} key={item}>{titleCase(item)}</button>)}</div><label><span>Title</span><input required value={values.title} onChange={(event) => set("title", event.target.value)} placeholder={`New ${type} title`}/></label><div className="form-row"><label><span>Owner</span><input required value={values.owner} onChange={(event) => set("owner", event.target.value)} placeholder="Role or name"/></label>{type !== "risk" && <label><span>{type === "meeting" ? "Meeting date" : "Due date"}</span><input type="date" required value={values.date} onChange={(event) => set("date", event.target.value)}/></label>}</div>{type === "risk" && <><div className="form-row"><label><span>Probability</span><select value={values.probability} onChange={(event) => set("probability", event.target.value)}>{[1,2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select></label><label><span>Impact</span><select value={values.impact} onChange={(event) => set("impact", event.target.value)}>{[1,2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select></label></div><label><span>Mitigation</span><textarea required value={values.mitigation} onChange={(event) => set("mitigation", event.target.value)} placeholder="How will this exposure be reduced?"/></label></>}{type === "deliverable" && <label><span>Workstream</span><select value={values.workstream} onChange={(event) => set("workstream", event.target.value)}>{workstreams.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label>}{type === "meeting" && <label><span>Participants</span><input value={values.participants} onChange={(event) => set("participants", event.target.value)} placeholder="Comma-separated roles or names"/></label>}<label><span>{type === "meeting" ? "Summary" : "Description"}</span><textarea required value={values.description} onChange={(event) => set("description", event.target.value)} placeholder="Add concise, decision-useful context"/></label><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary"><Icons.plus/>Add to workspace</button></footer></form></div>;
}

function PublishDialog({ saving, revision, onClose, onPublish }: { saving: boolean; revision: number; onClose: () => void; onPublish: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal publish-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void onPublish(); }}><header><div><span className="section-kicker">GITHUB PUBLISH</span><h2>Create revision {revision + 1}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="publish-summary"><Icons.github/><div><b>knowledge/pmo/control-tower.json</b><span>Validated by n8n and committed to the private data repository.</span></div></div><p>Your pilot password remains in memory for this browser session and is sent only to the protected n8n workflow.</p><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Publishing…" : "Publish to GitHub"}</button></footer></form></div>;
}

function AccessDialog({ loading, error, onUnlock }: { loading: boolean; error: string; onUnlock: (secret: string) => void }) {
  const [secret, setSecret] = useState("");
  return <div className="modal-backdrop"><form className="modal publish-modal" onSubmit={(event) => { event.preventDefault(); onUnlock(secret); }}><header><div><span className="section-kicker">PILOT ACCESS</span><h2>Open the DEKRA control tower</h2></div></header><p>The interface is hosted on GitHub Pages. Project data remains behind the protected n8n workflow and a private GitHub repository.</p>{error && <div className="error-banner"><span>{error}</span></div>}<label><span>Shared pilot password</span><input type="password" autoFocus required value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="current-password"/><small>Kept in memory only. Refreshing or closing the page clears it.</small></label><footer><button className="button primary" disabled={loading}>{loading ? "Connecting…" : "Open workspace"}</button></footer></form></div>;
}
