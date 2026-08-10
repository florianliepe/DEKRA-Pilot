import { z } from "zod";
import type { PmoDocument } from "./pmo-schema";
import type { SkillWorkspace } from "./skill-schema";

export const SteercoPeriodSchema = z.object({
  preset: z.enum(["current_month", "previous_month", "since_last_steerco", "project_phase", "custom", "latest_approved"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1),
});

export const SteercoClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(["fact", "metric", "ai_narrative", "human_override", "missing"]),
  sourceIds: z.array(z.string()).default([]),
});

export const SteercoSnapshotSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().min(1),
  revision: z.number().int().positive(),
  status: z.enum(["draft", "in_review", "rejected", "approved", "published", "revoked"]),
  period: SteercoPeriodSchema,
  generatedAt: z.string().datetime(),
  generatedBy: z.string().min(1),
  generatedWith: z.object({ model: z.string(), promptVersion: z.string(), rulesVersion: z.string() }),
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.string().optional(),
  approvalReason: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  sourceRevision: z.object({ pmo: z.number().int(), skills: z.number().int() }),
  dataFreshness: z.object({ lastSynchronizedAt: z.string().datetime(), stale: z.boolean(), notes: z.array(z.string()) }),
  rag: z.object({
    calculated: z.enum(["green", "amber", "red", "unknown"]),
    effective: z.enum(["green", "amber", "red", "unknown"]),
    signals: z.array(z.object({ id: z.string(), severity: z.enum(["green", "amber", "red", "unknown"]), label: z.string(), sourceIds: z.array(z.string()) })),
    override: z.object({ value: z.enum(["green", "amber", "red", "unknown"]), actor: z.string(), reason: z.string(), at: z.string().datetime() }).optional(),
  }),
  executiveSummary: z.array(SteercoClaimSchema),
  sections: z.object({
    milestones: z.array(SteercoClaimSchema), deliverables: z.array(SteercoClaimSchema), risks: z.array(SteercoClaimSchema),
    decisions: z.array(SteercoClaimSchema), overdueActions: z.array(SteercoClaimSchema), upcoming: z.array(SteercoClaimSchema),
    framework: z.array(SteercoClaimSchema), taxonomy: z.array(SteercoClaimSchema), mappings: z.array(SteercoClaimSchema),
    automation: z.array(SteercoClaimSchema), governance: z.array(SteercoClaimSchema), changes: z.array(SteercoClaimSchema),
  }),
  publication: z.object({ shareId: z.string().optional(), expiresAt: z.string().datetime().optional(), revokedAt: z.string().datetime().optional(), checksum: z.string().optional(), githubPath: z.string().optional(), githubCommit: z.string().optional(), classification: z.literal("steerco_read_only") }),
  audit: z.array(z.object({ id: z.string(), event: z.string(), actor: z.string(), at: z.string().datetime(), reason: z.string().optional() })),
});

export type SteercoPeriod = z.infer<typeof SteercoPeriodSchema>;
export type SteercoClaim = z.infer<typeof SteercoClaimSchema>;
export type SteercoSnapshot = z.infer<typeof SteercoSnapshotSchema>;
export type SteercoRag = SteercoSnapshot["rag"]["effective"];

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const dateAtNoon = (value: string) => new Date(`${value}T12:00:00Z`);

export function resolveSteercoPeriod(preset: SteercoPeriod["preset"], pmo: PmoDocument, now = new Date(), custom?: Pick<SteercoPeriod, "from" | "to">): SteercoPeriod {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  if (preset === "custom" && custom) return { preset, ...custom, label: `${custom.from} to ${custom.to}` };
  if (preset === "previous_month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { preset, from: isoDate(from), to: isoDate(to), label: "Previous month" };
  }
  if (preset === "since_last_steerco") {
    const prior = [...pmo.meetings].filter((meeting) => meeting.type === "steering" && dateAtNoon(meeting.date) <= now).sort((a, b) => b.date.localeCompare(a.date))[0];
    return { preset, from: prior?.date || isoDate(monthStart), to: isoDate(now), label: prior ? `Since ${prior.title}` : "Since month start" };
  }
  if (preset === "project_phase") return { preset, from: pmo.project.startDate, to: pmo.project.endDate, label: pmo.project.phase };
  if (preset === "latest_approved") return { preset, from: isoDate(monthStart), to: isoDate(now), label: "Latest approved snapshot" };
  return { preset: "current_month", from: isoDate(monthStart), to: isoDate(monthEnd), label: "Current month" };
}

const claim = (id: string, text: string, kind: SteercoClaim["kind"], sourceIds: string[] = []): SteercoClaim => ({ id, text, kind, sourceIds });

export function buildSteercoEvidence(pmo: PmoDocument, skills: SkillWorkspace, period: SteercoPeriod, actor: string): SteercoSnapshot {
  if (period.from > period.to) throw new Error("Reporting period start must be on or before its end.");
  const now = new Date();
  const generatedAt = now.toISOString();
  const inPeriod = (value: string) => value.slice(0, 10) >= period.from && value.slice(0, 10) <= period.to;
  const openRisks = pmo.risks.filter((item) => item.state !== "closed");
  const criticalRisks = openRisks.filter((item) => item.probability * item.impact >= 16);
  const blockedDeliverables = pmo.deliverables.filter((item) => item.status === "blocked");
  const overdueDeliverables = pmo.deliverables.filter((item) => item.status !== "done" && item.dueDate < isoDate(now));
  const overdueActions = pmo.meetings.flatMap((meeting) => meeting.actions.map((action, index) => ({ ...action, id: `${meeting.id}:action:${index + 1}`, meetingId: meeting.id }))).filter((item) => item.dueDate < isoDate(now));
  const pendingReviews = skills.reviewQueue.filter((item) => item.status === "pending");
  const failedRuns = skills.agentRuns.filter((item) => item.status === "failed");
  const stale = now.getTime() - new Date(pmo.project.updatedAt).getTime() > 7 * 86_400_000;
  const signals: SteercoSnapshot["rag"]["signals"] = [];
  const insufficient = !pmo.milestones.length && !pmo.deliverables.length && !pmo.risks.length && !pmo.meetings.length;
  if (insufficient) signals.push({ id: "insufficient-evidence", severity: "unknown", label: "Insufficient governed project evidence for a defensible status", sourceIds: [pmo.project.id] });
  if (criticalRisks.length) signals.push({ id: "critical-risks", severity: "red", label: `${criticalRisks.length} critical unresolved risk(s)`, sourceIds: criticalRisks.map((item) => item.id) });
  if (blockedDeliverables.length) signals.push({ id: "blocked-deliverables", severity: "red", label: `${blockedDeliverables.length} blocked deliverable(s)`, sourceIds: blockedDeliverables.map((item) => item.id) });
  if (overdueDeliverables.length) signals.push({ id: "overdue-deliverables", severity: "amber", label: `${overdueDeliverables.length} overdue deliverable(s)`, sourceIds: overdueDeliverables.map((item) => item.id) });
  if (pendingReviews.length) signals.push({ id: "pending-governance", severity: "amber", label: `${pendingReviews.length} governance decision(s) pending`, sourceIds: pendingReviews.map((item) => item.id) });
  if (failedRuns.length) signals.push({ id: "failed-agent-runs", severity: "amber", label: `${failedRuns.length} failed agent run(s)`, sourceIds: failedRuns.map((item) => item.id) });
  if (stale) signals.push({ id: "stale-data", severity: "amber", label: "Project source is older than seven days", sourceIds: [pmo.project.id] });
  if (!signals.length) signals.push({ id: "within-tolerance", severity: "green", label: "No critical delivery or governance signals detected", sourceIds: [pmo.project.id] });
  const calculated: SteercoRag = insufficient ? "unknown" : signals.some((item) => item.severity === "red") ? "red" : signals.some((item) => item.severity === "amber") ? "amber" : signals.some((item) => item.severity === "unknown") ? "unknown" : "green";
  const milestones = pmo.milestones.filter((item) => inPeriod(item.date));
  const decisions = pmo.meetings.filter((item) => inPeriod(item.date)).flatMap((meeting, index) => meeting.decisions.map((text, decisionIndex) => claim(`decision-${index}-${decisionIndex}`, text, "fact", [meeting.id])));
  const section = (items: SteercoClaim[], empty: string) => items.length ? items : [claim(`missing-${empty.toLowerCase().replaceAll(" ", "-")}`, empty, "missing")];
  return {
    schemaVersion: "1.0.0", id: `STEERCO-${Date.now()}`, revision: 1, status: "draft", period, generatedAt, generatedBy: actor,
    generatedWith: { model: "pending-n8n-ai", promptVersion: "steerco-prompt-1.0.0", rulesVersion: "steerco-rag-1.0.0" },
    sourceRevision: { pmo: pmo.revision, skills: skills.revision }, dataFreshness: { lastSynchronizedAt: pmo.project.updatedAt, stale, notes: stale ? ["Project data is older than seven days."] : [] },
    rag: { calculated, effective: calculated, signals },
    executiveSummary: [claim("ai-pending", "AI narrative has not yet been generated. Verified metrics and source records are ready for the governed n8n generation step.", "missing", [pmo.project.id])],
    sections: {
      milestones: section(milestones.map((item) => claim(item.id, `${item.title}: ${item.status.replaceAll("_", " ")} on ${item.date}.`, "fact", [item.id])), "No milestone changes in this period."),
      deliverables: section(pmo.deliverables.filter((item) => inPeriod(item.dueDate)).map((item) => claim(item.id, `${item.title}: ${item.progress}% complete, ${item.status.replaceAll("_", " ")}.`, "fact", [item.id])), "No deliverables fall in this period."),
      risks: section(openRisks.slice(0, 5).map((item) => claim(item.id, `${item.title}: exposure ${item.probability * item.impact}, ${item.state}.`, "fact", [item.id])), "No open risks recorded."),
      decisions: section(decisions, "No decisions captured in this period."),
      overdueActions: section(overdueActions.map((item) => claim(item.id, `${item.text} — ${item.owner}, due ${item.dueDate}.`, "fact", [item.meetingId])), "No overdue actions detected."),
      upcoming: section(pmo.milestones.filter((item) => item.status !== "complete" && item.date > period.to).slice(0, 5).map((item) => claim(item.id, `${item.title} on ${item.date}.`, "fact", [item.id])), "No upcoming milestone recorded."),
      framework: [claim("framework-version", `Skill framework ${skills.framework.version}; ${skills.skills.filter((item) => item.status === "approved").length} approved skills.`, "metric", skills.skills.filter((item) => item.status === "approved").map((item) => item.id))],
      taxonomy: [claim("taxonomy-readiness", `${skills.kfla.length}/38 KFLA public-metadata records and ${skills.groups.length} governed skill groups are available.`, "metric", skills.kfla.map((item) => item.id))],
      mappings: [claim("mapping-coverage", `${skills.mappings.filter((item) => item.status === "approved").length} approved job-to-skill mappings across ${skills.jobDescriptions.length} job descriptions.`, "metric", skills.mappings.map((item) => item.id))],
      automation: [claim("agent-health", `${failedRuns.length} failed run(s); ${skills.agentTools.filter((item) => item.lifecycleStatus === "active").length} active controlled agent tools.`, "metric", failedRuns.map((item) => item.id))],
      governance: [claim("governance-state", `${pendingReviews.length} pending review(s); approved release revision ${skills.publication.revision}.`, "metric", pendingReviews.map((item) => item.id))],
      changes: section(pmo.activity.filter((item) => inPeriod(item.timestamp)).slice(0, 8).map((item) => claim(item.id, item.message, "fact", [item.entityId || item.id])), "No recorded project changes in this period."),
    }, publication: { classification: "steerco_read_only" }, audit: [{ id: `AUD-${Date.now()}`, event: "steerco.draft_created", actor, at: generatedAt }],
  };
}

export function applySteercoApproval(snapshot: SteercoSnapshot, actor: string, reason: string): SteercoSnapshot {
  if (!actor.trim() || !reason.trim()) throw new Error("Approver and approval reason are required.");
  if (snapshot.executiveSummary.some((item) => item.kind === "missing")) throw new Error("Generate and review the AI executive summary before approval.");
  const at = new Date().toISOString();
  return { ...snapshot, status: "approved", approvedAt: at, approvedBy: actor.trim(), approvalReason: reason.trim(), audit: [...snapshot.audit, { id: `AUD-${Date.now()}`, event: "steerco.approved", actor: actor.trim(), at, reason: reason.trim() }] };
}

export function applySteercoRagOverride(snapshot: SteercoSnapshot, value: SteercoRag, actor: string, reason: string): SteercoSnapshot {
  if (!actor.trim() || !reason.trim()) throw new Error("Override actor and evidence-based reason are required.");
  const at = new Date().toISOString();
  return { ...snapshot, rag: { ...snapshot.rag, effective: value, override: { value, actor: actor.trim(), reason: reason.trim(), at } }, audit: [...snapshot.audit, { id: `AUD-${Date.now()}`, event: "steerco.rag_overridden", actor: actor.trim(), at, reason: reason.trim() }] };
}

export function rejectSteercoDraft(snapshot: SteercoSnapshot, actor: string, reason: string): SteercoSnapshot {
  if (!actor.trim() || !reason.trim()) throw new Error("Reviewer and rejection reason are required.");
  const at = new Date().toISOString();
  return { ...snapshot, status: "rejected", revision: snapshot.revision + 1, audit: [...snapshot.audit, { id: `AUD-${Date.now()}`, event: "steerco.rejected", actor: actor.trim(), at, reason: reason.trim() }] };
}
