"use client";

import { useState } from "react";
import { applySkillLifecycle, impactAnalysis, type SkillLifecycleAction } from "@/lib/skill-governance";
import { skillQuality, type Skill, type SkillWorkspace } from "@/lib/skill-schema";
import { Icons } from "./icons";

type Props = {
  workspace: SkillWorkspace;
  query: string;
  onQuery: (value: string) => void;
  onEdit: (skill: Skill | "new") => void;
  mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

type LifecycleDialog = { action: SkillLifecycleAction; skillIds: string[] };
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const displayConfidence = (value: number) => Math.round(value > 0 && value <= 1 ? value * 100 : value);

export function GovernedSkillLibrary({ workspace, query, onQuery, onEdit, mutate, onMessage, onError }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<LifecycleDialog | null>(null);
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const [targetSkillId, setTargetSkillId] = useState("");
  const [targetGroupId, setTargetGroupId] = useState("");
  const filtered = workspace.skills.filter((skill) => `${skill.name} ${skill.description} ${skill.aliases.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const impacts = dialog?.skillIds.map((id) => impactAnalysis(workspace, id)) || [];
  const dependencyCount = impacts.reduce((sum, impact) => sum + impact.dependencyCount, 0);

  function open(action: SkillLifecycleAction, skillIds: string[]) {
    setDialog({ action, skillIds });
    setActor("");
    setReason("");
    setTargetSkillId("");
    setTargetGroupId("");
    onError("");
  }

  function apply() {
    if (!dialog) return;
    try {
      mutate((current) => dialog.skillIds.reduce((next, skillId, index) => applySkillLifecycle(next, {
        action: dialog.action,
        skillId,
        actor,
        reason,
        targetSkillId: targetSkillId || undefined,
        targetGroupId: targetGroupId || undefined,
        newSkillId: dialog.action === "duplicate" ? `SK-${Date.now().toString().slice(-7)}-${index + 1}` : undefined,
      }), current));
      onMessage(`${dialog.skillIds.length} skill lifecycle operation(s) recorded as governed working state.`);
      setSelected([]);
      setDialog(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Skill lifecycle operation failed.");
    }
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return <div className="skill-stack">
    <section className="library-toolbar">
      <div className="search-box"><Icons.search/><input aria-label="Search skill library" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search skills, aliases or descriptions…"/></div>
      <span>{filtered.length} skills</span>
      <button className="button primary" onClick={() => onEdit("new")}><Icons.plus/>Create skill</button>
    </section>
    {selected.length > 0 && <section className="panel bulk-governance">
      <b>{selected.length} selected</b>
      <span>Bulk changes remain working state until accountable release.</span>
      <button className="button secondary" onClick={() => open("move", selected)}>Move</button>
      <button className="button secondary" onClick={() => open("deprecate", selected)}>Deprecate</button>
      <button className="button secondary" onClick={() => open("archive", selected)}>Archive</button>
      <button className="button secondary" onClick={() => open("restore", selected)}>Restore</button>
      <button className="button ghost" onClick={() => setSelected([])}>Clear</button>
    </section>}
    <section className="skill-table panel">
      <header><span>Skill</span><span>Taxonomy</span><span>Dimension</span><span>Confidence</span><span>Quality</span><span>Status</span><span/></header>
      {filtered.map((skill) => {
        const group = workspace.groups.find((item) => item.id === skill.groupId);
        const domain = workspace.domains.find((item) => item.id === group?.domainId);
        const kfla = workspace.kfla.find((item) => item.id === skill.kflaCompetencyId);
        const quality = skillQuality(skill, workspace);
        const inactive = ["archived", "retired"].includes(skill.status);
        return <div key={skill.id}>
          <span className="skill-select"><input aria-label={`Select ${skill.name}`} type="checkbox" checked={selected.includes(skill.id)} onChange={() => toggle(skill.id)}/><span><b>{skill.name}</b><small>{skill.description}</small>{skill.aliases.length > 0 && <em>Aliases: {skill.aliases.join(", ")}</em>}</span></span>
          <span><b>{domain?.name}</b><small>{group?.name}</small></span>
          <span><i className={`dimension-dot ${skill.dimension}`}/>{title(skill.dimension)}{kfla && <small>{kfla.number}. {kfla.name}</small>}</span>
          <span><b>{displayConfidence(skill.confidence)}%</b><small>{skill.evidence.length} evidence links</small></span>
          <span><b>{quality.score}%</b><small>{Object.values(quality.checks).filter(Boolean).length}/6 standards</small></span>
          <span><em className={`lifecycle ${skill.status}`}>{title(skill.status)}</em></span>
          <span className="record-actions skill-lifecycle-actions">
            <button aria-label={`Edit ${skill.name}`} onClick={() => onEdit(skill)}><Icons.edit/></button>
            <button aria-label={`Duplicate ${skill.name}`} onClick={() => open("duplicate", [skill.id])}>⧉</button>
            {inactive ? <button aria-label={`Restore ${skill.name}`} onClick={() => open("restore", [skill.id])}>↺</button> : <>
              <button aria-label={`Move ${skill.name}`} onClick={() => open("move", [skill.id])}>↔</button>
              <button aria-label={`Merge ${skill.name}`} onClick={() => open("merge", [skill.id])}>⇉</button>
              <button aria-label={`Replace ${skill.name}`} onClick={() => open("replace", [skill.id])}>⇢</button>
              <button aria-label={`Deprecate ${skill.name}`} onClick={() => open("deprecate", [skill.id])}>⊘</button>
              <button aria-label={`Archive ${skill.name}`} onClick={() => open("archive", [skill.id])}><Icons.trash/></button>
            </>}
          </span>
        </div>;
      })}
    </section>
    {dialog && <div className="modal-backdrop"><form className="modal-card" onSubmit={(event) => { event.preventDefault(); apply(); }}>
      <header><div><span className="section-kicker">GOVERNED SKILL LIFECYCLE</span><h3>{title(dialog.action)} {dialog.skillIds.length} skill{dialog.skillIds.length === 1 ? "" : "s"}</h3></div><button type="button" onClick={() => setDialog(null)}><Icons.close/></button></header>
      <div className="impact-summary"><b>{dependencyCount} dependencies affected</b><span>{impacts.reduce((sum, value) => sum + value.jobs.length, 0)} jobs · {impacts.reduce((sum, value) => sum + value.mappings.length, 0)} mappings · {impacts.reduce((sum, value) => sum + value.profiles.length, 0)} profiles · {impacts.reduce((sum, value) => sum + value.tools.length, 0)} tools · {impacts.reduce((sum, value) => sum + value.relationships.length, 0)} relationships</span></div>
      {dialog.action === "move" && <label><span>Target skill group</span><select required value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}><option value="">Select active group</option>{workspace.groups.filter((group) => !["archived", "retired"].includes(group.status)).map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>}
      {["merge", "replace"].includes(dialog.action) && <label><span>Canonical target skill</span><select required value={targetSkillId} onChange={(event) => setTargetSkillId(event.target.value)}><option value="">Select active target</option>{workspace.skills.filter((skill) => !dialog.skillIds.includes(skill.id) && !["archived", "retired"].includes(skill.status)).map((skill) => <option value={skill.id} key={skill.id}>{skill.name}</option>)}</select></label>}
      <label><span>Accountable actor</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label>
      <label><span>Governance reason</span><textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the evidence, impact and intended migration."/></label>
      <p>Mappings and downstream references are migrated where applicable. Published revisions remain immutable; this operation creates new object versions and audit events.</p>
      <footer><button type="button" className="button secondary" onClick={() => setDialog(null)}>Cancel</button><button className="button primary">Apply governed operation</button></footer>
    </form></div>}
  </div>;
}
