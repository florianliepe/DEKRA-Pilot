"use client";

import { useState, type CSSProperties } from "react";
import { mappingPortfolioAnalytics } from "@/lib/mapping-portfolio-analytics";
import type { SkillWorkspace } from "@/lib/skill-schema";

type View = "coverage" | "roles" | "heatmap" | "redundancy" | "kfla" | "reuse" | "comparison";

const views: Array<[View, string]> = [
  ["coverage", "Coverage matrix"], ["roles", "Role comparison"], ["heatmap", "Domain heatmap"],
  ["redundancy", "Overlap"], ["kfla", "KFLA concentration"], ["reuse", "Reusable clusters"], ["comparison", "Proposed vs approved"],
];

export function MappingPortfolioAnalytics({ workspace, approvedWorkspace }: { workspace: SkillWorkspace; approvedWorkspace?: SkillWorkspace | null }) {
  const [view, setView] = useState<View>("coverage");
  const analysis = mappingPortfolioAnalytics(workspace, approvedWorkspace);
  const portfolioSkillIds = [...new Set(analysis.jobs.flatMap((job) => job.mappings.map((mapping) => mapping.skillId)))];
  const maxHeat = Math.max(1, ...analysis.domainHeatmap.flatMap((row) => row.cells.map((cell) => cell.count)));
  const skillName = (id: string) => workspace.skills.find((skill) => skill.id === id)?.name || id;
  const jobName = (id: string) => workspace.jobDescriptions.find((job) => job.id === id)?.title || id;
  const describeKey = (key: string) => {
    const [jobId, skillId] = key.split(":");
    return `${jobName(jobId)} · ${skillName(skillId)}`;
  };

  return <article className="panel mapping-portfolio">
    <header><div><span className="section-kicker">PORTFOLIO ASSURANCE</span><h3>Role architecture and mapping diagnostics</h3><p>One governed lens across evidence coverage, taxonomy placement, KFLA balance and release drift.</p></div><span className="portfolio-policy"><b>≤ 5 + ≤ 5</b><small>technical + behavioral · max 10</small></span></header>
    <nav aria-label="Mapping portfolio views">{views.map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}</nav>

    {view === "coverage" && <div className="portfolio-table coverage-matrix"><div style={{ gridTemplateColumns: `minmax(210px,1.5fr) repeat(${Math.max(1, portfolioSkillIds.length)},minmax(92px,1fr))` }}><b>Job / role</b>{portfolioSkillIds.map((id) => <b key={id} title={skillName(id)}>{skillName(id)}</b>)}</div>{analysis.jobs.map((job) => <div key={job.id} style={{ gridTemplateColumns: `minmax(210px,1.5fr) repeat(${Math.max(1, portfolioSkillIds.length)},minmax(92px,1fr))` }}><span><b>{job.title}</b><small>{job.coveredEvidence}/{job.materialEvidence} evidence · {job.gapEvidence.length} gaps · {job.overlapEvidence} overlaps</small></span>{portfolioSkillIds.map((id) => { const mapping = job.mappings.find((item) => item.skillId === id); return <span key={id} className={mapping ? "matrix-mapped" : "matrix-empty"} title={mapping ? `${mapping.status} · ${mapping.relevance}% fit · ${mapping.weight}% weight` : "Not mapped"}>{mapping ? `${mapping.relevance}%` : "—"}</span>; })}</div>)}</div>}

    {view === "roles" && <div className="role-matrix">{analysis.jobs.map((job) => <section key={job.id}><header><b>{job.title}</b><small>{job.materialEvidence ? Math.round(job.coveredEvidence / job.materialEvidence * 100) : 0}% evidence coverage</small></header><div><span><b>Technical · {job.technical.length}/5</b>{job.technical.map((mapping) => <em key={mapping.id}>{skillName(mapping.skillId)}</em>)}</span><span><b>Behavioral · {job.behavioral.length}/5</b>{job.behavioral.map((mapping) => <em key={mapping.id}>{skillName(mapping.skillId)}</em>)}</span></div></section>)}</div>}

    {view === "heatmap" && <div className="portfolio-table domain-heatmap"><div style={{ gridTemplateColumns: `minmax(180px,1.3fr) repeat(${Math.max(1, workspace.domains.length)},minmax(90px,1fr))` }}><b>Role</b>{workspace.domains.map((domain) => <b key={domain.id}>{domain.name}</b>)}</div>{analysis.domainHeatmap.map((row) => <div key={row.jobId} style={{ gridTemplateColumns: `minmax(180px,1.3fr) repeat(${Math.max(1, workspace.domains.length)},minmax(90px,1fr))` }}><span><b>{row.title}</b></span>{row.cells.map((cell) => <span key={cell.domainId} title={`${cell.count} mapped skills in ${cell.name}`} style={{ "--heat": cell.count / maxHeat } as CSSProperties}>{cell.count}</span>)}</div>)}</div>}

    {view === "redundancy" && <div className="diagnostic-list">{analysis.redundancy.length ? analysis.redundancy.map((item) => <section key={item.id}><span><b>{item.left}</b><i>{item.type}</i><b>{item.right}</b></span><p>{item.rationale}</p><small>{item.mappedRoles.length ? `Co-occurs in ${item.mappedRoles.join(" · ")}` : "Canonical synonym candidate; consolidate before role reuse."}</small></section>) : <Empty text="No governed synonym or co-occurring related-skill risks detected."/>}</div>}

    {view === "kfla" && <div className="kfla-concentration">{analysis.kflaConcentration.map((item) => <section key={item.id}><header><b>{item.name}</b><span>{item.count} mappings · {item.roles} roles</span></header><i><span style={{ width: `${analysis.jobs.length ? Math.min(100, item.roles / analysis.jobs.length * 100) : 0}%` }}/></i><small>{item.count ? "Mapped through approved behavioral competencies." : "Portfolio gap: no evidence-backed behavioral competency mapping."}</small></section>)}</div>}

    {view === "reuse" && <div className="diagnostic-list">{analysis.reusableSkills.length ? analysis.reusableSkills.map((item) => <section key={item.skillId}><span><b>{item.name}</b><i>{item.group}</i><strong>{item.roleCount} roles</strong></span><small>{item.jobIds.map(jobName).join(" · ")}</small></section>) : <Empty text="No core skill is reused across two mapped roles yet."/>}</div>}

    {view === "comparison" && <div className="release-comparison"><section><b>{analysis.comparison.proposed}</b><small>working mappings</small></section><section><b>{analysis.comparison.approved}</b><small>approved mappings</small></section><section><b>{analysis.comparison.added.length}</b><small>proposed additions</small></section><section><b>{analysis.comparison.removed.length}</b><small>approved links absent</small></section><div><List title="Proposed additions" items={analysis.comparison.added.map(describeKey)}/><List title="Unchanged" items={analysis.comparison.unchanged.map(describeKey)}/><List title="Absent from proposal" items={analysis.comparison.removed.map(describeKey)}/></div></div>}
  </article>;
}

function Empty({ text }: { text: string }) { return <p className="portfolio-empty">{text}</p>; }
function List({ title, items }: { title: string; items: string[] }) { return <section><b>{title}</b>{items.length ? items.map((item) => <span key={item}>{item}</span>) : <small>None</small>}</section>; }
