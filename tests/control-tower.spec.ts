import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Executive overview" })).toBeVisible();
});

test("navigates through every core PMO view", async ({ page }) => {
  const views = [
    ["Plan & deliverables", "Deliverable register"],
    ["Risks & issues", "Exposure matrix"],
    ["Meeting hub", "Steering committee kickoff"],
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

test("supports mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Meeting hub" }).click();
  await expect(page.getByRole("heading", { name: "Meeting hub" })).toBeVisible();
});
