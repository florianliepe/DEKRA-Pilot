"use client";

import { useState } from "react";
import { Icons } from "./icons";
import type { PmoDocument } from "@/lib/pmo-schema";

export type EditableEntity = "project" | "workstream" | "milestone" | "deliverable" | "risk" | "meeting";
export type EditorTarget = { entity: EditableEntity; id?: string };

type Props = {
  target: EditorTarget;
  data: PmoDocument;
  onClose: () => void;
  onSave: (target: EditorTarget, values: Record<string, string>) => void;
};

const labels: Record<EditableEntity, string> = {
  project: "project profile",
  workstream: "workstream",
  milestone: "milestone",
  deliverable: "deliverable",
  risk: "risk or issue",
  meeting: "meeting record",
};

function lines(values: string[]) {
  return values.join("\n");
}

function actionLines(actions: Array<{ text: string; owner: string; dueDate: string }>) {
  return actions.map((action) => `${action.text} | ${action.owner} | ${action.dueDate}`).join("\n");
}

function initialValues(target: EditorTarget, data: PmoDocument): Record<string, string> {
  if (target.entity === "project") {
    return {
      name: data.project.name,
      subtitle: data.project.subtitle,
      phase: data.project.phase,
      startDate: data.project.startDate,
      endDate: data.project.endDate,
      overallRag: data.project.overallRag,
      progress: String(data.project.progress),
    };
  }
  if (target.entity === "workstream") {
    const item = data.workstreams.find((record) => record.id === target.id);
    return { name: item?.name ?? "", shortName: item?.shortName ?? "", owner: item?.owner ?? "", progress: String(item?.progress ?? 0), rag: item?.rag ?? "grey" };
  }
  if (target.entity === "milestone") {
    const item = data.milestones.find((record) => record.id === target.id);
    return { title: item?.title ?? "", phase: item?.phase ?? data.project.phase, date: item?.date ?? data.project.endDate, status: item?.status ?? "upcoming", owner: item?.owner ?? "", description: item?.description ?? "" };
  }
  if (target.entity === "deliverable") {
    const item = data.deliverables.find((record) => record.id === target.id);
    return { title: item?.title ?? "", workstream: item?.workstream ?? data.workstreams[0]?.id ?? "WS1", dueDate: item?.dueDate ?? data.project.endDate, status: item?.status ?? "not_started", owner: item?.owner ?? "", progress: String(item?.progress ?? 0), priority: item?.priority ?? "P2" };
  }
  if (target.entity === "risk") {
    const item = data.risks.find((record) => record.id === target.id);
    return { title: item?.title ?? "", description: item?.description ?? "", probability: String(item?.probability ?? 3), impact: String(item?.impact ?? 3), state: item?.state ?? "open", owner: item?.owner ?? "", mitigation: item?.mitigation ?? "" };
  }
  const item = data.meetings.find((record) => record.id === target.id);
  return {
    title: item?.title ?? "",
    date: item?.date ?? data.project.endDate,
    type: item?.type ?? "working_session",
    participants: item?.participants.join(", ") ?? "",
    summary: item?.summary ?? "",
    decisions: lines(item?.decisions ?? []),
    actions: actionLines(item?.actions ?? []),
  };
}

function Field({ label, name, values, set, type = "text", required = true }: { label: string; name: string; values: Record<string, string>; set: (name: string, value: string) => void; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input type={type} required={required} value={values[name] ?? ""} onChange={(event) => set(name, event.target.value)}/></label>;
}

function SelectField({ label, name, values, set, options }: { label: string; name: string; values: Record<string, string>; set: (name: string, value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label><span>{label}</span><select value={values[name] ?? ""} onChange={(event) => set(name, event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

function TextAreaField({ label, name, values, set, placeholder, required = true }: { label: string; name: string; values: Record<string, string>; set: (name: string, value: string) => void; placeholder?: string; required?: boolean }) {
  return <label><span>{label}</span><textarea required={required} value={values[name] ?? ""} placeholder={placeholder} onChange={(event) => set(name, event.target.value)}/></label>;
}

export function EntityEditor({ target, data, onClose, onSave }: Props) {
  const [values, setValues] = useState(() => initialValues(target, data));
  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  const isNew = !target.id && target.entity !== "project";
  const ragOptions = ["green", "amber", "red", "grey"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
  const scoreOptions = [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }));

  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal entity-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(target, values); }}>
    <header><div><span className="section-kicker">{isNew ? "CREATE" : "EDIT"}</span><h2>{isNew ? "Add" : "Update"} {labels[target.entity]}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close editor"><Icons.close/></button></header>
    <div className="entity-form">
      {target.entity === "project" && <><Field label="Project name" name="name" values={values} set={set}/><Field label="Subtitle" name="subtitle" values={values} set={set}/><div className="form-row"><Field label="Phase" name="phase" values={values} set={set}/><SelectField label="Overall RAG" name="overallRag" values={values} set={set} options={ragOptions}/></div><div className="form-row"><Field label="Start date" name="startDate" type="date" values={values} set={set}/><Field label="End date" name="endDate" type="date" values={values} set={set}/></div><Field label="Progress (%)" name="progress" type="number" values={values} set={set}/></>}
      {target.entity === "workstream" && <><Field label="Name" name="name" values={values} set={set}/><div className="form-row"><Field label="Short name" name="shortName" values={values} set={set}/><Field label="Owner" name="owner" values={values} set={set}/></div><div className="form-row"><Field label="Progress (%)" name="progress" type="number" values={values} set={set}/><SelectField label="RAG" name="rag" values={values} set={set} options={ragOptions}/></div></>}
      {target.entity === "milestone" && <><Field label="Title" name="title" values={values} set={set}/><div className="form-row"><Field label="Phase" name="phase" values={values} set={set}/><Field label="Date" name="date" type="date" values={values} set={set}/></div><div className="form-row"><Field label="Owner" name="owner" values={values} set={set}/><SelectField label="Status" name="status" values={values} set={set} options={["upcoming", "at_risk", "complete"].map((value) => ({ value, label: value.replace("_", " ") }))}/></div><TextAreaField label="Description" name="description" values={values} set={set}/></>}
      {target.entity === "deliverable" && <><Field label="Title" name="title" values={values} set={set}/><div className="form-row"><SelectField label="Workstream" name="workstream" values={values} set={set} options={data.workstreams.map((item) => ({ value: item.id, label: `${item.id} · ${item.shortName}` }))}/><Field label="Owner" name="owner" values={values} set={set}/></div><div className="form-row"><Field label="Due date" name="dueDate" type="date" values={values} set={set}/><SelectField label="Priority" name="priority" values={values} set={set} options={["P1", "P2", "P3"].map((value) => ({ value, label: value }))}/></div><div className="form-row"><Field label="Progress (%)" name="progress" type="number" values={values} set={set}/><SelectField label="Status" name="status" values={values} set={set} options={["not_started", "in_progress", "at_risk", "blocked", "done"].map((value) => ({ value, label: value.replaceAll("_", " ") }))}/></div></>}
      {target.entity === "risk" && <><Field label="Title" name="title" values={values} set={set}/><TextAreaField label="Description" name="description" values={values} set={set}/><div className="form-row"><SelectField label="Probability" name="probability" values={values} set={set} options={scoreOptions}/><SelectField label="Impact" name="impact" values={values} set={set} options={scoreOptions}/></div><div className="form-row"><Field label="Owner" name="owner" values={values} set={set}/><SelectField label="State" name="state" values={values} set={set} options={["open", "mitigating", "monitoring", "closed"].map((value) => ({ value, label: value }))}/></div><TextAreaField label="Mitigation" name="mitigation" values={values} set={set}/></>}
      {target.entity === "meeting" && <><Field label="Title" name="title" values={values} set={set}/><div className="form-row"><Field label="Date" name="date" type="date" values={values} set={set}/><SelectField label="Type" name="type" values={values} set={set} options={["steering", "working_session", "workstream", "decision"].map((value) => ({ value, label: value.replace("_", " ") }))}/></div><Field label="Participants" name="participants" values={values} set={set}/><TextAreaField label="Summary" name="summary" values={values} set={set}/><TextAreaField label="Decisions" name="decisions" values={values} set={set} placeholder="One decision per line" required={false}/><TextAreaField label="Actions" name="actions" values={values} set={set} placeholder="Action | Owner | YYYY-MM-DD" required={false}/></>}
    </div>
    <footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">{isNew ? <Icons.plus/> : <Icons.check/>}{isNew ? "Add to workbench" : "Apply changes"}</button></footer>
  </form></div>;
}

export function DeleteDialog({ label, blockedReason, onClose, onDelete }: { label: string; blockedReason?: string; onClose: () => void; onDelete: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal publish-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="section-kicker danger-kicker">DELETE</span><h2>{blockedReason ? "Resolve linked records first" : "Remove this record?"}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close delete confirmation"><Icons.close/></button></header><p>{blockedReason ? <><b>{label}</b> cannot be removed yet. {blockedReason}</> : <><b>{label}</b> will be removed from the workbench. The deletion becomes permanent after publishing the next GitHub revision.</>}</p><footer><button type="button" className="button ghost" onClick={onClose}>{blockedReason ? "Close" : "Keep record"}</button><button type="button" className="button danger" disabled={Boolean(blockedReason)} onClick={onDelete}><Icons.trash/>{blockedReason ? "Dependencies remain" : "Delete record"}</button></footer></div></div>;
}
