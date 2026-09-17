"use client";

import { useState } from "react";
import { analyseMappingProfile, mappingConfidenceInterval } from "@/lib/mapping-profile-quality";
import type { JobSkillMapping, SkillWorkspace } from "@/lib/skill-schema";

type Props = {
  workspace: SkillWorkspace;
  approvedWorkspace?: SkillWorkspace | null;
  selectedJobId?: string;
  onOpenMapping: (jobId: string) => void;
  onOpenProfiles: () => void;
};

export function JobProfileComparison({ workspace, approvedWorkspace, selectedJobId, onOpenMapping, onOpenProfiles }: Props) {
  const jobs = workspace.jobDescriptions.filter((item) => item.status !== "archived");
  const [chosenJobId, setChosenJobId] = useState("");
  const [chosenProfileId, setChosenProfileId] = useState("");
  const job = jobs.find((item) => item.id === (chosenJobId || selectedJobId)) || jobs[0];
  if (!job) return <section className="panel job-profile-empty"><h3>No job descriptions yet</h3><p>Ingest a job description in Jobs & mapping to start the comparison.</p></section>;

  const profiles = workspace.profiles.filter((item) => item.jobDescriptionId === job.id && !["archived", "retired"].includes(item.status));
  const profile = profiles.find((item) => item.id === chosenProfileId) || profiles[0];
  const allMappings = workspace.mappings.filter((item) => item.jobDescriptionId === job.id);
  const activeMappings = allMappings.filter((item) => !["rejected", "deferred"].includes(item.status));
  const quality = analyseMappingProfile(job, activeMappings, workspace);
  const approvedMappings = approvedWorkspace?.mappings.filter((item) => item.jobDescriptionId === job.id && item.status === "approved") || [];
  const skillName = (id: string) => workspace.skills.find((item) => item.id === id)?.name || id;
  const evidence = job.evidenceSegments.filter((item) => ["responsibility", "outcome"].includes(item.normalizedType));
  const owners = (id: string) => activeMappings.filter((item) => item.evidenceRefs?.includes(id));
  const profileSkills = profile?.skills || [];
  const profileOnly = profileSkills.filter((item) => !activeMappings.some((mapping) => mapping.skillId === item.skillId));
  const mappingOnly = activeMappings.filter((mapping) => !profileSkills.some((item) => item.skillId === mapping.skillId));
  const approvedKeys = new Set(approvedMappings.map((item) => item.skillId));
  const selectedMappings = [...activeMappings].sort((a, b) => b.weight - a.weight);

  return <div className="job-profile-comparison">
    <section className="panel job-profile-heading">
      <div><span className="section-kicker">JOB ↔ SKILL PROFILE</span><h2>Compare source role and governed capability</h2><p>This view joins the stored job, evidence-linked mappings and the role profile. It never approves or publishes changes.</p></div>
      <div className="job-profile-controls"><label>Job description<select aria-label="Compare job description" value={job.id} onChange={(event) => { setChosenJobId(event.target.value); setChosenProfileId(""); }}>
        {jobs.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}
      </select></label>{profiles.length > 1 && <label>Linked profile<select aria-label="Compare linked profile" value={profile?.id || ""} onChange={(event) => setChosenProfileId(event.target.value)}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></label>}</div>
    </section>
    <section className="job-profile-summary" aria-label="Job profile relationship summary">
      <div><b>{job.id}</b><small>job · v{job.version} · {job.status}</small></div><div><b>{activeMappings.length}/10</b><small>proposed core mappings</small></div><div><b>{profile?.id || "Not linked"}</b><small>stored role profile · {profile?.status || "missing"}</small></div><div><b>{quality.coveredEvidence.length}/{quality.evidenceUniverse.length}</b><small>exclusive evidence owners</small></div>
    </section>
    <div className="job-profile-columns">
      <section className="panel"><header><span className="section-kicker">NORMALIZED JOB DESCRIPTION</span><h3>{job.title}</h3><small>{job.jobFamily} · {job.country} · {job.language} · {job.sourceFiles.length} source file(s)</small></header><p>{job.purpose || "No role purpose has been normalized yet."}</p><div className="job-profile-evidence">{evidence.length ? evidence.map((segment) => { const linked = owners(segment.id); return <article key={segment.id} className={linked.length === 1 ? "covered" : "gap"}><span>{segment.normalizedType} · {segment.id} · {Math.round(segment.confidence <= 1 ? segment.confidence * 100 : segment.confidence)}%</span><b>{segment.normalizedValue}</b><small>{segment.sourceName} · {segment.location}</small><em>{linked.length === 1 ? `Primary owner: ${skillName(linked[0].skillId)}` : linked.length ? `${linked.length} owners · overlap` : "No mapped skill · gap"}</em></article>; }) : <p>No normalized responsibility or outcome evidence yet.</p>}</div><details><summary>Other normalized role context</summary><p><b>Activities:</b> {job.activities.join(" · ") || "None recorded"}</p><p><b>Tools:</b> {job.tools.join(" · ") || "None recorded"}</p><p><b>Qualifications:</b> {job.qualifications.join(" · ") || "None recorded"}</p><p><b>Constraints:</b> {job.constraints.join(" · ") || "None recorded"}</p></details></section>
      <section className="panel"><header><span className="section-kicker">SKILL PROFILE</span><h3>{profile?.title || "No linked role profile"}</h3><small>{profile ? `${profile.id} · ${profile.status}` : "The job-to-skill proposal still appears below; no stored profile is linked."}</small></header><p>{profile?.purpose || "The current mapping proposal is the provisional skill profile until a governed role profile is created and linked."}</p><div className="job-profile-skill-list">{selectedMappings.length ? selectedMappings.map((mapping) => <SkillLine key={mapping.id} mapping={mapping} workspace={workspace} inProfile={profileSkills.some((item) => item.skillId === mapping.skillId)} approved={approvedKeys.has(mapping.skillId)}/>) : <p>No active mappings yet. Run governed mapping from Jobs & mapping.</p>}</div><p className="job-profile-cap">{quality.technicalCount}/5 technical · {quality.behavioralCount}/5 behavioral · {quality.totalWeight}% weight · {quality.readyForReview ? "review ready" : "review blocked"}</p></section>
    </div>
    <section className="panel job-profile-diagnostics"><header><span className="section-kicker">RECONCILIATION & NEXT ACTION</span><h3>What needs a decision?</h3></header>{!profile && <p>No role profile has <code>jobDescriptionId = {job.id}</code>. Create or link one in Role profiles; the mapping proposal remains available here.</p>}{profileOnly.length > 0 && <p>Profile-only skills without an active job mapping: {profileOnly.map((item) => skillName(item.skillId)).join(", ")}.</p>}{mappingOnly.length > 0 && profile && <p>Mapped skills absent from the stored profile: {mappingOnly.map((item) => skillName(item.skillId)).join(", ")}.</p>}{quality.findings.map((item) => <p key={item}>{item}</p>)}{!quality.findings.length && profile && !profileOnly.length && !mappingOnly.length && <p>The active mappings and stored profile are aligned; human approval still controls publication.</p>}<p>Approved baseline: {approvedMappings.length} mapping(s). Proposed changes remain working state until accountable review and release.</p><div className="record-actions"><button className="button primary" onClick={() => onOpenMapping(job.id)}>Open Jobs & mapping</button><button className="button secondary" onClick={onOpenProfiles}>Open Role profiles</button></div></section>
  </div>;
}

function SkillLine({ mapping, workspace, inProfile, approved }: { mapping: JobSkillMapping; workspace: SkillWorkspace; inProfile: boolean; approved: boolean }) {
  const skill = workspace.skills.find((item) => item.id === mapping.skillId);
  const interval = mappingConfidenceInterval(mapping);
  const kfla = (mapping.primaryKflaCompetencyId || skill?.kflaCompetencyId) ? workspace.kfla.find((item) => item.id === (mapping.primaryKflaCompetencyId || skill?.kflaCompetencyId)) : undefined;
  return <article><div><b>{skill?.name || mapping.skillId}</b><small>{skill?.dimension === "competency" ? "KFLA competency" : "Technical / hard skill"} · level {mapping.targetLevel} · {mapping.weight}% weight</small></div><span>{mapping.status} · {approved ? "approved baseline" : "not in approved baseline"}</span><p>{mapping.rationale}</p><small>{kfla ? `${kfla.name} · ` : ""}Evidence {mapping.evidenceRefs?.join(", ") || "not linked"} · confidence {interval.lower}–{interval.upper}% (operational range) · {inProfile ? "in stored profile" : "not in stored profile"}</small></article>;
}
