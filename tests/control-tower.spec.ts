import { expect, test } from "@playwright/test";
import { bootstrapPmoData as pmoDocument } from "../src/lib/pmo-fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/webhook/**", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { mode?: string; document?: typeof pmoDocument; meta?: { wpId?: string } };
    if (body.mode === "pmo.save" && body.document) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, source: "github", storageConfigured: true, document: { ...body.document, revision: body.document.revision + 1 } }),
      });
      return;
    }
    if (body.mode === "pmo.ingest") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, wpId: body.meta?.wpId, committedFiles: [] }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, source: "github", storageConfigured: true, document: pmoDocument }) });
  });
  await page.goto("/");
  await page.getByLabel("Shared pilot password").fill("pilot-test-password");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Executive overview" })).toBeVisible();
});

test("navigates through every core PMO view", async ({ page }) => {
  const views = [
    ["Plan & deliverables", "Deliverable register"],
    ["Risks & issues", "Exposure matrix"],
    ["Meeting hub", "Turn discussions into decisions, actions and evidence."],
    ["Activity log", "Connected systems"],
    ["Method studio", "From project control to skill architecture."],
  ];

  for (const [navigation, heading] of views) {
    await page.getByRole("button", { name: navigation }).click();
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
  }
});

test("captures a new risk and marks the workspace dirty", async ({ page }) => {
  await page.getByRole("button", { name: "Add update" }).click();
  await page.getByLabel("Title").fill("Decision latency threatens Gate 1");
  await page.getByLabel("Owner").fill("Programme Director");
  await page.getByLabel("Mitigation").fill("Pre-wire decisions before the gate review.");
  await page.getByLabel("Description").fill("Open decisions are not closing within the agreed cadence.");
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await page.getByRole("button", { name: "Risks & issues" }).click();
  await expect(page.getByText("Decision latency threatens Gate 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish changes" })).toBeEnabled();
});

test("opens the secured n8n evidence intake", async ({ page }) => {
  await page.getByRole("button", { name: "Import evidence" }).click();
  await expect(page.getByRole("heading", { name: "Normalize work-package evidence" })).toBeVisible();
  await expect(page.getByLabel("Work-package ID")).toBeVisible();
  await expect(page.getByLabel("Evidence files")).toHaveAttribute("multiple", "");
  await expect(page.getByLabel("Workspace secret")).toHaveCount(0);
});

test("supports mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Meeting hub" }).click();
  await expect(page.getByRole("heading", { name: "Meeting hub" })).toBeVisible();
});
