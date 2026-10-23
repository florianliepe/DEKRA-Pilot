"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { buildEmergingSkillAnalysis, emergingSkillCandidates, emergingSkillWeights, jobFamilyGroups, trendHeat, trendSignals, valueChainElements, type EmergingSkillCategory, type EmergingSkillCandidate, type GapState, type TrendHorizon } from "@/lib/emerging-skill-radar";
import { getTrendAnalysisResult, getTrendAnalysisStatus, interruptTrendAnalysis, startTrendAnalysis } from "@/lib/emerging-skill-client";
import { candidateProficiencyLevels, isActiveTrendRun, isTerminalTrendRun, nextTrendPollDelay, trendRunStage, trendRunStorageKey, trendSnapshotStorageKey, type TrendAnalysisRun, type TrendAnalysisSnapshot } from "@/lib/emerging-skill-runtime";
import type { SkillWorkspace } from "@/lib/skill-schema";

type View = "radar" | "heatmap" | "gaps" | "roles" | "method";
const views: Array<{ id: View; label: string }> = [
  { id: "radar", label: "Trend radar" },
  { id: "heatmap", label: "Value-chain heatmap" },
  { id: "gaps", label: "Skill white spots" },
  { id: "roles", label: "Job-profile impact" },
  { id: "method", label: "Sources & method" },
];

const horizonLabel: Record<TrendHorizon, string> = { now: "Act now · 0–2 years", next: "Prepare · 2–5 years", later: "Explore · 5+ years" };
const gapLabel: Record<GapState, string> = { white_spot: "White spot", partial: "Partial match", covered: "Covered" };

const CONFIG_VERSION = "DEKRA-emerging-skills-1.1.0";

export function EmergingSkillRadar({ workspace, secret, onMessage, onError }: { workspace: SkillWorkspace; secret: string; onMessage: (message: string) => void; onError: (message: string) => void }) {
  const [view, setView] = useState<View>("radar");
  const [horizon, setHorizon] = useState<TrendHorizon | "all">("all");
  const [category, setCategory] = useState<EmergingSkillCategory | "all">("all");
  const [gap, setGap] = useState<GapState | "all">("all");
  const [run, setRun] = useState<TrendAnalysisRun | null>(null);
  const [snapshot, setSnapshot] = useState<TrendAnalysisSnapshot | null>(null);
  const [starting, setStarting] = useState(false);
  const [connectionDegraded, setConnectionDegraded] = useState(false);
  const [lastRunUpdate, setLastRunUpdate] = useState("");
  const resultLoadedFor = useRef("");
  const activeSignals = snapshot?.signals?.length ? snapshot.signals : trendSignals;
  const activeCandidates = snapshot?.candidates?.length ? snapshot.candidates : emergingSkillCandidates;
  const analysis = useMemo(() => buildEmergingSkillAnalysis(workspace, activeCandidates, activeSignals), [workspace, activeCandidates, activeSignals]);
  const candidates = analysis.filter((item) => (horizon === "all" || item.horizon === horizon) && (category === "all" || item.category === category) && (gap === "all" || item.gapState === gap));
  const topWhiteSpots = analysis.filter((item) => item.gapState !== "covered").slice(0, 5);
  const sourceCount = new Set(activeSignals.map((trend) => trend.sourceUrl)).size;

  function retainSnapshot(next: TrendAnalysisSnapshot) {
    setSnapshot(next);
    localStorage.setItem(trendSnapshotStorageKey, JSON.stringify(next));
  }

  async function loadCompletedResult(runId: string) {
    if (resultLoadedFor.current === runId) return;
    resultLoadedFor.current = runId;
    const payload = await getTrendAnalysisResult(secret, runId);
    if (!payload.snapshot) throw new Error("The completed trend run did not return a governed analysis snapshot.");
    retainSnapshot(payload.snapshot);
    onMessage(payload.message || `Trend snapshot ${payload.snapshot.version} is ready for human review.`);
  }

  async function startRun(retryOfRunId?: string) {
    setStarting(true); onError("");
    try {
      const runId = crypto.randomUUID();
      const now = new Date().toISOString();
      const optimistic: TrendAnalysisRun = {
        id: runId, mode: "trend_radar", status: "queued", stage: "Preparing allowlisted sources", progress: 5,
        startedAt: now, updatedAt: now, sourceCutoffAt: now, configVersion: CONFIG_VERSION,
        retryOfRunId, attempt: retryOfRunId ? (run?.attempt || 1) + 1 : 1,
      };
      setRun(optimistic);
      localStorage.setItem(trendRunStorageKey, runId);
      const payload = await startTrendAnalysis(secret, { runId, workspace, signals: activeSignals, candidates: activeCandidates, configVersion: CONFIG_VERSION, retryOfRunId });
      setRun(payload.trendRun || optimistic);
      setLastRunUpdate(new Date().toISOString());
      onMessage(payload.message || "Trend scan queued. It will continue in n8n if this page closes.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "The governed trend scan could not be started."); }
    finally { setStarting(false); }
  }

  async function interruptRun() {
    if (!run || !window.confirm("Interrupt this trend scan? Evidence and audit receipts remain available, but no completed snapshot will be created.")) return;
    try {
      const payload = await interruptTrendAnalysis(secret, run.id);
      setRun(payload.trendRun || { ...run, status: "interrupt_requested", interruptRequested: true, updatedAt: new Date().toISOString() });
      onMessage(payload.message || "Interruption requested. The run will stop at its next controlled checkpoint.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "The trend scan could not be interrupted."); }
  }

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      await Promise.resolve();
      try {
        const savedSnapshot = localStorage.getItem(trendSnapshotStorageKey);
        if (savedSnapshot && !cancelled) setSnapshot(JSON.parse(savedSnapshot) as TrendAnalysisSnapshot);
      } catch { localStorage.removeItem(trendSnapshotStorageKey); }
      const runId = localStorage.getItem(trendRunStorageKey);
      if (!runId) return;
      try {
        const payload = await getTrendAnalysisStatus(secret, runId);
        if (!cancelled) {
          setRun(payload.trendRun || null);
          setLastRunUpdate(new Date().toISOString());
          setConnectionDegraded(false);
          if (payload.trendRun?.status === "completed") await loadCompletedResult(runId);
        }
      } catch { if (!cancelled) setConnectionDegraded(true); }
    };
    void restore();
    return () => { cancelled = true; };
  // Restore only when the credential changes. loadCompletedResult is intentionally run-scoped.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  useEffect(() => {
    if (!run || !isActiveTrendRun(run)) return;
    let cancelled = false;
    let timer: number | undefined;
    let delay = 2_000;
    const poll = async () => {
      if (cancelled) return;
      if (document.hidden) { timer = window.setTimeout(poll, 2_000); return; }
      try {
        const payload = await getTrendAnalysisStatus(secret, run.id);
        if (cancelled) return;
        const next = payload.trendRun;
        if (!next) throw new Error("The trend status response did not contain a governed run record.");
        setRun(next); setLastRunUpdate(new Date().toISOString()); setConnectionDegraded(false);
        if (isTerminalTrendRun(next)) {
          localStorage.removeItem(trendRunStorageKey);
          if (next.status === "completed") await loadCompletedResult(next.id);
          return;
        }
        delay = nextTrendPollDelay(delay);
      } catch { setConnectionDegraded(true); delay = nextTrendPollDelay(delay); }
      timer = window.setTimeout(poll, delay);
    };
    timer = window.setTimeout(poll, delay);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  // The poll is bound to the current run id and status.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.status, secret]);

  return <div className="emerging-radar-page">
    <section className="emerging-hero panel">
      <div><span className="section-kicker">DEKRA 2030+ · GOVERNED FORESIGHT</span><h2>Trends & emerging skills</h2><p>Connect external evidence to DEKRA&apos;s value chain, detect gaps in the governed skill catalogue and show which job profiles may need future capability. Agents suggest; experts validate; the governance board approves.</p></div>
      <div className="emerging-run-controls">
        <div className="emerging-refresh"><b>{snapshot ? `Snapshot ${snapshot.version}` : "Quarterly"}</b><span>{snapshot ? new Date(snapshot.generatedAt).toLocaleDateString("en-GB") : "+ event-driven"}</span><small>{snapshot ? `Cutoff ${new Date(snapshot.sourceCutoffAt).toLocaleString("en-GB")}` : "Evidence refresh cadence"}</small></div>
        {isActiveTrendRun(run) ? <button className="button danger" disabled={run?.status === "interrupt_requested"} onClick={() => void interruptRun()}>Interrupt run</button>
          : run && ["failed", "interrupted", "stale"].includes(run.status) ? <button className="button primary" disabled={starting} onClick={() => void startRun(run.id)}>{starting ? "Queuing…" : "Retry run"}</button>
          : <button className="button primary" disabled={starting} onClick={() => void startRun()}>{starting ? "Queuing…" : snapshot ? "Re-run latest sources" : "Run trend scan"}</button>}
      </div>
    </section>

    {run && <section className={`panel emerging-run-status ${run.status}`} role="status"><div><span className="section-kicker">GOVERNED AGENT RUN</span><b>{trendRunStage(run)}</b><small>{run.status.replaceAll("_", " ")} · attempt {run.attempt} · {run.configVersion}</small></div><span className="progress-track"><i style={{ width: `${Math.max(0, Math.min(100, run.progress))}%` }}/></span><small>{run.warning || (connectionDegraded ? "Connection degraded — run continues in n8n" : `Last update ${lastRunUpdate ? new Date(lastRunUpdate).toLocaleTimeString("en-GB") : "pending"}`)} · source cutoff {new Date(run.sourceCutoffAt).toLocaleString("en-GB")}</small></section>}

    <section className="emerging-kpis">
      <article><span>ACTIVE SIGNALS</span><b>{activeSignals.length}</b><small>{sourceCount} authoritative sources</small></article>
      <article><span>WHITE SPOTS</span><b>{analysis.filter((item) => item.gapState === "white_spot").length}</b><small>candidate skills, not approvals</small></article>
      <article><span>PARTIAL MATCHES</span><b>{analysis.filter((item) => item.gapState === "partial").length}</b><small>review adapt / merge potential</small></article>
      <article><span>JOB EVIDENCE</span><b>{workspace.jobDescriptions.length || 285}</b><small>{workspace.jobDescriptions.length ? "workspace descriptions" : "Group 1 catalogue baseline"}</small></article>
    </section>

    <nav className="emerging-nav" aria-label="Emerging skill views">{views.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>

    {view === "radar" && <section className="emerging-layout">
      <article className="panel trend-radar"><header><div><span className="section-kicker">HORIZON VIEW</span><h3>DEKRA trend and innovation radar</h3><p>Position reflects time to impact. Priority combines strategy, urgency, value and catalogue need.</p></div><select aria-label="Trend horizon" value={horizon} onChange={(event) => setHorizon(event.target.value as TrendHorizon | "all")}><option value="all">All horizons</option><option value="now">Act now</option><option value="next">Prepare</option><option value="later">Explore</option></select></header>
        <div className="radar-rings" aria-label="Trend radar">
          {(["later", "next", "now"] as TrendHorizon[]).map((ring) => <div key={ring} className={`radar-ring ${ring}`}><b>{horizonLabel[ring]}</b>{activeSignals.filter((trend) => trend.horizon === ring && (horizon === "all" || trend.horizon === horizon)).map((trend) => <a key={trend.id} href={trend.sourceUrl} target="_blank" rel="noreferrer" style={{ "--size": `${18 + trend.valueImpact * 3}px` } as CSSProperties} title={`${trend.summary} Source: ${trend.sourceLabel}`}><span>{trend.title}</span><small>{trend.sourceLabel}</small></a>)}</div>)}
        </div>
      </article>
      <aside className="panel priority-list"><span className="section-kicker">TOP PRIORITIES</span><h3>Catalogue attention</h3>{topWhiteSpots.map((item) => <div key={item.id}><strong>{item.score}</strong><span><b>{item.name}</b><small>{item.category} · {gapLabel[item.gapState]}</small></span></div>)}<p>Priority is decision support—not an approval. Scores change when evidence, job coverage or catalogue matches change.</p></aside>
    </section>}

    {view === "heatmap" && <section className="panel emerging-panel"><header><div><span className="section-kicker">VALUE CREATION</span><h3>Trend-to-value-chain heatmap</h3><p>Darker cells indicate stronger combined strategic fit, urgency and value impact.</p></div></header><div className="emerging-heatmap"><div><b>Signal</b>{valueChainElements.map((element) => <b key={element}>{element}</b>)}</div>{activeSignals.map((trend) => <div key={trend.id}><span><b>{trend.title}</b><small>{horizonLabel[trend.horizon]}</small></span>{valueChainElements.map((element) => { const heat = trendHeat(trend, element); return <span key={element} className={heat ? "has-heat" : ""} style={{ "--heat": heat / 100 } as CSSProperties}>{heat || "—"}</span>; })}</div>)}</div></section>}

    {view === "gaps" && <section className="panel emerging-panel"><header><div><span className="section-kicker">GOVERNED CANDIDATE QUEUE</span><h3>Emerging skill white spots</h3><p>Deterministic catalogue comparison supports expert review. No candidate is added to the skill library from this view.</p></div><div className="emerging-filters"><select aria-label="Skill category" value={category} onChange={(event) => setCategory(event.target.value as EmergingSkillCategory | "all")}><option value="all">All categories</option><option value="technical">Technical</option><option value="functional">Functional</option><option value="behavioral">Behavioral</option></select><select aria-label="Gap state" value={gap} onChange={(event) => setGap(event.target.value as GapState | "all")}><option value="all">All gap states</option><option value="white_spot">White spots</option><option value="partial">Partial matches</option><option value="covered">Covered</option></select></div></header><div className="emerging-table"><div><b>Priority</b><b>Candidate</b><b>Category</b><b>Catalogue comparison</b><b>Role reach</b><b>Target proficiency</b></div>{candidates.map((item) => <div key={item.id}><strong>{item.score}</strong><span><b>{item.name}</b><small>{item.definition}</small></span><span className={`skill-category ${item.category}`}>{item.category}</span><span className={`gap-state ${item.gapState}`}><b>{gapLabel[item.gapState]}</b><small>{item.match ? `${item.match.name} · ${Math.round(item.match.similarity * 100)}% semantic overlap` : "No material catalogue match"}</small></span><span><b>{item.impactedRoleCount || item.jobFamilies.length}</b><small>{item.impactedRoleCount ? "current role descriptions" : "job families"}</small></span><CandidateLevelGuide candidate={item}/></div>)}</div></section>}

    {view === "roles" && <section className="emerging-role-grid">
      <article className="panel emerging-panel"><header><div><span className="section-kicker">PILOT COVERAGE</span><h3>Job-family impact baseline</h3><p>Group 1 uses the supplied 285-role catalogue. Groups 2–3 are ready for the next role catalogues.</p></div></header>{jobFamilyGroups.map((group) => <section key={group.id} className="job-group"><header><b>{group.label}</b><span>{"catalogueRoles" in group ? `${group.catalogueRoles} supplied roles` : "catalogue pending"}</span></header><div>{group.families.map((family) => { const count = analysis.filter((candidate) => candidate.jobFamilies.includes(family) && candidate.gapState !== "covered").length; return <span key={family}><b>{family}</b><em>{count} emerging candidates</em></span>; })}</div></section>)}</article>
      <article className="panel emerging-panel"><header><div><span className="section-kicker">ROLE-LEVEL TRACE</span><h3>Current job descriptions</h3><p>Only stored, normalized job evidence is compared; the source description remains unchanged.</p></div></header>{workspace.jobDescriptions.length ? <div className="role-impact-list">{workspace.jobDescriptions.map((job) => { const matches = analysis.filter((candidate) => candidate.impactedRoles.includes(job.title)).slice(0, 5); return <section key={job.id}><span><b>{job.title}</b><small>{job.jobFamily}</small></span><div>{matches.length ? matches.map((candidate) => <em key={candidate.id}>{candidate.name} · {candidate.score}</em>) : <em>No material emerging candidate detected</em>}</div></section>; })}</div> : <div className="emerging-empty"><b>Role-level impact activates with governed job intake.</b><p>The Group 1 catalogue provides family-level coverage now. Ingesting its approved role descriptions will add evidence-linked candidate allocations; SAP SuccessFactors can enrich this comparison later.</p></div>}</article>
    </section>}

    {view === "method" && <section className="emerging-method-grid">
      <article className="panel emerging-panel"><header><div><span className="section-kicker">CONTROLLED AGENT CHAIN</span><h3>From signal to governed candidate</h3></div></header><ol className="agent-chain">{[
        ["01", "Screen", "Read allowlisted public sources; store source, date, claim and scope."], ["02", "Qualify", "Remove weak signals; score relevance to DEKRA strategy and value-chain elements."], ["03", "Compare", "Search the governed skill catalogue and role evidence for exact, partial and missing coverage."], ["04", "Draft", "Write a global, observable candidate and level expectation; never alter approved records."], ["05", "Review", "Functional SME validates; taxonomy steward checks MECE; governance board approves or rejects."],
      ].map(([number, title, copy]) => <li key={number}><b>{number}</b><span><strong>{title}</strong><small>{copy}</small></span></li>)}</ol></article>
      <article className="panel emerging-panel"><header><div><span className="section-kicker">PRIORITY INDEX</span><h3>Transparent scoring</h3></div></header><div className="score-formula">{Object.entries(emergingSkillWeights).map(([name, weight]) => <span key={name}><b>{Math.round(weight * 100)}%</b><small>{name.replace(/([A-Z])/g, " $1")}</small></span>)}</div><p className="method-note">All inputs use a 0–100 scale. Catalogue gap is highest for a white spot, lower for a partial match and minimal when covered. Reviewers see every component and can challenge evidence; agents cannot approve.</p></article>
      <article className="panel emerging-panel source-register"><header><div><span className="section-kicker">ALLOWLISTED SOURCES</span><h3>Current evidence register</h3></div></header>{activeSignals.map((trend) => <a key={trend.id} href={trend.sourceUrl} target="_blank" rel="noreferrer"><span><b>{trend.sourceLabel}</b><small>{trend.title}</small></span><em>Open source ↗</em></a>)}</article>
    </section>}
  </div>;
}

function CandidateLevelGuide({ candidate }: { candidate: EmergingSkillCandidate }) {
  const levels = candidateProficiencyLevels(candidate);
  const target = levels.find((level) => level.level === candidate.targetLevel) || levels[0];
  return <details className="candidate-level-guide"><summary title={`${target.label}: ${target.levers["Knowledge & collaboration"]}`}>L{target.level} · {target.label}</summary><div>{levels.map((level) => <section key={level.level} className={level.level === candidate.targetLevel ? "target" : ""}><header><b>Level {level.level}</b><span>{level.label}{level.level === candidate.targetLevel ? " · proposed" : ""}</span></header>{Object.entries(level.levers).map(([lever, description]) => <p key={lever}><strong>{lever}</strong><small>{description}</small></p>)}</section>)}</div></details>;
}
