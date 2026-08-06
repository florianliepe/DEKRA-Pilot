"use client";

import { useRef, useState } from "react";
import { Icons } from "./icons";

export type IntakeSubmission = {
  meta: Record<string, string>;
  files: File[];
  textUpdate: string;
};

const specialistAgents = [
  { id: "evidence", title: "Evidence verifier", copy: "Checks sources, ambiguity and confidence." },
  { id: "delivery", title: "Delivery planner", copy: "Maps commitments to milestones and deliverables." },
  { id: "risk", title: "Risk analyst", copy: "Extracts exposure, scoring and mitigations." },
  { id: "meeting", title: "Meeting synthesizer", copy: "Separates summaries, decisions and actions." },
];

function intakeId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  return `INTAKE-${stamp}`;
}

export function IntakeWorkbench({ saving, result, onRun }: { saving: boolean; result: string; onRun: (submission: IntakeSubmission) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [textUpdate, setTextUpdate] = useState("");
  const [title, setTitle] = useState("");
  const [routing, setRouting] = useState("auto");
  const [agents, setAgents] = useState(["evidence", "delivery", "risk", "meeting"]);
  const [dragging, setDragging] = useState(false);

  function addFiles(next: File[]) {
    setFiles((current) => {
      const known = new Set(current.map((file) => `${file.name}:${file.size}`));
      return [...current, ...next.filter((file) => !known.has(`${file.name}:${file.size}`))].slice(0, 20);
    });
  }

  function toggleAgent(id: string) {
    setAgents((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const canSubmit = !saving && (files.length > 0 || textUpdate.trim().length > 0);
  return <div className="intake-view">
    <section className="intake-hero">
      <div><span className="section-kicker">WORKBENCH INTAKE</span><h2>Turn project evidence into controlled updates.</h2><p>Drop source material or write an update. The n8n orchestrator classifies the evidence, delegates specialist analysis and proposes changes in the correct PMO views.</p></div>
      <div className="orchestrator-badge"><span className="ai-logo"><Icons.spark/></span><div><b>PMO Orchestrator</b><small>Evidence → conventions → PMO entities → GitHub revision</small></div><i/></div>
    </section>

    {result && <div className="success-banner intake-success"><span>{result}</span></div>}

    <form className="intake-layout" onSubmit={(event) => {
      event.preventDefault();
      if (!canSubmit) return;
      onRun({
        files,
        textUpdate: textUpdate.trim(),
        meta: {
          wpId: intakeId(),
          title: title.trim() || "PMO workbench intake",
          owner_role: "PMO Lead",
          project: "DEKRA SBO Pilot",
          status: "active",
          rag: "amber",
          routing,
          agents: agents.join(","),
        },
      });
    }}>
      <section className="panel intake-main">
        <div className="panel-head"><div><span className="section-kicker">01 · ADD EVIDENCE</span><h3>Documents and project updates</h3></div><span className="data-hint">PDF · Excel · Markdown · Images · Text</span></div>
        <button type="button" className={`drop-zone ${dragging ? "dragging" : ""}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}>
          <span className="drop-icon"><Icons.upload/></span><b>Drop files here or browse</b><small>Up to 20 files and 29 MB per intake. Content is extracted locally before transfer.</small>
        </button>
        <input ref={inputRef} className="visually-hidden" aria-label="Evidence files" type="file" multiple accept=".pdf,.md,.txt,.csv,.xlsx,.png,.jpg,.jpeg" onChange={(event) => addFiles(Array.from(event.target.files || []))}/>
        {files.length > 0 && <div className="file-queue">{files.map((file) => <div key={`${file.name}:${file.size}`}><span><Icons.document/></span><div><b>{file.name}</b><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></div><button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}><Icons.close/></button></div>)}</div>}
        <div className="intake-divider"><span>and / or</span></div>
        <label className="update-composer"><span>Write a project update</span><textarea value={textUpdate} onChange={(event) => setTextUpdate(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Paste meeting notes, describe a new risk, report progress, capture a decision or provide any other PMO-relevant update…"/><small>{textUpdate.length.toLocaleString("en-GB")} characters · Ctrl/⌘ + Enter submits</small></label>
      </section>

      <aside className="intake-side">
        <section className="panel routing-panel"><div className="panel-head"><div><span className="section-kicker">02 · ROUTE</span><h3>Analysis context</h3></div></div><label><span>Optional intake title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. August steering update"/></label><label><span>Primary destination</span><select value={routing} onChange={(event) => setRouting(event.target.value)}><option value="auto">Let orchestrator decide</option><option value="project">Project overview</option><option value="deliverables">Plan & deliverables</option><option value="risks">Risks & issues</option><option value="meetings">Meeting hub</option></select></label></section>
        <section className="panel agent-panel"><div className="panel-head"><div><span className="section-kicker">03 · DELEGATE</span><h3>Specialist agents</h3></div></div><div className="agent-list">{specialistAgents.map((agent) => <label key={agent.id} className={agents.includes(agent.id) ? "selected" : ""}><input type="checkbox" checked={agents.includes(agent.id)} onChange={() => toggleAgent(agent.id)}/><span><b>{agent.title}</b><small>{agent.copy}</small></span></label>)}</div></section>
        <button className="button primary orchestrate-button" disabled={!canSubmit}><Icons.spark/>{saving ? "Orchestrating…" : "Analyse and update workbench"}</button>
        <p className="intake-note">The orchestrator validates and persists accepted changes as a GitHub revision, then refreshes the affected PMO views and activity trail.</p>
      </aside>
    </form>
  </div>;
}
