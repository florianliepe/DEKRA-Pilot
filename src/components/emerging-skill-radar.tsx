"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { buildEmergingSkillAnalysis, emergingSkillWeights, jobFamilyGroups, trendHeat, trendSignals, valueChainElements, type EmergingSkillCategory, type GapState, type TrendHorizon } from "@/lib/emerging-skill-radar";
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

export function EmergingSkillRadar({ workspace }: { workspace: SkillWorkspace }) {
  const [view, setView] = useState<View>("radar");
  const [horizon, setHorizon] = useState<TrendHorizon | "all">("all");
  const [category, setCategory] = useState<EmergingSkillCategory | "all">("all");
  const [gap, setGap] = useState<GapState | "all">("all");
  const analysis = useMemo(() => buildEmergingSkillAnalysis(workspace), [workspace]);
  const candidates = analysis.filter((item) => (horizon === "all" || item.horizon === horizon) && (category === "all" || item.category === category) && (gap === "all" || item.gapState === gap));
  const topWhiteSpots = analysis.filter((item) => item.gapState !== "covered").slice(0, 5);
  const sourceCount = new Set(trendSignals.map((trend) => trend.sourceUrl)).size;

  return <div className="emerging-radar-page">
    <section className="emerging-hero panel">
      <div><span className="section-kicker">DEKRA 2030+ · GOVERNED FORESIGHT</span><h2>Trends & emerging skills</h2><p>Connect external evidence to DEKRA&apos;s value chain, detect gaps in the governed skill catalogue and show which job profiles may need future capability. Agents suggest; experts validate; the governance board approves.</p></div>
      <div className="emerging-refresh"><b>Quarterly</b><span>+ event-driven</span><small>Evidence refresh cadence</small></div>
    </section>

    <section className="emerging-kpis">
      <article><span>ACTIVE SIGNALS</span><b>{trendSignals.length}</b><small>{sourceCount} authoritative sources</small></article>
      <article><span>WHITE SPOTS</span><b>{analysis.filter((item) => item.gapState === "white_spot").length}</b><small>candidate skills, not approvals</small></article>
      <article><span>PARTIAL MATCHES</span><b>{analysis.filter((item) => item.gapState === "partial").length}</b><small>review adapt / merge potential</small></article>
      <article><span>JOB EVIDENCE</span><b>{workspace.jobDescriptions.length || 285}</b><small>{workspace.jobDescriptions.length ? "workspace descriptions" : "Group 1 catalogue baseline"}</small></article>
    </section>

    <nav className="emerging-nav" aria-label="Emerging skill views">{views.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>

    {view === "radar" && <section className="emerging-layout">
      <article className="panel trend-radar"><header><div><span className="section-kicker">HORIZON VIEW</span><h3>DEKRA trend and innovation radar</h3><p>Position reflects time to impact. Priority combines strategy, urgency, value and catalogue need.</p></div><select aria-label="Trend horizon" value={horizon} onChange={(event) => setHorizon(event.target.value as TrendHorizon | "all")}><option value="all">All horizons</option><option value="now">Act now</option><option value="next">Prepare</option><option value="later">Explore</option></select></header>
        <div className="radar-rings" aria-label="Trend radar">
          {(["later", "next", "now"] as TrendHorizon[]).map((ring) => <div key={ring} className={`radar-ring ${ring}`}><b>{horizonLabel[ring]}</b>{trendSignals.filter((trend) => trend.horizon === ring && (horizon === "all" || trend.horizon === horizon)).map((trend) => <a key={trend.id} href={trend.sourceUrl} target="_blank" rel="noreferrer" style={{ "--size": `${18 + trend.valueImpact * 3}px` } as CSSProperties} title={`${trend.summary} Source: ${trend.sourceLabel}`}><span>{trend.title}</span><small>{trend.sourceLabel}</small></a>)}</div>)}
        </div>
      </article>
      <aside className="panel priority-list"><span className="section-kicker">TOP PRIORITIES</span><h3>Catalogue attention</h3>{topWhiteSpots.map((item) => <div key={item.id}><strong>{item.score}</strong><span><b>{item.name}</b><small>{item.category} · {gapLabel[item.gapState]}</small></span></div>)}<p>Priority is decision support—not an approval. Scores change when evidence, job coverage or catalogue matches change.</p></aside>
    </section>}

    {view === "heatmap" && <section className="panel emerging-panel"><header><div><span className="section-kicker">VALUE CREATION</span><h3>Trend-to-value-chain heatmap</h3><p>Darker cells indicate stronger combined strategic fit, urgency and value impact.</p></div></header><div className="emerging-heatmap"><div><b>Signal</b>{valueChainElements.map((element) => <b key={element}>{element}</b>)}</div>{trendSignals.map((trend) => <div key={trend.id}><span><b>{trend.title}</b><small>{horizonLabel[trend.horizon]}</small></span>{valueChainElements.map((element) => { const heat = trendHeat(trend, element); return <span key={element} className={heat ? "has-heat" : ""} style={{ "--heat": heat / 100 } as CSSProperties}>{heat || "—"}</span>; })}</div>)}</div></section>}

    {view === "gaps" && <section className="panel emerging-panel"><header><div><span className="section-kicker">GOVERNED CANDIDATE QUEUE</span><h3>Emerging skill white spots</h3><p>Deterministic catalogue comparison supports expert review. No candidate is added to the skill library from this view.</p></div><div className="emerging-filters"><select aria-label="Skill category" value={category} onChange={(event) => setCategory(event.target.value as EmergingSkillCategory | "all")}><option value="all">All categories</option><option value="technical">Technical</option><option value="functional">Functional</option><option value="behavioral">Behavioral</option></select><select aria-label="Gap state" value={gap} onChange={(event) => setGap(event.target.value as GapState | "all")}><option value="all">All gap states</option><option value="white_spot">White spots</option><option value="partial">Partial matches</option><option value="covered">Covered</option></select></div></header><div className="emerging-table"><div><b>Priority</b><b>Candidate</b><b>Category</b><b>Catalogue comparison</b><b>Role reach</b><b>Target</b></div>{candidates.map((item) => <div key={item.id}><strong>{item.score}</strong><span><b>{item.name}</b><small>{item.definition}</small></span><span className={`skill-category ${item.category}`}>{item.category}</span><span className={`gap-state ${item.gapState}`}><b>{gapLabel[item.gapState]}</b><small>{item.match ? `${item.match.name} · ${Math.round(item.match.similarity * 100)}% semantic overlap` : "No material catalogue match"}</small></span><span><b>{item.impactedRoleCount || item.jobFamilies.length}</b><small>{item.impactedRoleCount ? "current role descriptions" : "job families"}</small></span><span>L{item.targetLevel}<small>{horizonLabel[item.horizon]}</small></span></div>)}</div></section>}

    {view === "roles" && <section className="emerging-role-grid">
      <article className="panel emerging-panel"><header><div><span className="section-kicker">PILOT COVERAGE</span><h3>Job-family impact baseline</h3><p>Group 1 uses the supplied 285-role catalogue. Groups 2–3 are ready for the next role catalogues.</p></div></header>{jobFamilyGroups.map((group) => <section key={group.id} className="job-group"><header><b>{group.label}</b><span>{"catalogueRoles" in group ? `${group.catalogueRoles} supplied roles` : "catalogue pending"}</span></header><div>{group.families.map((family) => { const count = analysis.filter((candidate) => candidate.jobFamilies.includes(family) && candidate.gapState !== "covered").length; return <span key={family}><b>{family}</b><em>{count} emerging candidates</em></span>; })}</div></section>)}</article>
      <article className="panel emerging-panel"><header><div><span className="section-kicker">ROLE-LEVEL TRACE</span><h3>Current job descriptions</h3><p>Only stored, normalized job evidence is compared; the source description remains unchanged.</p></div></header>{workspace.jobDescriptions.length ? <div className="role-impact-list">{workspace.jobDescriptions.map((job) => { const matches = analysis.filter((candidate) => candidate.impactedRoles.includes(job.title)).slice(0, 5); return <section key={job.id}><span><b>{job.title}</b><small>{job.jobFamily}</small></span><div>{matches.length ? matches.map((candidate) => <em key={candidate.id}>{candidate.name} · {candidate.score}</em>) : <em>No material emerging candidate detected</em>}</div></section>; })}</div> : <div className="emerging-empty"><b>Role-level impact activates with governed job intake.</b><p>The Group 1 catalogue provides family-level coverage now. Ingesting its approved role descriptions will add evidence-linked candidate allocations; SAP SuccessFactors can enrich this comparison later.</p></div>}</article>
    </section>}

    {view === "method" && <section className="emerging-method-grid">
      <article className="panel emerging-panel"><header><div><span className="section-kicker">CONTROLLED AGENT CHAIN</span><h3>From signal to governed candidate</h3></div></header><ol className="agent-chain">{[
        ["01", "Screen", "Read allowlisted public sources; store source, date, claim and scope."], ["02", "Qualify", "Remove weak signals; score relevance to DEKRA strategy and value-chain elements."], ["03", "Compare", "Search the governed skill catalogue and role evidence for exact, partial and missing coverage."], ["04", "Draft", "Write a global, observable candidate and level expectation; never alter approved records."], ["05", "Review", "Functional SME validates; taxonomy steward checks MECE; governance board approves or rejects."],
      ].map(([number, title, copy]) => <li key={number}><b>{number}</b><span><strong>{title}</strong><small>{copy}</small></span></li>)}</ol></article>
      <article className="panel emerging-panel"><header><div><span className="section-kicker">PRIORITY INDEX</span><h3>Transparent scoring</h3></div></header><div className="score-formula">{Object.entries(emergingSkillWeights).map(([name, weight]) => <span key={name}><b>{Math.round(weight * 100)}%</b><small>{name.replace(/([A-Z])/g, " $1")}</small></span>)}</div><p className="method-note">All inputs use a 0–100 scale. Catalogue gap is highest for a white spot, lower for a partial match and minimal when covered. Reviewers see every component and can challenge evidence; agents cannot approve.</p></article>
      <article className="panel emerging-panel source-register"><header><div><span className="section-kicker">ALLOWLISTED SOURCES</span><h3>Current evidence register</h3></div></header>{trendSignals.map((trend) => <a key={trend.id} href={trend.sourceUrl} target="_blank" rel="noreferrer"><span><b>{trend.sourceLabel}</b><small>{trend.title}</small></span><em>Open source ↗</em></a>)}</article>
    </section>}
  </div>;
}
