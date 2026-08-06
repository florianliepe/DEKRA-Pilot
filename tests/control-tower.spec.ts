import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { bootstrapPmoData as pmoDocument } from "../src/lib/pmo-fixtures";
import type { PmoDocument } from "../src/lib/pmo-schema";

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

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/webhook/**", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { mode?: string; document?: PmoDocument; meta?: { wpId?: string }; extracted?: Array<{ type?: string; content?: string }> };
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
    ["Method studio", "From project control to skill architecture."],
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
