import { expect, test } from "@playwright/test";
import { bootstrapSkillWorkspace } from "../src/lib/skill-fixtures";
import type { PmoDocument } from "../src/lib/pmo-schema";
import { applySteercoApproval, applySteercoRagOverride, buildSteercoEvidence, rejectSteercoDraft, resolveSteercoPeriod, SteercoSnapshotSchema } from "../src/lib/steerco-schema";

const pmo: PmoDocument = {
  schemaVersion: "1.0", revision: 12,
  project: { id: "DEKRA-PILOT", name: "DEKRA Pilot", subtitle: "Governed pilot", phase: "Validation", startDate: "2026-07-01", endDate: "2026-12-31", overallRag: "amber", progress: 62, updatedAt: new Date().toISOString() },
  workstreams: [{ id: "WS-1", name: "Framework", shortName: "SDF", owner: "PMO", progress: 62, rag: "amber" }],
  milestones: [{ id: "M-1", title: "Pilot validation", phase: "Validation", date: "2026-08-20", status: "at_risk", owner: "PMO", description: "Validate representative roles." }],
  deliverables: [{ id: "DEL-1", title: "Approved taxonomy", workstream: "WS-1", dueDate: "2026-08-05", status: "blocked", owner: "Steward", progress: 70, priority: "P1" }],
  risks: [{ id: "R-1", title: "Licensed content boundary", description: "Approval pending", probability: 4, impact: 5, state: "open", owner: "Steward", mitigation: "Keep protected content backend-only.", updatedAt: "2026-08-01" }],
  meetings: [{ id: "MTG-SC-1", title: "SteerCo 7", date: "2026-08-01", type: "steering", participants: ["Sponsor"], summary: "Pilot review", decisions: ["Keep licensed content deferred."], actions: [{ text: "Confirm pilot roles", owner: "Job architect", dueDate: "2026-08-03" }] }],
  activity: [{ id: "ACT-1", timestamp: "2026-08-08T10:00:00.000Z", type: "automation", actor: "n8n", message: "Validated governed release.", entityId: "REL-11" }],
};

test("resolves adjustable reporting periods without mutating approved periods", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  expect(resolveSteercoPeriod("current_month", pmo, now)).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
  expect(resolveSteercoPeriod("previous_month", pmo, now)).toMatchObject({ from: "2026-07-01", to: "2026-07-31" });
  expect(resolveSteercoPeriod("since_last_steerco", pmo, now)).toMatchObject({ from: "2026-08-01", to: "2026-08-10" });
  expect(resolveSteercoPeriod("custom", pmo, now, { from: "2026-07-15", to: "2026-08-05" })).toMatchObject({ from: "2026-07-15", to: "2026-08-05" });
});

test("derives red status from governed signals and retains source lineage", () => {
  const period = resolveSteercoPeriod("custom", pmo, new Date(), { from: "2026-08-01", to: "2026-08-31" });
  const snapshot = buildSteercoEvidence(pmo, bootstrapSkillWorkspace, period, "PMO Lead");
  expect(snapshot.rag.calculated).toBe("red");
  expect(snapshot.rag.signals.find((item) => item.id === "critical-risks")?.sourceIds).toContain("R-1");
  expect(snapshot.sections.decisions[0].sourceIds).toContain("MTG-SC-1");
  expect(SteercoSnapshotSchema.safeParse(snapshot).success).toBe(true);
});

test("blocks approval until an evidence-linked AI narrative exists", () => {
  const period = resolveSteercoPeriod("current_month", pmo, new Date("2026-08-10T12:00:00Z"));
  const snapshot = buildSteercoEvidence(pmo, bootstrapSkillWorkspace, period, "PMO Lead");
  expect(() => applySteercoApproval(snapshot, "Sponsor", "Reviewed cited evidence.")).toThrow(/Generate and review/);
  const generated = { ...snapshot, executiveSummary: [{ id: "AI-1", text: "A critical licensed-content risk and a blocked taxonomy deliverable require SteerCo attention.", kind: "ai_narrative" as const, sourceIds: ["R-1", "DEL-1"] }] };
  const approved = applySteercoApproval(generated, "Sponsor", "Reviewed source R-1 and DEL-1.");
  expect(approved.status).toBe("approved");
  expect(approved.approvedBy).toBe("Sponsor");
  expect(approved.audit.at(-1)?.event).toBe("steerco.approved");
});

test("rejects inverted custom periods", () => {
  const period = resolveSteercoPeriod("custom", pmo, new Date(), { from: "2026-08-20", to: "2026-08-01" });
  expect(() => buildSteercoEvidence(pmo, bootstrapSkillWorkspace, period, "PMO Lead")).toThrow(/start must be/);
});

test("uses unknown for insufficient evidence and audits accountable overrides", () => {
  const empty = { ...pmo, milestones: [], deliverables: [], risks: [], meetings: [], activity: [] };
  const period = resolveSteercoPeriod("current_month", empty, new Date("2026-08-10T12:00:00Z"));
  const snapshot = buildSteercoEvidence(empty, bootstrapSkillWorkspace, period, "PMO Lead");
  expect(snapshot.rag.calculated).toBe("unknown");
  const overridden = applySteercoRagOverride(snapshot, "amber", "Programme Lead", "Delivery evidence is being refreshed and requires attention.");
  expect(overridden.rag.calculated).toBe("unknown");
  expect(overridden.rag.effective).toBe("amber");
  expect(overridden.audit.at(-1)?.event).toBe("steerco.rag_overridden");
});

test("records rejection without making the draft publishable", () => {
  const period = resolveSteercoPeriod("current_month", pmo, new Date("2026-08-10T12:00:00Z"));
  const snapshot = buildSteercoEvidence(pmo, bootstrapSkillWorkspace, period, "PMO Lead");
  const rejected = rejectSteercoDraft(snapshot, "Sponsor", "Narrative requires stronger evidence.");
  expect(rejected.status).toBe("rejected");
  expect(rejected.audit.at(-1)?.event).toBe("steerco.rejected");
});
