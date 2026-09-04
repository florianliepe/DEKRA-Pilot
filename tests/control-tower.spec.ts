import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import JSZip from "jszip";
import { bootstrapPmoData as pmoDocument } from "../src/lib/pmo-fixtures";
import type { PmoDocument } from "../src/lib/pmo-schema";
import { bootstrapSkillWorkspace } from "../src/lib/skill-fixtures";
import type { SkillWorkspace } from "../src/lib/skill-schema";
import { buildSteercoEvidence, resolveSteercoPeriod, type SteercoSnapshot } from "../src/lib/steerco-schema";

const testDocument: PmoDocument = {
  ...pmoDocument,
  revision: 7,
  project: { ...pmoDocument.project, name: "SBO Pilot", subtitle: "Skill-based organisation pilot", phase: "Mobilisation", progress: 28, overallRag: "amber", updatedAt: "2026-08-05T09:30:00.000Z" },
  workstreams: [{ id: "WS1", name: "Programme mobilisation", shortName: "Mobilisation", owner: "PMO Lead", progress: 35, rag: "amber" }],
  milestones: [{ id: "M-1", title: "Mobilisation gate", phase: "Mobilisation", date: "2026-09-15", status: "upcoming", owner: "Programme Lead", description: "Confirm mobilisation evidence." }],
  deliverables: [{ id: "DEL-1", title: "Pilot charter", workstream: "WS1", dueDate: "2026-09-05", status: "in_progress", owner: "PMO Lead", progress: 45, priority: "P1" }],
  risks: [{ id: "R-1", title: "Decision latency", description: "Gate decisions may arrive late.", probability: 3, impact: 4, state: "open", owner: "Programme Lead", mitigation: "Pre-wire steering decisions.", updatedAt: "2026-08-05" }],
  meetings: [{ id: "MTG-1", title: "Weekly PMO", date: "2026-08-05", type: "working_session", participants: ["PMO Lead"], summary: "Reviewed delivery and exposure.", decisions: ["Keep weekly cadence."], actions: [{ text: "Prepare gate pack", owner: "PMO Lead", dueDate: "2026-08-12" }] }],
  activity: [{ id: "ACT-1", timestamp: "2026-08-05T09:30:00.000Z", type: "update", actor: "PMO Lead", message: "Updated pilot workspace." }],
};

const pageErrors = new WeakMap<Page, string[]>();

async function workbookFixture() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Risks" sheetId="1" r:id="rId1"/><sheet name="Milestones" sheetId="2" r:id="rId2"/></sheets>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`);
  const sheet = (value: string) => `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${value}</t></is></c></row></sheetData></worksheet>`;
  zip.file("xl/worksheets/sheet1.xml", sheet("Supplier dependency"));
  zip.file("xl/worksheets/sheet2.xml", sheet("Mobilisation gate"));
  return zip.generateAsync({ type: "nodebuffer" });
}

async function presentationFixture() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>");
  zip.file("ppt/slides/slide1.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Application service outcomes</a:t></a:r></a:p><a:p><a:r><a:t>Coordinate incidents and releases</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  zip.file("ppt/slides/slide2.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Resolve ownership ambiguity</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  let mappingRunState: SkillWorkspace["agentRuns"][number] | undefined;
  let mappedWorkspace: SkillWorkspace | undefined;
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://api.github.com/repos/florianliepe/DEKRA-Pilot/contents/data/skill-workspace.approved.json**", async (route) => {
    const approved = { ...bootstrapSkillWorkspace, revision: 0, publication: { ...bootstrapSkillWorkspace.publication, revision: 0, state: "approved_release" as const } };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ encoding: "base64", sha: "approved-blob-sha", content: Buffer.from(JSON.stringify(approved), "utf8").toString("base64") }) });
  });
  await page.route("**/webhook/**", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { mode?: string; runId?: string; document?: PmoDocument; workspace?: SkillWorkspace; jobDescriptionId?: string; sessionId?: string; idempotencyKey?: string; targetRevision?: number; meta?: { wpId?: string }; extracted?: Array<{ name?: string; type?: string; content?: string }>; evidenceDraft?: SteercoSnapshot; snapshot?: SteercoSnapshot };
    if (body.mode === "skill.read") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, workspace: bootstrapSkillWorkspace }) });
      return;
    }
    if (body.mode === "skill.health") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, health: { status: "operational", checkedAt: new Date().toISOString(), schemaVersion: 3, revision: bootstrapSkillWorkspace.revision, frameworkVersion: bootstrapSkillWorkspace.framework.version, pendingReviews: bootstrapSkillWorkspace.reviewQueue.filter((item) => item.status === "pending").length, failedRuns: 0, activeAgentTools: 11, requiredAgentTools: 11, receiptCount: 3, auditEvents: bootstrapSkillWorkspace.auditLog.length, lastUpdatedAt: bootstrapSkillWorkspace.updatedAt } }) });
      return;
    }
    if (body.mode === "skill.save" && body.workspace) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, workspace: body.workspace }) });
      return;
    }
    if (body.mode === "skill.ingest") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, workspace: bootstrapSkillWorkspace, proposals: bootstrapSkillWorkspace.reviewQueue, message: "2 governed proposals added to review." }) });
      return;
    }
    if (body.mode === "skill.map_job.start" && body.workspace && body.jobDescriptionId && body.runId) {
      mappedWorkspace = structuredClone(body.workspace);
      mappingRunState = { id: body.runId, mode: "job_mapping", status: "queued", jobDescriptionId: body.jobDescriptionId, stage: "Preparing evidence", progress: 5, model: "claude-sonnet-5", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tools: [], trace: [] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, mappingRun: mappingRunState, pollAfterMs: 2000, message: "Mapping run queued. It will continue if this page is closed." }) });
      return;
    }
    if (body.mode === "skill.map_job.status" && mappingRunState && mappedWorkspace) {
      mappingRunState = { ...mappingRunState, status: "needs_review", stage: "Preparing review suggestion", progress: 100, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tools: ["read_catalog", "map_job_skills", "create_review_draft"], trace: [{ step: "Catalog grounding", result: "Approved catalog loaded." }] };
      mappedWorkspace.agentRuns = [mappingRunState, ...mappedWorkspace.agentRuns.filter((run) => run.id !== mappingRunState!.id)];
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, mappingRun: mappingRunState, workspace: mappedWorkspace }) });
      return;
    }
    if (body.mode === "skill.map_job.result" && mappingRunState && mappedWorkspace) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, mappingRun: mappingRunState, workspace: mappedWorkspace, message: "AI mapping draft added to human review." }) });
      return;
    }
    if (body.mode === "skill.ingest_job") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, workspace: bootstrapSkillWorkspace, message: "Job evidence normalized into governed working state." }) });
      return;
    }
    if (body.mode === "skill.elicitation" && body.workspace && body.sessionId) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, workspace: body.workspace, message: "AI elicitation assistance saved as a draft." }) });
      return;
    }
    if (body.mode === "steerco.generate" && body.evidenceDraft) {
      const snapshot = { ...body.evidenceDraft, revision: body.evidenceDraft.revision + 1, generatedWith: { model: "claude-sonnet-5", promptVersion: "steerco-prompt-1.0.0", rulesVersion: "steerco-rag-1.0.0" }, executiveSummary: [{ id: "AI-1", text: "Delivery requires attention because a critical risk remains open; the cited project evidence supports escalation.", kind: "ai_narrative" as const, sourceIds: ["R-1"] }] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, snapshot }) }); return;
    }
    if (body.mode === "steerco.approve" && body.snapshot) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, snapshot: { ...body.snapshot, status: "approved", revision: body.snapshot.revision + 1 } }) }); return;
    }
    if (body.mode === "steerco.reject" && body.snapshot) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, snapshot: { ...body.snapshot, status: "rejected", revision: body.snapshot.revision + 1 } }) }); return;
    }
    if (body.mode === "steerco.publish" && body.snapshot) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, snapshot: { ...body.snapshot, status: "published", revision: body.snapshot.revision + 1, publishedAt: new Date().toISOString(), publication: { ...body.snapshot.publication, shareId: "public-safe-share-123", checksum: "a".repeat(64) } } }) }); return;
    }
    if (body.mode === "steerco.rollback") {
      const period = resolveSteercoPeriod("custom", testDocument, new Date(), { from: "2026-08-01", to: "2026-08-31" });
      const base = buildSteercoEvidence(testDocument, bootstrapSkillWorkspace, period, "PMO Lead");
      const snapshot: SteercoSnapshot = { ...base, status: "published", revision: (body.targetRevision || 1) + 5, approvedAt: "2026-08-10T10:00:00.000Z", approvedBy: "Programme Sponsor", approvalReason: "Reviewed cited evidence.", publishedAt: new Date().toISOString(), executiveSummary: [{ id: "AI-1", text: "A prior immutable release was restored through accountable governance.", kind: "ai_narrative", sourceIds: ["R-1"] }], publication: { classification: "steerco_read_only", shareId: "restored-safe-share-456", checksum: "b".repeat(64), githubPath: "knowledge/steerco/releases/restored.json", githubCommit: "rollback-commit-receipt" } };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, snapshot }) }); return;
    }
    if (body.mode === "steerco.read") {
      const period = resolveSteercoPeriod("custom", testDocument, new Date(), { from: "2026-08-01", to: "2026-08-31" });
      const base = buildSteercoEvidence(testDocument, bootstrapSkillWorkspace, period, "PMO Lead");
      const snapshot: SteercoSnapshot = { ...base, status: "published", approvedAt: "2026-08-10T10:00:00.000Z", approvedBy: "Programme Sponsor", approvalReason: "Reviewed cited evidence.", publishedAt: "2026-08-10T11:00:00.000Z", executiveSummary: [{ id: "AI-1", text: "Delivery remains under active Steering Committee attention.", kind: "ai_narrative", sourceIds: ["R-1"] }], publication: { classification: "steerco_read_only", shareId: "public-safe-share-123", checksum: "a".repeat(64), githubPath: "knowledge/steerco/releases/test.json", githubCommit: "commit-receipt" } };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, snapshot }) }); return;
    }
    if (body.mode === "pmo.save" && body.document) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, source: "github", storageConfigured: true, document: { ...body.document, revision: body.document.revision + 1 } }),
      });
      return;
    }
    if (body.mode === "pmo.ingest") {
      const orchestrated: PmoDocument = { ...testDocument, revision: testDocument.revision + 1, risks: [{ id: "R-AUTO", title: "Automated supplier dependency", description: "Detected from the written update.", probability: 3, impact: 3, state: "monitoring", owner: "PMO Lead", mitigation: "Validate dependency at the next checkpoint.", updatedAt: "2026-08-06" }, ...testDocument.risks] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, source: "github", storageConfigured: true, wpId: body.meta?.wpId, committedFiles: [], appliedChanges: [{ entity: "risk", action: "create", id: "R-AUTO" }], document: orchestrated }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, source: "github", storageConfigured: true, document: testDocument }) });
  });
  await page.goto("/");
  await page.getByLabel("Shared pilot password").fill("pilot-test-password");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Executive overview" })).toBeVisible();
});

test("hydrates without client-side exceptions", async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test("navigates through every core PMO view", async ({ page }) => {
  const views = [
    ["Workbench intake", "Turn project evidence into controlled updates."],
    ["Plan & deliverables", "Deliverable register"],
    ["Risks & issues", "Exposure matrix"],
    ["Meeting hub", "Turn discussions into decisions, actions and evidence."],
    ["Activity log", "Connected systems"],
    ["Skill designer", "From role evidence to governed capability."],
  ];
  const navigationRegion = page.getByRole("navigation", { name: "Primary navigation" });

  for (const [navigation, heading] of views) {
    await navigationRegion.getByRole("button", { name: navigation }).click();
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
  }
});

test("captures a new risk and marks the workspace dirty", async ({ page }) => {
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByLabel("Title").fill("Decision latency threatens Gate 1");
  await page.getByLabel("Owner").fill("Programme Director");
  await page.getByLabel("Mitigation").fill("Pre-wire decisions before the gate review.");
  await page.getByLabel("Description").fill("Open decisions are not closing within the agreed cadence.");
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await page.getByRole("button", { name: "Risks & issues" }).click();
  await expect(page.getByText("Decision latency threatens Gate 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish changes" })).toBeEnabled();
});

test("offers lean multimodal intake and applies orchestrated changes", async ({ page }) => {
  await page.getByRole("button", { name: "Workbench intake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Turn project evidence into controlled updates." })).toBeVisible();
  await expect(page.getByLabel("Evidence files")).toHaveAttribute("multiple", "");
  await expect(page.getByLabel("Evidence files")).toHaveAttribute("accept", /\.pdf/);
  await expect(page.getByText("Evidence verifier", { exact: true })).toBeVisible();
  await expect(page.getByText("Risk analyst", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Workspace secret")).toHaveCount(0);
  await page.getByLabel("Write a project update").fill("A supplier dependency threatens the mobilisation gate and needs active monitoring.");
  await page.getByRole("button", { name: "Analyse and update workbench" }).click();
  await expect(page.getByText(/applied as 1 workbench change/)).toBeVisible();
  await page.getByRole("button", { name: "Risks & issues" }).click();
  await expect(page.getByText("Automated supplier dependency")).toBeVisible();
});

test("extracts every Excel worksheet before orchestration", async ({ page }) => {
  await page.getByRole("button", { name: "Workbench intake", exact: true }).click();
  await page.getByLabel("Evidence files").setInputFiles({
    name: "programme-evidence.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await workbookFixture(),
  });
  const requestPromise = page.waitForRequest((request) => request.url().includes("/webhook/") && request.postDataJSON()?.mode === "pmo.ingest");
  await page.getByRole("button", { name: "Analyse and update workbench" }).click();
  const body = (await requestPromise).postDataJSON() as { extracted: Array<{ name: string; type: string; content: string }> };
  const workbook = body.extracted.find((item) => item.name === "programme-evidence.xlsx");
  expect(workbook?.type).toBe("xlsx");
  expect(workbook?.content).toContain("## Sheet: Risks");
  expect(workbook?.content).toContain("Supplier dependency");
  expect(workbook?.content).toContain("## Sheet: Milestones");
  expect(workbook?.content).toContain("Mobilisation gate");
});

test("submits a written update with the documented keyboard shortcut", async ({ page }) => {
  await page.getByRole("button", { name: "Workbench intake", exact: true }).click();
  const composer = page.getByLabel("Write a project update");
  await composer.fill("The mobilisation gate needs a dependency review.");
  const requestPromise = page.waitForRequest((request) => request.url().includes("/webhook/") && request.postDataJSON()?.mode === "pmo.ingest");
  await composer.press("Control+Enter");
  await requestPromise;
  await expect(page.getByText(/analysed by n8n/)).toBeVisible();
});

test("edits the project profile and workstream fields", async ({ page }) => {
  await page.getByRole("button", { name: "Edit project profile" }).click();
  await page.getByLabel("Project name").fill("SBO Pilot Workbench");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByRole("heading", { name: "SBO Pilot Workbench" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Mobilisation" }).click();
  await page.getByLabel("Short name").fill("Pilot mobilisation");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByText("Pilot mobilisation", { exact: true })).toBeVisible();
});

test("protects linked workstreams and deletes unlinked workstreams", async ({ page }) => {
  await page.getByRole("button", { name: "Delete Mobilisation" }).click();
  await expect(page.getByRole("heading", { name: "Resolve linked records first" })).toBeVisible();
  await expect(page.getByText(/Move or delete 1 linked deliverable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Dependencies remain" })).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Change enablement");
  await page.getByLabel("Short name").fill("Enablement");
  await page.getByLabel("Owner").fill("Change Lead");
  await page.getByRole("button", { name: "Add to workbench" }).click();
  await expect(page.getByText("Enablement", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Enablement" }).click();
  await page.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByText("Enablement", { exact: true })).toHaveCount(0);
});

test("publishes local CRUD changes through the protected workflow", async ({ page }) => {
  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByLabel("Title").fill("Publish-path verification");
  await page.getByLabel("Owner").fill("PMO Lead");
  await page.getByLabel("Mitigation").fill("Verify the protected save operation.");
  await page.getByLabel("Description").fill("Confirms that local changes reach the canonical repository.");
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await page.getByRole("button", { name: "Publish changes" }).click();
  const saveRequest = page.waitForRequest((request) => request.url().includes("/webhook/") && request.postDataJSON()?.mode === "pmo.save");
  await page.getByRole("button", { name: "Publish to GitHub" }).click();
  const body = (await saveRequest).postDataJSON() as { mode: string; document: PmoDocument };
  expect(body.mode).toBe("pmo.save");
  expect(body.document.risks.some((risk) => risk.title === "Publish-path verification")).toBe(true);
  await expect(page.getByRole("button", { name: "All changes saved" })).toBeDisabled();
});

test("updates and deletes delivery records", async ({ page }) => {
  await page.getByRole("button", { name: "Plan & deliverables" }).click();
  await page.getByRole("button", { name: "Edit Pilot charter" }).click();
  await page.getByLabel("Title").fill("Approved pilot charter");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByText("Approved pilot charter")).toBeVisible();
  await page.getByRole("button", { name: "Delete Approved pilot charter" }).click();
  await page.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByText("Approved pilot charter")).toHaveCount(0);
});

test("updates and deletes risks and meetings", async ({ page }) => {
  await page.getByRole("button", { name: "Risks & issues" }).click();
  await page.getByRole("button", { name: "Edit Decision latency" }).click();
  await page.getByLabel("Mitigation").fill("Escalate open decisions 48 hours before steering.");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByText("Escalate open decisions 48 hours before steering.")).toBeVisible();

  await page.getByRole("button", { name: "Meeting hub" }).click();
  await page.getByRole("button", { name: "Edit Weekly PMO" }).click();
  await page.getByLabel("Summary").fill("Reviewed delivery, exposure and decision readiness.");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByText("Reviewed delivery, exposure and decision readiness.")).toBeVisible();
  await page.getByRole("button", { name: "Delete Weekly PMO" }).click();
  await page.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByText("Weekly PMO")).toHaveCount(0);
});

test("supports mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Meeting hub" }).click();
  await expect(page.getByRole("heading", { name: "Meeting hub" })).toBeVisible();
});

test("opens the governed Skill Designer with all nine workspaces", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "From role evidence to governed capability." })).toBeVisible();
  for (const name of ["Overview", "Intake & interview", "Skill library", "Taxonomy", "Jobs & mapping", "Role profiles", "Strategic vectors", "Review queue", "Agent runs"]) {
    await expect(page.getByRole("tab", { name: new RegExp(name) })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Taxonomy" }).click();
  await expect(page.getByRole("heading", { name: "38 KFLA competency names" })).toBeVisible();
  await expect(page.locator(".kfla-grid .kfla-card")).toHaveCount(38);
});

test("explores the read-only ZM-14 architecture map and exports its Mermaid view", async ({ page }) => {
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Skill designer" }).click();
  await page.getByRole("tab", { name: "Architecture map" }).click();

  await expect(page.getByRole("heading", { name: "Understand the model before changing it." })).toBeVisible();
  const thought = page.getByRole("button", { name: /Thought.*3 clusters.*10 competencies/ });
  await expect(thought).toHaveAttribute("aria-expanded", "false");
  await thought.click();
  await expect(thought).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Business context.*4 competencies/ })).toBeVisible();

  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(page.getByRole("button", { name: /Data Visualization.*technical.*approved/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Skill Taxonomy Design.*technical.*in_review/ })).toHaveCount(0);
  await page.getByLabel("In review").check();
  await expect(page.getByRole("button", { name: /Skill Taxonomy Design.*technical.*in_review/ })).toBeVisible();
  await page.getByLabel("Draft").check();
  await expect(page.getByRole("button", { name: /Curiosity.*trait.*draft/ })).toBeVisible();

  await page.getByRole("button", { name: /Managing Complexity.*competency.*approved/ }).click();
  await expect(page.getByRole("definition").filter({ hasText: /Thought.*Complex decisions/ })).toBeVisible();
  await expect(page.locator(".architecture-mermaid svg")).toBeVisible({ timeout: 15000 });

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .mmd" }).click();
  await expect((await download).suggestedFilename()).toBe("dekra-skill-architecture.mmd");

  await page.getByRole("button", { name: /Open taxonomy workbench/ }).first().click();
  await expect(page.getByRole("heading", { name: "Design, test and release a consistent capability language." })).toBeVisible();
  expect(pageErrors.get(page)).toEqual([]);
});

test("explores taxonomy dependencies and overlap without mutating canonical concepts", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Taxonomy" }).click();
  await page.getByRole("button", { name: "Graph & overlap" }).click();
  await expect(page.getByRole("heading", { name: "Explore structure, overlap and dependency impact" })).toBeVisible();
  await page.getByLabel("Search taxonomy graph").fill("Data Visualization");
  await page.getByRole("button", { name: /Data Visualization/ }).click();
  await expect(page.locator(".graph-inspector").getByRole("heading", { name: "Data Visualization" })).toBeVisible();
  await expect(page.locator(".graph-impact")).toContainText("total dependencies");
  const saveRequest = page.waitForRequest((request) => request.postDataJSON()?.mode === "skill.save");
  await page.getByRole("button", { name: "Save working state" }).click();
  const saveBody = (await saveRequest).postDataJSON() as { expectedRevision?: number; idempotencyKey?: string };
  expect(saveBody.expectedRevision).toBe(bootstrapSkillWorkspace.revision);
  expect(saveBody.idempotencyKey).toMatch(/^skill\.save:revision-/);
  await page.getByRole("button", { name: "Add governed edge" }).click();
  await expect(page.getByRole("heading", { name: "Govern relationship" })).toBeVisible();
  await expect(page.getByText("Semantic overlap signals")).toBeVisible();
});

test("creates and edits a governed core skill", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Skill library" }).click();
  await page.getByRole("button", { name: "Create skill", exact: true }).first().click();
  await page.getByLabel("Canonical name").fill("Semantic Skill Extraction");
  await page.getByLabel("Action").fill("Extract");
  await page.getByLabel("Object").fill("role capabilities");
  await page.getByLabel("Definition").fill("Derives durable capabilities from role evidence.");
  await page.getByLabel("Observable evidence").fill("Separates tasks from reusable capabilities and retains evidence.");
  await page.getByLabel("Accountable actor").fill("Skill Taxonomy Owner");
  await page.getByLabel("Governance reason").fill("Create an evidence-backed atomic capability for extraction work.");
  await page.getByRole("button", { name: "Create skill", exact: true }).last().click();
  await expect(page.getByText("Semantic Skill Extraction", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Semantic Skill Extraction" }).click();
  await page.getByLabel("Lifecycle").selectOption("approved");
  await page.getByLabel("Accountable actor").fill("Skill Taxonomy Owner");
  await page.getByLabel("Governance reason").fill("Route the validated capability to accountable approval.");
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.locator(".skill-table > div").filter({ hasText: "Semantic Skill Extraction" }).getByText("In Review", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Review queue/ }).click();
  await expect(page.getByRole("heading", { name: "Review Semantic Skill Extraction" })).toBeVisible();
});

test("previews impact and records governed skill lifecycle and bulk operations", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Skill library" }).click();
  await page.getByRole("button", { name: "Duplicate Data Visualization" }).click();
  await expect(page.getByRole("heading", { name: "Duplicate 1 skill" })).toBeVisible();
  await expect(page.getByText(/dependencies affected/)).toBeVisible();
  await page.getByLabel("Accountable actor").fill("Taxonomy Steward");
  await page.getByLabel("Governance reason").fill("Create a governed working copy for comparison.");
  await page.getByRole("button", { name: "Apply governed operation" }).click();
  await expect(page.getByText("Data Visualization copy", { exact: true })).toBeVisible();

  await page.getByLabel("Select Data Visualization", { exact: true }).check();
  await page.getByLabel("Select Data Visualization copy", { exact: true }).check();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Move 2 skills" })).toBeVisible();
  await page.getByLabel("Target skill group").selectOption("GRP-SBO");
  await page.getByLabel("Accountable actor").fill("Taxonomy Steward");
  await page.getByLabel("Governance reason").fill("Align both working concepts with the governed skill architecture group.");
  await page.getByRole("button", { name: "Apply governed operation" }).click();
  await expect(page.getByText("2 skill lifecycle operation(s) recorded as governed working state.")).toBeVisible();
  await expect(page.locator(".skill-table > div").filter({ hasText: "Data Visualization" }).first().getByText("Skill-based Organisation", { exact: true })).toBeVisible();
});

test("runs document intake through the separate Skill Designer workflow", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Intake & interview" }).click();
  await page.getByText("Role brief or responsibility statements").locator("..").getByRole("textbox").fill("Builds dashboards to explain weekly revenue movement to executive stakeholders.");
  const requestPromise = page.waitForRequest((request) => request.url().includes("skill-designer-orchestrator") && request.postDataJSON()?.mode === "skill.ingest");
  await page.getByRole("button", { name: "Extract skill proposals" }).click();
  await requestPromise;
  await expect(page.getByText("2 governed proposals added to review.")).toBeVisible();
});

test("runs a governed AI mapping and records the agent trace", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs & mapping" }).click();
  const requestPromise = page.waitForRequest((request) => request.url().includes("skill-designer-mapping-async") && request.postDataJSON()?.mode === "skill.map_job.start");
  await page.getByRole("button", { name: "Run governed mapping" }).click();
  const body = (await requestPromise).postDataJSON() as { jobDescriptionId: string; workspace: SkillWorkspace };
  expect(body.jobDescriptionId).toBe("JD-DATA");
  expect(body.workspace.schemaVersion).toBe(3);
  await expect(page.getByText("Mapping run queued. It will continue if this page is closed.")).toBeVisible();
  await expect(page.getByText("AI mapping draft added to human review.")).toBeVisible({ timeout: 12_000 });
  await page.getByRole("tab", { name: "Agent runs" }).click();
  await expect(page.getByText("Catalog grounding")).toBeVisible();
  await expect(page.getByText("Cannot approve")).toBeVisible();
});

test("creates a strategic vector linked to an approved skill", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Strategic vectors" }).click();
  await page.getByRole("button", { name: "Create vector" }).click();
  await page.getByLabel("Name").fill("Safety Innovation");
  await page.getByLabel("Strategic intent").fill("Advance safety outcomes through governed digital capabilities.");
  await page.getByLabel("Data Visualization").check();
  await page.getByLabel("Accountable actor").fill("Strategy Owner");
  await page.getByLabel("Governance reason").fill("Create a time-bound strategic capability demand signal.");
  await page.getByRole("button", { name: "Save vector" }).click();
  await expect(page.getByRole("heading", { name: "Safety Innovation" })).toBeVisible();
  await page.getByRole("button", { name: "Archive Safety Innovation" }).click();
  await page.getByLabel("Accountable actor").fill("Strategy Owner");
  await page.getByLabel("Governance reason").fill("Archive the synthetic vector while preserving mapping references.");
  await page.getByRole("button", { name: "Apply vector lifecycle" }).click();
  await expect(page.getByRole("button", { name: "Restore Safety Innovation" })).toBeVisible();
});

test("creates, edits and removes a job-description record", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs & mapping" }).click();
  await page.getByRole("button", { name: "Create job description" }).click();
  await page.getByLabel("Job title").fill("Safety Data Product Owner");
  await page.getByLabel("Job family").fill("Digital Safety");
  await page.getByLabel("Role purpose").fill("Own safety data products that improve operational decisions.");
  await page.getByLabel("Full job description").fill("Translates safety priorities into governed data products and measurable operational outcomes. Aligns stakeholders around product decisions and validates adoption evidence.");
  await page.getByLabel("Accountable actor").fill("Job Architecture Owner");
  await page.getByLabel("Governance reason").fill("Register a governed synthetic role for job-mapping verification.");
  await page.getByRole("button", { name: "Save job description" }).click();
  await expect(page.locator(".job-list").getByText("Safety Data Product Owner", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Safety Data Product Owner" }).click();
  await page.getByLabel("Role purpose").fill("Own governed safety data products and measurable adoption outcomes.");
  await page.getByLabel("Accountable actor").fill("Job Architecture Owner");
  await page.getByLabel("Governance reason").fill("Clarify the role purpose and outcome accountability.");
  await page.getByRole("button", { name: "Save job description" }).click();
  await expect(page.getByText("Own governed safety data products and measurable adoption outcomes.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Safety Data Product Owner" }).click();
  await expect(page.getByRole("heading", { name: "Archive Safety Data Product Owner?" })).toBeVisible();
  await page.getByLabel("Accountable actor").fill("Job Architecture Owner");
  await page.getByLabel("Governance reason").fill("Retire the synthetic role after lifecycle verification.");
  await page.getByRole("button", { name: "Archive job" }).click();
  await expect(page.locator(".job-list").getByText("Safety Data Product Owner", { exact: true })).toHaveCount(0);
});

test("shows ZM-11 evidence rationale, source excerpts and mapping readiness", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs & mapping" }).click();
  await expect(page.getByText("ZM-11 · EVIDENCE-GROUNDED CLARIFICATION")).toBeVisible();
  await expect(page.getByText("82%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Why this matters")).toBeVisible();
  await expect(page.getByText("Proficiency Compatibility", { exact: true })).toBeVisible();
  await expect(page.getByText("Source evidence considered")).toBeVisible();
  await expect(page.getByRole("blockquote").getByText("Analyse performance drivers and explain material movements to senior stakeholders.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run governed mapping" })).toBeEnabled();
});

test("shows ZM-12 reviewer-facing mapping explainability", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs & mapping" }).click();
  await page.getByText("Why this recommendation").first().click();
  await expect(page.getByText("direct evidence · SEG-JD-DATA-01")).toBeVisible();
  await expect(page.getByText("Build interactive dashboards to report weekly revenue metrics.", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("review ready").first()).toBeVisible();
  await expect(page.getByText("1 responsibilities").first()).toBeVisible();
});

test("extracts PPTX job evidence with ordered slide provenance", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs & mapping" }).click();
  await page.getByRole("button", { name: "Ingest job description" }).click();
  await page.getByRole("textbox", { name: "Job title" }).fill("UAT Application Manager");
  await page.getByRole("textbox", { name: "Job family" }).fill("Information Technology");
  await page.getByRole("button", { name: "Job description files" }).setInputFiles({ name: "legacy-application-manager.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: await presentationFixture() });
  const requestPromise = page.waitForRequest((request) => request.url().includes("skill-designer-orchestrator") && request.postDataJSON()?.mode === "skill.ingest_job");
  await page.getByRole("button", { name: "Ingest and normalize" }).click();
  const body = (await requestPromise).postDataJSON() as { extracted: Array<{ name: string; type: string; content: string }> };
  expect(body.extracted[0]).toMatchObject({ name: "legacy-application-manager.pptx", type: "pptx_text" });
  expect(body.extracted[0].content).toContain("## Slide 1\nApplication service outcomes\nCoordinate incidents and releases");
  expect(body.extracted[0].content).toContain("## Slide 2\nResolve ownership ambiguity");
  await expect(page.getByText("Job evidence normalized into governed working state.")).toBeVisible();
});

test("shows traceable job evidence, calibrated score quality, omissions and approved comparison", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs & mapping" }).click();
  await expect(page.getByText("TRACEABLE JOB EVIDENCE")).toBeVisible();
  await expect(page.getByText("Normalized evidence")).toBeVisible();
  await expect(page.getByText("ZM-11 · EVIDENCE-GROUNDED CLARIFICATION")).toBeVisible();
  await expect(page.getByText("Why candidate skills were omitted")).toBeVisible();
  await expect(page.getByText("Proposed versus approved baseline")).toBeVisible();
  await expect(page.getByText("VERSIONED GOLDEN EVALUATION")).toBeVisible();
  await expect(page.getByText("100% pass")).toBeVisible();
  await expect(page.locator(".mapping-evaluation-kpis").getByText("100%", { exact: true })).toHaveCount(2);
  await page.getByText(/13-part score/).first().click();
  await expect(page.getByText(/Semantic Relevance · 14% weight/).first()).toBeVisible();
  await page.getByRole("button", { name: "SEG-JD-DATA-01", exact: true }).first().click();
  await expect(page.locator(".evidence-segments button.active")).toContainText("Build interactive dashboards");
});

test("governs role-profile editing, duplication and archival with accountable impact", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Role profiles" }).click();
  await page.getByRole("button", { name: "Edit Global Reporting Analyst profile" }).click();
  await page.getByLabel("Profile purpose").fill("Turn governed operational data into trusted management insight.");
  await page.getByLabel("Accountable actor").fill("Profile Owner");
  await page.getByLabel("Governance reason").fill("Clarify the governed profile purpose and decision outcome.");
  await page.getByRole("button", { name: "Save governed profile" }).click();
  await expect(page.getByText("Turn governed operational data into trusted management insight.", { exact: true })).toBeVisible();

  await page.locator(".profile-skill select").first().selectOption("4");
  await page.getByLabel("Accountable actor").fill("Profile Owner");
  await page.getByLabel("Governance reason").fill("Raise the governed target proficiency for the selected core skill.");
  await page.getByRole("button", { name: "Apply profile skill change" }).click();

  await page.getByRole("button", { name: "Duplicate Global Reporting Analyst profile" }).click();
  await expect(page.getByRole("heading", { name: "Duplicate Global Reporting Analyst" })).toBeVisible();
  await expect(page.getByText(/dependencies are in scope/)).toBeVisible();
  await page.getByLabel("Accountable actor").fill("Profile Owner");
  await page.getByLabel("Governance reason").fill("Create a calibrated successor profile for comparison.");
  await page.getByRole("button", { name: "Apply governed action" }).click();
  await expect(page.getByRole("heading", { name: "Global Reporting Analyst copy" })).toBeVisible();

  await page.getByRole("button", { name: "Archive Global Reporting Analyst copy profile" }).click();
  await page.getByLabel("Accountable actor").fill("Profile Owner");
  await page.getByLabel("Governance reason").fill("Archive the comparison draft after governance review.");
  await page.getByRole("button", { name: "Apply governed action" }).click();
  await expect(page.getByRole("button", { name: "Restore Global Reporting Analyst copy profile" })).toBeVisible();
});

test("governs controlled-tool duplication and merge with dependency migration", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Taxonomy" }).click();
  await page.getByRole("button", { name: "Controlled tools" }).click();
  await page.getByRole("button", { name: "Duplicate Power BI" }).click();
  await expect(page.getByRole("heading", { name: "Duplicate Power BI" })).toBeVisible();
  await expect(page.getByText(/linked skills and .* job mappings/)).toBeVisible();
  await page.getByLabel("Accountable actor").fill("Tool Steward");
  await page.getByLabel("Governance reason").fill("Create a governed comparison tool record.");
  await page.getByRole("button", { name: "Apply governed tool action" }).click();
  await expect(page.getByText("Power BI copy", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Merge Power BI", exact: true }).click();
  await page.getByLabel("Target controlled tool").selectOption({ label: "Power BI copy" });
  await page.getByLabel("Accountable actor").fill("Tool Steward");
  await page.getByLabel("Governance reason").fill("Consolidate mapping references into the governed successor.");
  await page.getByRole("button", { name: "Apply governed tool action" }).click();
  await expect(page.getByText("Replaced by Power BI copy", { exact: true })).toBeVisible();
});

test("creates and archives a governed validation rule", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Configuration" }).click();
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByRole("heading", { name: "Save framework configuration" })).toBeVisible();
  await page.getByLabel("Accountable actor").fill("Framework Owner");
  await page.getByLabel("Evidence-based reason").fill("Confirm the governed language and thirteen-weight configuration.");
  await page.getByRole("button", { name: "Save governed configuration" }).click();
  await page.getByRole("button", { name: "Add rule" }).click();
  await page.getByLabel("Name").fill("Outcome traceability");
  await page.getByLabel("Affected field").fill("outcomes");
  await page.getByLabel("Description").fill("Every approved skill must retain an observable outcome.");
  await page.getByLabel("Suggested correction").fill("Add an outcome and supporting evidence reference.");
  await page.getByLabel("Blocks approved release").check();
  await page.getByLabel("Accountable actor").fill("Framework Owner");
  await page.getByLabel("Evidence-based reason").fill("Add a release-blocking traceability contract.");
  await page.getByRole("button", { name: "Save governed rule" }).click();
  await expect(page.getByText("Outcome traceability", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive Outcome traceability" }).click();
  await page.getByLabel("Accountable actor").fill("Framework Owner");
  await page.getByLabel("Evidence-based reason").fill("Archive the pilot rule while preserving its governed history.");
  await page.getByRole("button", { name: "Apply governed action" }).click();
  await expect(page.getByRole("button", { name: "Restore Outcome traceability" })).toBeVisible();
});

test("governs source, evidence and proficiency records", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Evidence & levels" }).click();
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByLabel("Source title").fill("Synthetic safety role workshop");
  await page.getByLabel("Source type").selectOption("workshop");
  await page.getByLabel("Accountable actor").fill("Evidence Steward");
  await page.getByLabel("Evidence-based reason").fill("Register the synthetic source for evidence lifecycle testing.");
  await page.getByRole("button", { name: "Save governed source" }).click();
  await expect(page.getByText("Synthetic safety role workshop", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive source Synthetic safety role workshop" }).click();
  await page.getByLabel("Accountable actor").fill("Evidence Steward");
  await page.getByLabel("Evidence-based reason").fill("Archive the synthetic source after the lifecycle verification.");
  await page.getByRole("button", { name: "Apply governed action" }).click();
  await expect(page.getByRole("button", { name: "Restore source Synthetic safety role workshop" })).toBeVisible();

  await page.getByRole("button", { name: "Add evidence" }).click();
  await page.getByLabel("Evidence summary").fill("Explains a concrete safety decision and its measurable outcome.");
  await page.getByLabel("Source location").fill("workshop note 4");
  await page.getByLabel("Supported entity IDs").fill("SK-MC, JD-DATA");
  await page.getByLabel("Accountable actor").fill("Evidence Steward");
  await page.getByLabel("Evidence-based reason").fill("Trace the workshop evidence to governed entities.");
  await page.getByRole("button", { name: "Save governed evidence" }).click();
  await expect(page.getByText("Explains a concrete safety decision and its measurable outcome.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit proficiency Application" }).click();
  await page.getByLabel("Behavioral indicators").fill("Applies the capability independently.\nExplains the resulting outcome.");
  await page.getByLabel("Accountable actor").fill("Framework Owner");
  await page.getByLabel("Evidence-based reason").fill("Make the application level observable and outcome based.");
  await page.getByRole("button", { name: "Save proficiency definition" }).click();
  await expect(page.getByText("Explains the resulting outcome.", { exact: false })).toBeVisible();
});

test("creates, edits and archives a governed multilingual label", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Languages" }).click();
  await page.getByRole("button", { name: "Add localized label" }).click();
  await page.getByLabel("Concept type").selectOption("skill");
  await page.getByLabel("Canonical concept").selectOption("SK-ST");
  await page.getByLabel("Translation language").selectOption("de");
  await page.getByRole("textbox", { name: "Localized label", exact: true }).fill("Skill-Taxonomie gestalten");
  await page.getByLabel("Localized description").fill("Gestaltet eine konsistente und kontrollierte Skill-Taxonomie.");
  await page.getByLabel("Accountable editor").fill("Terminology Owner");
  await page.getByLabel("Governance reason").fill("Add a reviewed German pilot label.");
  await page.getByRole("button", { name: "Save governed label" }).click();
  await expect(page.getByText("Skill-Taxonomie gestalten", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive localized label Skill-Taxonomie gestalten" }).click();
  await page.getByLabel("Accountable actor").fill("Terminology Owner");
  await page.getByLabel("Governance reason").fill("Retire the synthetic translation after lifecycle verification.");
  await page.getByRole("button", { name: "Apply label lifecycle" }).click();
  await expect(page.getByRole("button", { name: "Restore localized label Skill-Taxonomie gestalten" })).toBeVisible();
});

test("governs agent-tool edits and lifecycle through accountable review", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Agent tools" }).click();
  await expect(page.getByText("Deny", { exact: true })).toBeVisible();
  await page.locator(".agent-tool-cards > button").filter({ hasText: "Mapping scorer" }).click();
  await page.getByLabel("Data classification").selectOption("licensed");
  await page.getByRole("button", { name: "Simulate authorization" }).click();
  await expect(page.getByText("DATA_CLASSIFICATION_DENIED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Mapping scorer" }).click();
  await page.getByLabel("Version", { exact: true }).fill("1.1.0");
  await page.getByLabel("Accountable actor").fill("Agent Platform Owner");
  await page.getByLabel("Governance reason").fill("Validate the revised mapping score contract before activation.");
  await page.getByRole("button", { name: "Save draft for review" }).click();
  await expect(page.getByText("1.1.0 · draft", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Govern lifecycle Mapping scorer" }).click();
  await expect(page.getByText(/recorded runs and .* invocations/)).toBeVisible();
  await page.getByLabel("Lifecycle action").selectOption("disable");
  await page.getByLabel("Accountable actor").fill("Agent Platform Owner");
  await page.getByLabel("Governance reason").fill("Suspend execution while the revised contract awaits approval.");
  await page.getByRole("button", { name: "Apply governed lifecycle action" }).click();
  await expect(page.getByText("1.1.0 · disabled", { exact: true })).toBeVisible();
});

test("previews governed workspace imports before submitting them for review", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Versions & release" }).click();
  const candidate = structuredClone(bootstrapSkillWorkspace);
  candidate.framework = { ...candidate.framework, supportedLanguages: [...candidate.framework.supportedLanguages, "fr"] };
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({ name: "governed-candidate.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(candidate)) });
  await expect(page.getByRole("heading", { name: "governed-candidate.json" })).toBeVisible();
  await expect(page.getByText("No active working data changes at this step.")).toBeVisible();
  await expect(page.getByText("framework", { exact: true })).toBeVisible();
  await page.getByLabel("Accountable importer").fill("Data Steward");
  await page.getByLabel("Governance reason").fill("Import the reviewed multilingual framework candidate.");
  await page.getByRole("button", { name: "Submit import for review" }).click();
  await page.getByRole("tab", { name: "Review" }).click();
  await expect(page.getByText("Import governed workspace: governed-candidate.json", { exact: true })).toBeVisible();
});

test("exports working JSON with an accountable audit receipt", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Versions & release" }).click();
  await page.getByRole("button", { name: "Export working JSON" }).click();
  await page.getByLabel("Accountable actor").fill("Data Steward");
  await page.getByLabel("Evidence-based reason").fill("Create a traceable working-state backup for review.");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export governed JSON" }).click(),
  ]);
  expect(download.suggestedFilename()).toContain("skill-workspace-working-r");
  await page.getByRole("button", { name: "Audit log" }).click();
  await expect(page.getByText("workspace.exported", { exact: true })).toBeVisible();
});

test("supports steward diagnostics, audit search, overlap analysis and cross-role comparison", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  await page.getByRole("button", { name: "Data quality" }).click();
  await expect(page.getByRole("heading", { name: /findings$/ })).toBeVisible();
  await page.getByRole("button", { name: "Record diagnostic snapshot" }).click();
  await page.getByLabel("Accountable actor").fill("Taxonomy Steward");
  await page.getByLabel("Evidence-based reason").fill("Capture the governed pilot readiness baseline.");
  await page.locator("footer").getByRole("button", { name: "Record diagnostic snapshot" }).click();
  await page.getByRole("button", { name: "Audit log" }).click();
  await page.getByPlaceholder("Action, object, correlation ID…").fill("diagnostics_snapshot");
  await expect(page.getByText("governance.diagnostics_snapshot_recorded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Taxonomy graph" }).click();
  await expect(page.getByRole("heading", { name: "Canonical concepts and dependencies" })).toBeVisible();
  await expect(page.getByText(/downstream|mappings/).first()).toBeVisible();
  await page.getByRole("button", { name: "Coverage & impact" }).click();
  await expect(page.getByRole("heading", { name: "Compare governed profiles" })).toBeVisible();
  await expect(page.getByText("CROSS-ROLE COMPARISON", { exact: true })).toBeVisible();
});

test("runs a bounded live workflow health check from the pilot readiness control room", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  await expect(page.getByText("PILOT CONTROL ROOM", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run health check" }).click();
  await expect(page.getByRole("heading", { name: "operational" })).toBeVisible();
  await expect(page.getByText("11/11", { exact: true })).toBeVisible();
  await expect(page.getByText("RECOVERY ORDER", { exact: true })).toBeVisible();
});

test("keeps the pilot readiness workspace keyboard-labelled and responsive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Governance" }).click();
  const unnamedButtons = await page.locator(".governance-workbench button").evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute("aria-label") || button.textContent || "").trim()).length);
  expect(unnamedButtons).toBe(0);
  expect(await page.locator(".governance-workbench").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("submits KFLA structural lifecycle changes for human approval before mutation", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Taxonomy" }).click();
  await page.getByLabel("Select KFLA metadata record").selectOption("KFLA-08");
  await page.getByRole("button", { name: "Govern lifecycle" }).click();
  await expect(page.getByText("No structural mutation occurs now.")).toBeVisible();
  await page.getByLabel("KFLA lifecycle action").selectOption("move");
  await page.getByLabel("Destination KFLA cluster").selectOption("KFLA-CL-S3");
  await page.getByLabel("Accountable proposer").fill("KFLA Steward");
  await page.getByLabel("Evidence-based reason").fill("Correct the navigation assignment after reviewed competency evidence.");
  await page.getByRole("button", { name: "Submit KFLA change for review" }).click();
  await page.getByRole("tab", { name: "Review" }).click();
  await expect(page.getByText("move KFLA competency KFLA-08", { exact: true })).toBeVisible();
});

test("submits KFLA metadata edits as accountable non-mutating candidates", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Taxonomy" }).click();
  await page.getByRole("button", { name: "38 KFLA dimensions" }).click();
  await page.getByRole("button", { name: "Edit competency" }).click();
  const candidateSummary = "Reviewed public-safe interpretation for the accountable pilot evidence package.";
  await page.getByLabel("Public-safe summary").fill(candidateSummary);
  await page.getByLabel("Accountable proposer").fill("KFLA Steward");
  await page.getByLabel("Evidence-based reason").fill("Refresh the internal interpretation after reviewed public research evidence.");
  await page.getByRole("button", { name: "Submit metadata for review" }).click();
  await expect(page.getByText(candidateSummary, { exact: true })).not.toBeVisible();
  await page.getByRole("tab", { name: "Review" }).click();
  await expect(page.getByText(/Update KFLA competency metadata:/)).toBeVisible();
});

test("submits taxonomy group moves with dependency impact and accountable review", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Taxonomy" }).click();
  await page.getByRole("button", { name: "Hierarchy CRUD" }).click();
  await page.getByRole("button", { name: "Move Data & Analytics" }).click();
  await expect(page.getByText("Dependency impact before change")).toBeVisible();
  await page.getByLabel("Destination domain").selectOption("DOM-PC");
  await page.getByLabel("Accountable proposer").fill("Taxonomy Steward");
  await page.getByLabel("Governance reason").fill("Align the governed group to its accountable domain owner.");
  await page.getByRole("button", { name: "Submit taxonomy change for review" }).click();
  await page.getByRole("tab", { name: "Review" }).click();
  const structuralReview = page.locator("article").filter({ hasText: "move taxonomy group Data & Analytics" });
  await expect(structuralReview).toBeVisible();
  await expect(structuralReview.getByRole("button", { name: "Merge", exact: true })).toHaveCount(0);
});

test("submits taxonomy definitions as non-mutating review candidates", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Taxonomy" }).click();
  await page.getByRole("button", { name: "Hierarchy CRUD" }).click();
  await page.getByRole("button", { name: "Add group" }).click();
  await page.getByLabel("Canonical name").fill("Safety Analytics");
  await page.getByLabel("Definition and boundary").fill("Governed capabilities for safety-data interpretation and decision support.");
  await page.getByLabel("Accountable proposer").fill("Taxonomy Steward");
  await page.getByLabel("Governance reason").fill("Add an evidence-backed capability group for the pilot.");
  await page.getByRole("button", { name: "Submit definition for review" }).click();
  await expect(page.getByText("Safety Analytics", { exact: true })).not.toBeVisible();
  await page.getByRole("tab", { name: "Review" }).click();
  await expect(page.getByText("Create taxonomy group: Safety Analytics", { exact: true })).toBeVisible();
});

test("aligns mapping evidence and strategic vectors with the enriched job draft", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Jobs & mapping" }).click();
  await page.getByRole("button", { name: "Edit Data Visualization mapping" }).click();
  await page.getByLabel("Mapping rationale").fill("The role must translate performance evidence into operational decisions.");
  await page.getByLabel("Job-description evidence").fill("Builds governed dashboards for executive and operational decision-making.");
  await page.getByLabel("AI & Data").check();
  await page.getByLabel("Critical skill for this role").check();
  await page.getByLabel("Accountable actor").fill("Job Architecture Owner");
  await page.getByLabel("Governance reason").fill("Align the mapping with direct evidence and strategic uplift.");
  await page.getByRole("button", { name: "Save mapping" }).click();
  const mappingRow = page.locator(".mapping-row").filter({ hasText: "Data Visualization" });
  await expect(mappingRow.getByText("AI & Data", { exact: true })).toBeVisible();
  await expect(mappingRow).toContainText("critical");
  await expect(page.locator(".enriched-preview pre")).toContainText("AI & Data:");
  await page.getByLabel("Data Visualization mapped level").selectOption("4");
  await page.getByLabel("Accountable actor").fill("Job Architecture Owner");
  await page.getByLabel("Governance reason").fill("Raise the target level based on reviewed responsibility evidence.");
  await page.getByRole("button", { name: "Apply mapping change" }).click();
  await expect(page.getByLabel("Data Visualization mapped level")).toHaveValue("4");
});

test("requires accountable context before elicitation save or AI assistance", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Elicitation wizard" }).click();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "AI-assisted rewrite" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Syntax readiness" })).toBeVisible();
  await expect(page.getByText(/direct evidence coverage/)).toBeVisible();
  await page.getByLabel("Source location").fill("Role profile · paragraph 3");
  await page.getByLabel("Direct evidence quotation").fill("Build dashboards and analyse performance drivers.");
  await page.getByLabel("Accountable actor").fill("Capability Owner");
  await page.getByLabel("Governance reason").fill("Retain an evidence-backed checkpoint for the elicitation package.");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/saved at \d+% completion/)).toBeVisible();
  const requestPromise = page.waitForRequest((request) => request.url().includes("skill-designer-orchestrator") && request.postDataJSON()?.mode === "skill.elicitation");
  await page.getByRole("button", { name: "AI validation" }).click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({ mode: "skill.elicitation", action: "validate" });
  expect(request.postDataJSON().idempotencyKey).toMatch(/^skill\.elicitation:/);
  expect(request.postDataJSON().workspace.elicitationSessions[0].fieldEvidence).toBeTruthy();
  await expect(page.getByText("AI elicitation assistance saved as a draft.")).toBeVisible();
});

test("records accountable review edits and controlled re-evaluation requests", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: /Review queue/ }).click();
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Review summary").fill("Refined evidence summary retained as a pending proposal.");
  await page.getByLabel("Reviewer name").fill("Skill Governance Lead");
  await page.getByLabel("Edit reason").fill("Clarify the evidence boundary without changing the decision state.");
  await page.getByRole("button", { name: "Save review edit" }).click();
  await expect(page.getByText("Refined evidence summary retained as a pending proposal.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Re-evaluate" }).first().click();
  await page.getByLabel("Reviewer name").fill("Skill Governance Lead");
  await page.getByLabel("Re-evaluation reason").fill("Run the allowlisted validators against the clarified evidence.");
  await page.getByRole("button", { name: "Request controlled re-evaluation" }).click();
  await expect(page.getByRole("heading", { name: /decisions pending/ })).toBeVisible();
});

test("opens an opaque accessible KFLA deep dive and restores focus", async ({ page }) => {
  await page.getByRole("button", { name: "Skill designer", exact: true }).click();
  await page.getByRole("tab", { name: "Taxonomy" }).click();
  const trigger = page.getByRole("button", { name: /Open .* competency deep dive/ }).first();
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("generates, approves and publishes a governed SteerCo snapshot", async ({ page }) => {
  await page.getByRole("button", { name: "SteerCo summary" }).click();
  await expect(page.getByRole("heading", { name: "Prepare a Steering Committee view" })).toBeVisible();
  await page.getByLabel("Reporting period").selectOption("custom");
  await page.getByRole("textbox", { name: "From", exact: true }).fill("2026-08-01");
  await page.getByRole("textbox", { name: "To", exact: true }).fill("2026-08-31");
  await page.getByRole("button", { name: "Generate AI draft" }).click();
  await expect(page.getByText(/Delivery requires attention/)).toBeVisible();
  await expect(page.getByText("ai narrative", { exact: true })).toBeVisible();
  await page.getByLabel("Decision reason").fill("Reviewed cited project and governance evidence for the selected period.");
  await page.getByRole("button", { name: "Approve snapshot" }).click();
  await expect(page.getByText("SteerCo snapshot approved and locked for publication.")).toBeVisible();
  await page.getByRole("button", { name: "Publish read-only snapshot" }).click();
  await expect(page.getByRole("heading", { name: "Approved SteerCo view is ready" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy read-only link" })).toBeVisible();
  const answers = ["3", "Restore the last sponsor-approved baseline after a failed publication."];
  page.on("dialog", (dialog) => void dialog.accept(answers.shift()));
  await page.getByRole("button", { name: "Restore prior release" }).click();
  await expect(page.getByText("Revision 3 restored as a new read-only publication.")).toBeVisible();
});

test("opens a separate mutation-free read-only SteerCo link", async ({ page }) => {
  await page.goto("/?steerco=public-safe-share-123");
  await expect(page.getByText("Steering Committee summary", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overall project status" })).toBeVisible();
  await expect(page.getByText("View only", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quick add" })).toHaveCount(0);
  await expect(page.getByLabel("Shared pilot password")).toHaveCount(0);
});

test("rejects an AI SteerCo draft and keeps it unpublishable", async ({ page }) => {
  await page.getByRole("button", { name: "SteerCo summary" }).click();
  await page.getByRole("button", { name: "Generate AI draft" }).click();
  await page.getByLabel("Decision reason").fill("The narrative requires stronger decision evidence.");
  await page.getByRole("button", { name: "Reject draft" }).click();
  await expect(page.getByRole("heading", { name: "Generate a new governed revision" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish read-only snapshot" })).toHaveCount(0);
});
