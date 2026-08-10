"use client";

import { useEffect, useMemo, useState } from "react";
import { Icons } from "./icons";
import type { PmoDocument } from "@/lib/pmo-schema";
import { migrateSkillWorkspace, type SkillWorkspace } from "@/lib/skill-schema";
import { bootstrapSkillWorkspace } from "@/lib/skill-fixtures";
import { loadSkillWorkspace } from "@/lib/skill-client";
import { approveSteercoSnapshot, generateSteercoDraft, publishSteercoSnapshot, rejectSteercoSnapshot, reviseSteercoSection, revokeSteercoShare, rollbackSteercoPublication } from "@/lib/steerco-client";
import { applySteercoApproval, applySteercoRagOverride, buildSteercoEvidence, rejectSteercoDraft, resolveSteercoPeriod, type SteercoClaim, type SteercoPeriod, type SteercoRag, type SteercoSnapshot } from "@/lib/steerco-schema";

const sectionLabels: Record<keyof SteercoSnapshot["sections"], string> = {
  milestones: "Milestones", deliverables: "Deliverables", risks: "Top risks & issues", decisions: "Decisions required",
  overdueActions: "Overdue actions", upcoming: "Upcoming milestones & meetings", framework: "Skill framework",
  taxonomy: "Taxonomy readiness", mappings: "Job-to-skill mapping", automation: "AI & workflow health",
  governance: "Governance & releases", changes: "Changes in period",
};
const presets: Array<{ value: SteercoPeriod["preset"]; label: string }> = [
  { value: "current_month", label: "Current month" }, { value: "previous_month", label: "Previous month" },
  { value: "since_last_steerco", label: "Since last SteerCo" }, { value: "project_phase", label: "Current project phase" },
  { value: "latest_approved", label: "Latest approved snapshot" }, { value: "custom", label: "Custom period" },
];

function isoToday() { return new Date().toISOString().slice(0, 10); }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : "Not available"; }
function typeLabel(kind: SteercoClaim["kind"]) { return kind.replaceAll("_", " "); }

export function SteercoWorkbench({ pmo, workspaceSecret }: { pmo: PmoDocument; workspaceSecret: string }) {
  const [skills, setSkills] = useState<SkillWorkspace>(bootstrapSkillWorkspace);
  const [preset, setPreset] = useState<SteercoPeriod["preset"]>("current_month");
  const initial = resolveSteercoPeriod("current_month", pmo);
  const [from, setFrom] = useState(initial.from); const [to, setTo] = useState(initial.to);
  const [actor, setActor] = useState("Florian Liepe");
  const [snapshot, setSnapshot] = useState<SteercoSnapshot | null>(null);
  const [approvalReason, setApprovalReason] = useState(""); const [expiresAt, setExpiresAt] = useState("");
  const [revisionInstruction, setRevisionInstruction] = useState(""); const [revisionSection, setRevisionSection] = useState("executiveSummary"); const [busy, setBusy] = useState(false);
  const [overrideRag, setOverrideRag] = useState<SteercoRag>("unknown"); const [overrideReason, setOverrideReason] = useState("");
  const [message, setMessage] = useState(""); const [error, setError] = useState("");

  useEffect(() => { let current = true; void loadSkillWorkspace(workspaceSecret).then((payload) => { if (current && payload.workspace) setSkills(migrateSkillWorkspace(payload.workspace, bootstrapSkillWorkspace)); }).catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "Skill evidence could not be loaded."); }); return () => { current = false; }; }, [workspaceSecret]);
  const period = useMemo(() => resolveSteercoPeriod(preset, pmo, new Date(), preset === "custom" ? { from, to } : undefined), [preset, pmo, from, to]);

  function changePreset(value: SteercoPeriod["preset"]) {
    setPreset(value); const resolved = resolveSteercoPeriod(value, pmo); setFrom(resolved.from); setTo(resolved.to); setSnapshot(null);
  }
  async function generate() {
    setBusy(true); setError(""); setMessage("");
    try {
      const evidence = buildSteercoEvidence(pmo, skills, period, actor.trim());
      const response = await generateSteercoDraft(workspaceSecret, evidence, pmo, skills, period, actor.trim());
      if (!response.snapshot) throw new Error("The AI workflow returned no structured SteerCo draft.");
      setSnapshot(response.snapshot); setMessage("Evidence-grounded AI draft generated. Human approval is still required.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "SteerCo draft generation failed."); }
    finally { setBusy(false); }
  }
  function editClaim(id: string, text: string) {
    if (!snapshot || snapshot.status !== "draft") return;
    setSnapshot({ ...snapshot, executiveSummary: snapshot.executiveSummary.map((item) => item.id === id ? { ...item, text, kind: "human_override" as const } : item) });
  }
  async function requestRevision() {
    if (!snapshot || !revisionInstruction.trim()) return;
    setBusy(true); setError("");
    try { const response = await reviseSteercoSection(workspaceSecret, snapshot, revisionSection, revisionInstruction, actor); if (!response.snapshot) throw new Error("The workflow returned no revised snapshot."); setSnapshot(response.snapshot); setRevisionInstruction(""); setMessage("AI revision received; approval remains pending."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "AI revision failed."); } finally { setBusy(false); }
  }
  async function approve() {
    if (!snapshot) return; setBusy(true); setError("");
    try {
      const currentSkills = await loadSkillWorkspace(workspaceSecret);
      const currentSkillRevision = currentSkills.workspace?.revision ?? skills.revision;
      if (snapshot.sourceRevision.pmo !== pmo.revision || snapshot.sourceRevision.skills !== currentSkillRevision) throw new Error("Source drift detected. Regenerate the report from the latest PMO and Skill Designer revisions before approval.");
      const locallyApproved = applySteercoApproval(snapshot, actor, approvalReason);
      const response = await approveSteercoSnapshot(workspaceSecret, locallyApproved, actor, approvalReason, snapshot.revision);
      setSnapshot(response.snapshot || locallyApproved); setMessage("SteerCo snapshot approved and locked for publication.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Approval failed."); } finally { setBusy(false); }
  }
  function overrideStatus() {
    if (!snapshot) return;
    try { setSnapshot(applySteercoRagOverride(snapshot, overrideRag, actor, overrideReason)); setOverrideReason(""); setMessage("RAG override recorded with accountable rationale."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "RAG override failed."); }
  }
  async function reject() {
    if (!snapshot) return; setBusy(true); setError("");
    try { const rejected = rejectSteercoDraft(snapshot, actor, approvalReason); const response = await rejectSteercoSnapshot(workspaceSecret, rejected, actor, approvalReason, snapshot.revision); setSnapshot(response.snapshot || rejected); setMessage("Draft rejected with an accountable reason. Generate a new revision to continue."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Rejection failed."); } finally { setBusy(false); }
  }
  async function publish() {
    if (!snapshot || snapshot.status !== "approved") return; setBusy(true); setError("");
    try { const currentSkills = await loadSkillWorkspace(workspaceSecret); const currentSkillRevision = currentSkills.workspace?.revision ?? skills.revision; if (snapshot.sourceRevision.pmo !== pmo.revision || snapshot.sourceRevision.skills !== currentSkillRevision) throw new Error("Source drift detected. Publication requires a newly generated and approved snapshot."); const response = await publishSteercoSnapshot(workspaceSecret, snapshot, expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : undefined); if (!response.snapshot) throw new Error("Publication returned no immutable snapshot receipt."); setSnapshot(response.snapshot); setMessage("Read-only SteerCo snapshot published."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Publication failed."); } finally { setBusy(false); }
  }
  async function revoke() {
    const shareId = snapshot?.publication.shareId; if (!snapshot || !shareId) return; const reason = window.prompt("Reason for revoking this read-only link"); if (!reason?.trim()) return;
    setBusy(true); setError(""); try { const response = await revokeSteercoShare(workspaceSecret, shareId, actor, reason); if (response.snapshot) setSnapshot(response.snapshot); setMessage("Read-only link revoked."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Revocation failed."); } finally { setBusy(false); }
  }
  async function rollback() {
    if (!snapshot) return;
    const revision = window.prompt("Immutable release revision to restore");
    const targetRevision = Number(revision);
    if (!Number.isInteger(targetRevision) || targetRevision < 1) return;
    const reason = window.prompt("Accountable reason for this rollback");
    if (!reason?.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await rollbackSteercoPublication(workspaceSecret, snapshot.id, targetRevision, actor, reason);
      if (!response.snapshot) throw new Error("Rollback returned no immutable publication receipt.");
      setSnapshot(response.snapshot); setMessage(`Revision ${targetRevision} restored as a new read-only publication.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rollback failed."); }
    finally { setBusy(false); }
  }
  async function copyLink() {
    const shareId = snapshot?.publication.shareId; if (!shareId) return;
    const link = `${window.location.origin}${window.location.pathname}?steerco=${encodeURIComponent(shareId)}`;
    await navigator.clipboard.writeText(link); setMessage("Read-only SteerCo link copied.");
  }

  return <div className="steerco-workbench">
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><Icons.close/></button></div>}
    {message && <div className="success-banner" role="status"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss message"><Icons.close/></button></div>}
    <section className="panel steerco-builder"><header><div><span className="section-kicker">GOVERNED REPORT GENERATION</span><h2>Prepare a Steering Committee view</h2><p>Select the evidence period, generate a grounded AI narrative, then approve and publish an immutable read-only snapshot.</p></div><span className={`steerco-state ${snapshot?.status || "not-started"}`}>{snapshot?.status.replaceAll("_", " ") || "Not generated"}</span></header>
      <div className="steerco-controls"><label><span>Reporting period</span><select value={preset} onChange={(event) => changePreset(event.target.value as SteercoPeriod["preset"])}>{presets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>From</span><input type="date" value={from} disabled={preset !== "custom"} onChange={(event) => { setFrom(event.target.value); setSnapshot(null); }}/></label><label><span>To</span><input type="date" value={to} disabled={preset !== "custom"} onChange={(event) => { setTo(event.target.value); setSnapshot(null); }}/></label><label><span>Accountable author</span><input value={actor} onChange={(event) => setActor(event.target.value)}/></label><button className="button primary" disabled={busy || !actor.trim() || from > to} onClick={() => void generate()}><Icons.spark/>{busy ? "Working…" : snapshot ? "Regenerate draft" : "Generate AI draft"}</button></div>
      <p className="period-note">{period.label} · {period.from} to {period.to}. Changing this period creates a new draft and never mutates an approved snapshot.</p>
    </section>
    {snapshot && <><SteercoReport snapshot={snapshot} editable={snapshot.status === "draft"} onEditClaim={editClaim}/>
      {snapshot.status === "draft" && <><section className="panel steerco-override"><div><span className="section-kicker">TRANSPARENT STATUS CONTROL</span><h3>Optional accountable RAG override</h3><p>The rule-derived status remains visible. An override requires an actor and evidence-based reason and is retained in the audit trail.</p></div><label><span>Effective RAG</span><select value={overrideRag} onChange={(event) => setOverrideRag(event.target.value as SteercoRag)}>{["green", "amber", "red", "unknown"].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Override reason</span><input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)}/></label><button className="button secondary" disabled={!overrideReason.trim()} onClick={overrideStatus}>Record override</button></section><section className="panel steerco-approval"><div><span className="section-kicker">HUMAN GOVERNANCE GATE</span><h3>Review and approve the AI draft</h3><p>AI narrative remains visibly identified. Verify every material claim against its linked source record before approval.</p></div><label><span>AI revision section</span><select value={revisionSection} onChange={(event) => setRevisionSection(event.target.value)}><option value="executiveSummary">Executive summary</option>{Object.entries(sectionLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><span>AI revision instruction</span><textarea value={revisionInstruction} onChange={(event) => setRevisionInstruction(event.target.value)} placeholder="Ask the agent to revise this section using only cited evidence."/><button className="button secondary" disabled={busy || !revisionInstruction.trim()} onClick={() => void requestRevision()}>Request AI revision</button></label><label><span>Decision reason</span><textarea value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} placeholder="Record evidence reviewed and governance rationale."/><div className="review-actions"><button className="button ghost" disabled={busy || !approvalReason.trim()} onClick={() => void reject()}>Reject draft</button><button className="button primary" disabled={busy || !approvalReason.trim()} onClick={() => void approve()}><Icons.check/>Approve snapshot</button></div></label></section></>}
      {snapshot.status === "rejected" && <section className="panel steerco-publish"><div><span className="section-kicker">DRAFT REJECTED</span><h3>Generate a new governed revision</h3><p>The rejected snapshot remains auditable and cannot be published. Update the reporting inputs or instructions, then regenerate.</p></div><button className="button primary" onClick={() => void generate()}>Generate new AI draft</button></section>}
      {snapshot.status === "approved" && <section className="panel steerco-publish"><div><span className="section-kicker">IMMUTABLE PUBLICATION</span><h3>Create scoped read-only link</h3><p>The n8n backend filters the approved snapshot to Steering Committee visibility. The share ID grants no mutation authority.</p></div><label><span>Optional expiry</span><input type="date" min={isoToday()} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}/></label><button className="button primary" disabled={busy} onClick={() => void publish()}><Icons.arrow/>Publish read-only snapshot</button></section>}
      {snapshot.status === "published" && <section className="panel steerco-share"><div><span className="section-kicker">READ-ONLY LINK ACTIVE</span><h3>Approved SteerCo view is ready</h3><p>Snapshot {snapshot.id} · checksum {snapshot.publication.checksum || "verified by publisher"}</p></div><button className="button primary" onClick={() => void copyLink()}>Copy read-only link</button><button className="button secondary" onClick={() => window.print()}>Print / Save as PDF</button><button className="button secondary" disabled={busy} onClick={() => void rollback()}>Restore prior release</button><button className="button ghost" disabled={busy} onClick={() => void revoke()}>Revoke link</button></section>}
    </>}
  </div>;
}

export function SteercoReadOnly({ snapshot }: { snapshot: SteercoSnapshot }) {
  return <main className="steerco-readonly"><header className="steerco-readonly-bar"><div><span className="dekra-mark">DEKRA</span><b>Steering Committee summary</b></div><div><span>View only</span><button className="button secondary" onClick={() => window.print()}>Print / Save as PDF</button></div></header><SteercoReport snapshot={snapshot} editable={false}/><footer>Immutable approved snapshot · No editing authority · Generated data is limited to SteerCo visibility.</footer></main>;
}

function SteercoReport({ snapshot, editable, onEditClaim }: { snapshot: SteercoSnapshot; editable: boolean; onEditClaim?: (id: string, text: string) => void }) {
  return <article className="steerco-report" aria-label="Steering Committee project summary">
    <header className="steerco-report-hero"><div><span className="section-kicker">STEERING COMMITTEE · {snapshot.period.label.toUpperCase()}</span><h2>Overall project status</h2><p>{formatDate(snapshot.period.from)} – {formatDate(snapshot.period.to)} · generated {formatDate(snapshot.generatedAt)}</p></div><div className={`steerco-rag ${snapshot.rag.effective}`}><span>OVERALL STATUS</span><b>{snapshot.rag.effective}</b><small>{snapshot.rag.override ? "Human override" : "Rule-derived"}</small></div></header>
    <section className="steerco-provenance"><span><b>Approval</b>{snapshot.status === "published" || snapshot.status === "approved" ? `${snapshot.approvedBy} · ${formatDate(snapshot.approvedAt)}` : "Pending"}</span><span><b>Data freshness</b>{snapshot.dataFreshness.stale ? "Stale — confirmation required" : `Synced ${formatDate(snapshot.dataFreshness.lastSynchronizedAt)}`}</span><span><b>Source revision</b>PMO {snapshot.sourceRevision.pmo} · Skills {snapshot.sourceRevision.skills}</span><span><b>AI contract</b>{snapshot.generatedWith.model} · {snapshot.generatedWith.promptVersion}</span></section>
    <section className="panel steerco-executive"><header><div><span className="section-kicker">AI-GENERATED · HUMAN-APPROVED AFTER REVIEW</span><h3>Executive summary</h3></div></header>{snapshot.executiveSummary.map((item) => <div className={`steerco-claim ${item.kind}`} key={item.id}>{editable ? <textarea aria-label={`Edit executive claim ${item.id}`} value={item.text} onChange={(event) => onEditClaim?.(item.id, event.target.value)}/> : <p>{item.text}</p>}<ClaimMeta claim={item}/></div>)}</section>
    <section className="steerco-signals"><header><h3>RAG contributors</h3><span>{snapshot.rag.signals.length} evidence-backed signal(s)</span></header>{snapshot.rag.signals.map((signal) => <article key={signal.id}><i className={signal.severity}/><div><b>{signal.label}</b><small>{signal.sourceIds.join(" · ")}</small></div></article>)}</section>
    <section className="steerco-section-grid">{(Object.keys(sectionLabels) as Array<keyof SteercoSnapshot["sections"]>).map((key) => <article className="panel" key={key}><header><span className="section-kicker">{key.replace(/([A-Z])/g, " $1").toUpperCase()}</span><h3>{sectionLabels[key]}</h3></header>{snapshot.sections[key].map((item) => <div className={`steerco-claim ${item.kind}`} key={item.id}><p>{item.text}</p><ClaimMeta claim={item}/></div>)}</article>)}</section>
  </article>;
}

function ClaimMeta({ claim }: { claim: SteercoClaim }) {
  return <small><span className={`claim-kind ${claim.kind}`}>{typeLabel(claim.kind)}</span>{claim.sourceIds.length ? claim.sourceIds.map((id) => <a href={`#source-${encodeURIComponent(id)}`} key={id}>{id}</a>) : <span>Confirmation required</span>}</small>;
}
