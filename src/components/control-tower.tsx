"use client";

import { useMemo, useState } from "react";
import { Icons } from "./icons";
import type { Deliverable, Meeting, PmoDocument, Rag, Risk } from "@/lib/pmo-schema";
import { ingestEvidence, loadPmoDocument, savePmoDocument } from "@/lib/n8n-client";

type View = "overview" | "plan" | "risks" | "meetings" | "activity" | "method";
type IntakeType = "risk" | "deliverable" | "meeting";

const navigation: Array<{ id: View; label: string; icon: keyof typeof Icons }> = [
  { id: "overview", label: "Executive overview", icon: "dashboard" },
  { id: "plan", label: "Plan & deliverables", icon: "plan" },
  { id: "risks", label: "Risks & issues", icon: "risk" },
  { id: "meetings", label: "Meeting hub", icon: "meeting" },
  { id: "activity", label: "Activity log", icon: "activity" },
  { id: "method", label: "Method studio", icon: "layers" },
];

const viewMeta: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "Control tower", title: "Executive overview", description: "One live view of delivery health, decisions and exposure." },
  plan: { eyebrow: "Delivery", title: "Plan & deliverables", description: "Track gate milestones and workstream commitments." },
  risks: { eyebrow: "RAID", title: "Risks & issues", description: "Prioritise exposure and keep mitigation ownership visible." },
  meetings: { eyebrow: "Collaboration", title: "Meeting hub", description: "Turn discussions into decisions, actions and evidence." },
  activity: { eyebrow: "Traceability", title: "Activity log", description: "A chronological audit trail across people and automations." },
  method: { eyebrow: "Next capability", title: "Method studio", description: "The extension point for skill design, taxonomy and mapping." },
};

function cx(...classes: Array<string | false | undefined>) { return classes.filter(Boolean).join(" "); }
function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(value: string, compact = false) {
  return new Intl.DateTimeFormat("en-GB", compact ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function riskScore(risk: Risk) { return risk.probability * risk.impact; }
function relativeDay(value: string, anchor: string) {
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round((new Date(value).getTime() - new Date(anchor).getTime()) / 86_400_000), "day");
}

function BrandMark() {
  return <div className="brand-lockup" aria-label="DEKRA and Eraneos"><span className="dekra-mark">DEKRA</span><span className="brand-x">×</span><span className="eraneos-mark"><span className="eraneos-glyph"><i/><i/><i/></span><b>ERANEOS</b></span></div>;
}

function RagDot({ rag, label = true }: { rag: Rag; label?: boolean }) {
  return <span className={cx("rag", `rag-${rag}`)}><i />{label && titleCase(rag)}</span>;
}

function ProgressBar({ value, tone = "green" }: { value: number; tone?: Rag }) {
  return <div className="progress-track" aria-label={`${value}% complete`}><span className={`progress-${tone}`} style={{ width: `${value}%` }} /></div>;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "done" || status === "complete" ? "success" : status === "blocked" || status === "at_risk" ? "danger" : "neutral";
  return <span className={`status-pill status-${tone}`}>{titleCase(status)}</span>;
}

export default function ControlTower({ initialData }: { initialData: PmoDocument }) {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<PmoDocument | null>(initialData);
  const [source, setSource] = useState<"github" | "bootstrap">("bootstrap");
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [workspaceSecret, setWorkspaceSecret] = useState("");
  const [accessOpen, setAccessOpen] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowResult, setWorkflowResult] = useState("");
  const [dirty, setDirty] = useState(false);

  async function loadData(secret = workspaceSecret) {
    setLoading(true); setError("");
    try {
      const payload = await loadPmoDocument(secret);
      if (!payload.ok || !payload.document) throw new Error(payload.error || "Unable to load project data.");
      set…7841 tokens truncated…e="architecture-nodes"><span>Responsive UI</span><Icons.arrow/><span>Validated API</span><Icons.arrow/><span>n8n workflows</span><Icons.arrow/><span>GitHub artifacts</span></div></section></div>;
}

function UpdateDialog({ onClose, onSubmit, workstreams }: { onClose: () => void; onSubmit: (type: IntakeType, values: Record<string, string>) => void; workstreams: Array<{ id: string; name: string }> }) {
  const [type, setType] = useState<IntakeType>("risk");
  const [values, setValues] = useState<Record<string, string>>({ title: "", description: "", owner: "", mitigation: "", probability: "3", impact: "3", date: today(), workstream: workstreams[0]?.id || "WS1", participants: "" });
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(type, values); }}><header><div><span className="section-kicker">QUICK CAPTURE</span><h2>Add project update</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="type-switch">{(["risk", "deliverable", "meeting"] as IntakeType[]).map((item) => <button type="button" className={type === item ? "active" : ""} onClick={() => setType(item)} key={item}>{titleCase(item)}</button>)}</div><label><span>Title</span><input required value={values.title} onChange={(event) => set("title", event.target.value)} placeholder={`New ${type} title`}/></label><div className="form-row"><label><span>Owner</span><input required value={values.owner} onChange={(event) => set("owner", event.target.value)} placeholder="Role or name"/></label>{type !== "risk" && <label><span>{type === "meeting" ? "Meeting date" : "Due date"}</span><input type="date" required value={values.date} onChange={(event) => set("date", event.target.value)}/></label>}</div>{type === "risk" && <><div className="form-row"><label><span>Probability</span><select value={values.probability} onChange={(event) => set("probability", event.target.value)}>{[1,2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select></label><label><span>Impact</span><select value={values.impact} onChange={(event) => set("impact", event.target.value)}>{[1,2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select></label></div><label><span>Mitigation</span><textarea required value={values.mitigation} onChange={(event) => set("mitigation", event.target.value)} placeholder="How will this exposure be reduced?"/></label></>}{type === "deliverable" && <label><span>Workstream</span><select value={values.workstream} onChange={(event) => set("workstream", event.target.value)}>{workstreams.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label>}{type === "meeting" && <label><span>Participants</span><input value={values.participants} onChange={(event) => set("participants", event.target.value)} placeholder="Comma-separated roles or names"/></label>}<label><span>{type === "meeting" ? "Summary" : "Description"}</span><textarea required value={values.description} onChange={(event) => set("description", event.target.value)} placeholder="Add concise, decision-useful context"/></label><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary"><Icons.plus/>Add to workspace</button></footer></form></div>;
}

function PublishDialog({ saving, revision, onClose, onPublish }: { saving: boolean; revision: number; onClose: () => void; onPublish: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal publish-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void onPublish(); }}><header><div><span className="section-kicker">GITHUB PUBLISH</span><h2>Create revision {revision + 1}</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="publish-summary"><Icons.github/><div><b>knowledge/pmo/control-tower.json</b><span>Validated by n8n and committed to the private data repository.</span></div></div><p>Your pilot password remains in memory for this browser session and is sent only to the protected n8n workflow.</p><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Publishing…" : "Publish to GitHub"}</button></footer></form></div>;
}

function WorkflowIntakeDialog({ saving, onClose, onRun }: { saving: boolean; onClose: () => void; onRun: (meta: Record<string, string>, files: File[]) => void }) {
  const [values, setValues] = useState({ wpId: "", title: "", owner_role: "PMO Lead" });
  const [files, setFiles] = useState<File[]>([]);
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void onRun({ wpId: values.wpId, title: values.title, owner_role: values.owner_role, project: "DEKRA SBO Pilot", status: "active", rag: "amber" }, files); }}><header><div><span className="section-kicker">N8N EVIDENCE INTAKE</span><h2>Normalize work-package evidence</h2></div><button type="button" className="icon-button" onClick={onClose}><Icons.close/></button></header><div className="workflow-intro"><span className="n8n-logo">n8n</span><p>Files are extracted in this browser, normalized by the PMO Assistant, and committed as canonical GitHub artifacts.</p></div><div className="form-row"><label><span>Work-package ID</span><input required value={values.wpId} onChange={(event) => set("wpId", event.target.value)} placeholder="WP-4.3" pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,49}"/></label><label><span>Owner role</span><input required value={values.owner_role} onChange={(event) => set("owner_role", event.target.value)} placeholder="PMO Lead"/></label></div><label><span>Title</span><input required value={values.title} onChange={(event) => set("title", event.target.value)} placeholder="Work package title"/></label><label><span>Evidence files</span><input type="file" required multiple accept=".md,.txt,.csv,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(event) => setFiles(Array.from(event.target.files || []))}/><small>Up to 20 files and 29 MB total. Supported: Markdown, text, CSV, Excel and images.</small></label><footer><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving || files.length === 0}>{saving ? "Processing…" : "Run PMO workflow"}</button></footer></form></div>;
}

function AccessDialog({ loading, error, onUnlock }: { loading: boolean; error: string; onUnlock: (secret: string) => void }) {
  const [secret, setSecret] = useState("");
  return <div className="modal-backdrop"><form className="modal publish-modal" onSubmit={(event) => { event.preventDefault(); onUnlock(secret); }}><header><div><span className="section-kicker">PILOT ACCESS</span><h2>Open the DEKRA control tower</h2></div></header><p>The interface is hosted on GitHub Pages. Project data remains behind the protected n8n workflow and a private GitHub repository.</p>{error && <div className="error-banner"><span>{error}</span></div>}<label><span>Shared pilot password</span><input type="password" autoFocus required value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="current-password"/><small>Kept in memory only. Refreshing or closing the page clears it.</small></label><footer><button className="button primary" disabled={loading}>{loading ? "Connecting…" : "Open workspace"}</button></footer></form></div>;
}
