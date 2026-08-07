"use client";

import { useMemo, useState } from "react";
import { Icons } from "./icons";
import { canonicalConceptOptions, saveLocalizedConceptLabel, setLocalizedConceptLabelStatus } from "@/lib/skill-governance";
import type { LocalizedConceptLabel, SkillWorkspace } from "@/lib/skill-schema";

type Props = {
  workspace: SkillWorkspace;
  mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

const entityTypes: LocalizedConceptLabel["entityType"][] = ["domain", "group", "skill", "kfla_factor", "kfla_cluster", "kfla_competency", "controlled_tool"];

function blank(workspace: SkillWorkspace): LocalizedConceptLabel {
  const language = workspace.framework.supportedLanguages.find((item) => item !== workspace.framework.canonicalLanguage) || "";
  const concept = canonicalConceptOptions(workspace)[0];
  return { id: `LBL-${Date.now()}`, entityType: concept?.entityType || "skill", entityId: concept?.entityId || "", language, label: "", description: "", sourceClassification: "organization_authored", licenceStatus: "internal_explanation", status: "draft" };
}

export function MultilingualLabelWorkbench({ workspace, mutate, onMessage, onError }: Props) {
  const [editing, setEditing] = useState<LocalizedConceptLabel | null>(null);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const visible = useMemo(() => workspace.localizedLabels.filter((item) => {
    const concept = canonicalConceptOptions(workspace, item.entityType).find((candidate) => candidate.entityId === item.entityId);
    return (language === "all" || item.language === language) && `${concept?.canonicalLabel || item.entityId} ${item.label} ${item.description || ""}`.toLowerCase().includes(query.toLowerCase());
  }), [workspace, language, query]);

  function save(value: LocalizedConceptLabel, actor: string, reason: string) {
    try {
      mutate((current) => saveLocalizedConceptLabel(current, value, actor, reason));
      setEditing(null);
      onMessage(`${value.label} saved as a governed ${value.language} label.`);
    } catch (error) { onError(error instanceof Error ? error.message : "Localized label could not be saved."); }
  }

  function toggle(value: LocalizedConceptLabel) {
    const status = value.status === "archived" ? "draft" : "archived";
    try {
      mutate((current) => setLocalizedConceptLabelStatus(current, value.id, status, "current-user", status === "archived" ? "Superseded translation removed from active use." : "Translation restored for renewed review."));
      onMessage(`${value.label} ${status === "archived" ? "archived" : "restored to draft"}.`);
    } catch (error) { onError(error instanceof Error ? error.message : "Localized label status could not be changed."); }
  }

  return <section className="panel multilingual-workbench">
    <header><div><span className="section-kicker">ONE CONCEPT · MANY LABELS</span><h3>Governed multilingual terminology</h3><p>Translations reference a stable canonical ID. They never create duplicate taxonomy concepts or contain licensed definitions.</p></div><button className="button primary" onClick={() => setEditing(blank(workspace))}><Icons.plus/>Add localized label</button></header>
    <div className="multilingual-controls"><label><span>Search concepts and labels</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search terminology"/></label><label><span>Filter language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All supported languages</option>{workspace.framework.supportedLanguages.filter((item) => item !== workspace.framework.canonicalLanguage).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><div><b>{workspace.framework.canonicalLanguage.toUpperCase()}</b><span>canonical language</span></div><div><b>{workspace.localizedLabels.filter((item) => !["archived", "retired"].includes(item.status)).length}</b><span>active labels</span></div></div>
    <div className="registry-table multilingual-table"><div><b>Canonical concept</b><b>Localized label</b><b>Language</b><b>Classification</b><b>Status</b><b/></div>{visible.length === 0 ? <div className="empty-state"><Icons.search/><b>No localized labels match</b><span>Add a translation or change the filters.</span></div> : visible.map((item) => { const concept = canonicalConceptOptions(workspace, item.entityType).find((candidate) => candidate.entityId === item.entityId); return <div key={item.id}><span><b>{concept?.canonicalLabel || item.entityId}</b><small>{item.entityType.replaceAll("_", " ")} · {item.entityId}</small></span><span><b lang={item.language}>{item.label}</b><small>{item.description || "No localized description"}</small></span><span>{item.language.toUpperCase()}</span><span>{item.sourceClassification.replaceAll("_", " ")}<small>{item.licenceStatus.replaceAll("_", " ")}</small></span><span><em className={`lifecycle ${item.status}`}>{item.status}</em></span><span className="record-actions"><button aria-label={`Edit localized label ${item.label}`} onClick={() => setEditing(item)}><Icons.edit/></button><button aria-label={`${item.status === "archived" ? "Restore" : "Archive"} localized label ${item.label}`} onClick={() => toggle(item)}>{item.status === "archived" ? <Icons.refresh/> : <Icons.trash/>}</button></span></div>; })}</div>
    {editing && <LocalizedLabelEditor workspace={workspace} value={editing} onChange={setEditing} onSave={save} onClose={() => setEditing(null)}/>}
  </section>;
}

function LocalizedLabelEditor({ workspace, value, onChange, onSave, onClose }: { workspace: SkillWorkspace; value: LocalizedConceptLabel; onChange: (value: LocalizedConceptLabel) => void; onSave: (value: LocalizedConceptLabel, actor: string, reason: string) => void; onClose: () => void }) {
  const [actor, setActor] = useState("current-user");
  const [reason, setReason] = useState("");
  const concepts = canonicalConceptOptions(workspace, value.entityType);
  const languages = workspace.framework.supportedLanguages.filter((item) => item !== workspace.framework.canonicalLanguage);
  const set = <K extends keyof LocalizedConceptLabel>(key: K, next: LocalizedConceptLabel[K]) => onChange({ ...value, [key]: next });
  return <div className="modal-backdrop"><form className="modal" onSubmit={(event) => { event.preventDefault(); onSave(value, actor, reason); }}><header><div><span className="section-kicker">GOVERNED TRANSLATION</span><h2>{workspace.localizedLabels.some((item) => item.id === value.id) ? "Edit localized label" : "Add localized label"}</h2></div><button type="button" onClick={onClose}><Icons.close/></button></header><div className="source-guard"><b>Canonical identity remains unchanged</b><span>The localized label resolves to one stable concept ID. Licensed KFLA wording must be managed through the protected backend.</span></div><div className="form-row"><label><span>Concept type</span><select value={value.entityType} onChange={(event) => { const entityType = event.target.value as LocalizedConceptLabel["entityType"]; const first = canonicalConceptOptions(workspace, entityType)[0]; onChange({ ...value, entityType, entityId: first?.entityId || "" }); }}>{entityTypes.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label><span>Canonical concept</span><select required value={value.entityId} onChange={(event) => set("entityId", event.target.value)}>{concepts.map((item) => <option key={item.entityId} value={item.entityId}>{item.canonicalLabel} · {item.entityId}</option>)}</select></label><label><span>Language</span><select aria-label="Translation language" required value={value.language} onChange={(event) => set("language", event.target.value)}><option value="">Select language</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><label><span>Localized label</span><input required lang={value.language} value={value.label} onChange={(event) => set("label", event.target.value)}/></label><label><span>Localized description</span><textarea lang={value.language} value={value.description || ""} onChange={(event) => set("description", event.target.value)}/><small>Use internally authored or verified public wording only.</small></label><div className="form-row"><label><span>Source classification</span><select value={value.sourceClassification} onChange={(event) => set("sourceClassification", event.target.value as LocalizedConceptLabel["sourceClassification"])}><option value="organization_authored">organization authored</option><option value="public">public</option></select></label><label><span>Licence status</span><select value={value.licenceStatus} onChange={(event) => set("licenceStatus", event.target.value as LocalizedConceptLabel["licenceStatus"])}><option value="internal_explanation">internal explanation</option><option value="public_metadata">public metadata</option></select></label><label><span>Lifecycle</span><select value={value.status} onChange={(event) => set("status", event.target.value as LocalizedConceptLabel["status"])}>{["draft", "in_review", "approved", "archived", "deprecated", "retired"].map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="form-row"><label><span>Accountable editor</span><input required value={actor} onChange={(event) => setActor(event.target.value)}/></label><label><span>Governance reason</span><input required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this translation added or changed?"/></label></div><footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save governed label</button></footer></form></div>;
}
