"use client";

import { useMemo, useState } from "react";
import { Icons } from "./icons";
import { runSkillElicitation } from "@/lib/skill-client";
import { recordGovernedVersion } from "@/lib/skill-governance";
import type { ElicitationSession, SkillWorkspace } from "@/lib/skill-schema";

type Props = {
  workspace: SkillWorkspace;
  secret: string;
  mutate: (update: (current: SkillWorkspace) => SkillWorkspace) => void;
  onWorkspace: (workspace: SkillWorkspace) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

const steps: Array<{ key: keyof ElicitationSession["fields"]; label: string; guidance: string }> = [
  { key: "capability", label: "Intended capability", guidance: "Name the durable capability, not a role, task or tool." },
  { key: "activities", label: "Observable activities", guidance: "What repeatable actions can a reviewer see?" },
  { key: "outcomes", label: "Expected outcomes", guidance: "What changes because the capability is applied well?" },
  { key: "knowledge", label: "Required knowledge", guidance: "Capture concepts and principles separately from action." },
  { key: "tools", label: "Relevant tools", guidance: "Link tools as controlled metadata, not as the skill itself." },
  { key: "context", label: "Context", guidance: "Where and with whom is the capability applied?" },
  { key: "constraints", label: "Constraints", guidance: "Record regulation, safety, language or operating boundaries." },
  { key: "granularity", label: "Granularity", guidance: "Choose one atomic, observable capability wherever possible." },
  { key: "synonyms", label: "Equivalents and synonyms", guidance: "Search aliases before proposing a new canonical concept." },
  { key: "kflaCompetencyIds", label: "KFLA alignment", guidance: "Select only competencies supported by behavioral evidence." },
  { key: "proficiencyIndicators", label: "Proficiency indicators", guidance: "Describe increasingly independent and complex application." },
];

const newSession = (): ElicitationSession => ({ id: `ELI-${Date.now()}`, title: "Untitled capability", status: "draft", currentStep: 0, updatedAt: new Date().toISOString(), fields: { capability: "", activities: "", outcomes: "", knowledge: "", tools: "", context: "", constraints: "", granularity: "atomic", synonyms: "", kflaCompetencyIds: [], proficiencyIndicators: "" } });

export function ElicitationWorkbench({ workspace, secret, mutate, onWorkspace, onMessage, onError }: Props) {
  const [selectedId, setSelectedId] = useState(workspace.elicitationSessions[0]?.id || "");
  const [draft, setDraft] = useState<ElicitationSession>(() => workspace.elicitationSessions.find((item) => item.id === selectedId) || newSession());
  const [busy, setBusy] = useState(false);
  const step = steps[draft.currentStep] || steps[0];
  const completion = useMemo(() => Math.round(steps.filter(({ key }) => Array.isArray(draft.fields[key]) ? (draft.fields[key] as string[]).length > 0 : String(draft.fields[key]).trim().length > 0).length / steps.length * 100), [draft]);

  function select(id: string) {
    const session = workspace.elicitationSessions.find((item) => item.id === id);
    if (session) { setSelectedId(id); setDraft(session); }
  }
  function create() { const session = newSession(); setSelectedId(session.id); setDraft(session); }
  function setField(key: keyof ElicitationSession["fields"], value: string | string[]) { setDraft((current) => ({ ...current, status: "in_progress", title: key === "capability" && typeof value === "string" && value.trim() ? value.trim() : current.title, fields: { ...current.fields, [key]: value }, updatedAt: new Date().toISOString() })); }
  function save() {
    mutate((current) => recordGovernedVersion({ ...current, elicitationSessions: current.elicitationSessions.some((item) => item.id === draft.id) ? current.elicitationSessions.map((item) => item.id === draft.id ? draft : item) : [draft, ...current.elicitationSessions] }, "elicitation_session", draft.id, "elicitation.saved", "current-user", draft as unknown as Record<string, unknown>));
    onMessage(`${draft.title} saved at ${completion}% completion.`);
  }
  async function assist(action: "rewrite" | "validate") {
    save(); setBusy(true); onError("");
    try { const payload = await runSkillElicitation(secret, draft.id, action, workspace); if (payload.workspace) onWorkspace(payload.workspace); onMessage(payload.message || `AI ${action} request completed and retained as a draft.`); }
    catch (reason) { onError(reason instanceof Error ? reason.message : `AI ${action} failed.`); }
    finally { setBusy(false); }
  }
  function submit() {
    if (completion < 70) { onError("Complete at least 70% of the guided evidence before review submission."); return; }
    const now = new Date().toISOString();
    mutate((current) => recordGovernedVersion({ ...current, elicitationSessions: current.elicitationSessions.map((item) => item.id === draft.id ? { ...draft, status: "submitted", updatedAt: now } : item), reviewQueue: [{ id: `REV-${draft.id}`, title: draft.fields.capability || draft.title, type: "new_skill", summary: "Guided elicitation package submitted for syntax, granularity and taxonomy review.", confidence: completion, evidence: `${draft.fields.activities} · ${draft.fields.outcomes}`, explanation: "The agent may validate and rewrite, but an accountable human must approve the canonical skill.", rulesVersion: current.framework.rulesVersion, frameworkVersion: current.framework.version, status: "pending", entityId: draft.id, payload: { sessionId: draft.id } }, ...current.reviewQueue] }, "elicitation_session", draft.id, "elicitation.submitted", "current-user", draft as unknown as Record<string, unknown>));
    setDraft((current) => ({ ...current, status: "submitted" })); onMessage("Elicitation package submitted to the human review queue.");
  }

  return <div className="elicitation-layout">
    <aside className="panel elicitation-list"><header><div><span className="section-kicker">DRAFTS</span><h3>Guided elicitation</h3></div><button aria-label="Create elicitation" onClick={create}><Icons.plus/></button></header>{workspace.elicitationSessions.map((session) => <button key={session.id} className={selectedId === session.id ? "active" : ""} onClick={() => select(session.id)}><b>{session.title}</b><small>Step {session.currentStep + 1} · {session.status}</small></button>)}</aside>
    <section className="panel elicitation-main"><header><div><span className="section-kicker">STEP {draft.currentStep + 1} OF {steps.length}</span><h3>{step.label}</h3><p>{step.guidance}</p></div><div className="elicitation-progress"><b>{completion}%</b><span><i style={{ width: `${completion}%` }}/></span></div></header><div className="elicitation-step"><StepField session={draft} step={step} workspace={workspace} onChange={setField}/></div><footer><button className="button secondary" disabled={draft.currentStep === 0} onClick={() => setDraft((current) => ({ ...current, currentStep: current.currentStep - 1 }))}>Previous</button><button className="button secondary" onClick={save}>Save draft</button><button className="button secondary" disabled={busy} onClick={() => void assist("rewrite")}><Icons.spark/>AI-assisted rewrite</button>{draft.currentStep < steps.length - 1 ? <button className="button primary" onClick={() => setDraft((current) => ({ ...current, currentStep: current.currentStep + 1 }))}>Next</button> : <button className="button primary" onClick={submit}>Submit for review</button>}</footer></section>
    <aside className="panel elicitation-guidance"><span className="section-kicker">LIVE STANDARD</span><h3>Design guidance</h3><p><b>Action + object + outcome</b></p><p>Prefer an existing canonical concept. Keep tools, qualifications, tasks and context as mapped metadata.</p><p>Every AI rewrite remains a draft and retains framework {workspace.framework.version} and rules {workspace.framework.rulesVersion}.</p></aside>
  </div>;
}

function StepField({ session, step, workspace, onChange }: { session: ElicitationSession; step: typeof steps[number]; workspace: SkillWorkspace; onChange: (key: keyof ElicitationSession["fields"], value: string | string[]) => void }) {
  const value = session.fields[step.key];
  if (step.key === "granularity") return <fieldset className="choice-grid"><legend>{step.label}</legend>{["atomic", "composite", "umbrella"].map((option) => <label key={option}><input type="radio" name="granularity" checked={value === option} onChange={() => onChange(step.key, option)}/><span><b>{option}</b><small>{option === "atomic" ? "One durable capability" : option === "composite" ? "Several linked capabilities" : "A broad capability area"}</small></span></label>)}</fieldset>;
  if (step.key === "kflaCompetencyIds") return <div className="elicitation-kfla"><label><span>Search and select supported KFLA competencies</span></label>{workspace.kfla.map((competency) => <label key={competency.id}><input type="checkbox" checked={(value as string[]).includes(competency.id)} onChange={(event) => onChange(step.key, event.target.checked ? [...(value as string[]), competency.id] : (value as string[]).filter((id) => id !== competency.id))}/><span>{competency.number}. {competency.name}<small>{competency.factor} · {workspace.kflaClusters.find((cluster) => cluster.id === competency.clusterId)?.name}</small></span></label>)}</div>;
  return <label><span>{step.label}</span><textarea autoFocus value={String(value)} onChange={(event) => onChange(step.key, event.target.value)} placeholder={step.guidance}/><small>Field guidance: include source language or a concrete example wherever possible.</small></label>;
}
