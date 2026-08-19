import { expect, test } from "@playwright/test";
import { isActiveMappingRun, isTerminalMappingRun, mappingRunStage, mappingRunStorageKey, nextMappingPollDelay, normalizeMappingProgress } from "../src/lib/skill-run-runtime";
import type { AgentRun } from "../src/lib/skill-schema";

const run = (status: AgentRun["status"], progress?: number): AgentRun => ({
  id: "RUN-ZM10", mode: "job_mapping", status, jobDescriptionId: "JD-DATA",
  startedAt: "2026-08-19T10:00:00.000Z", model: "governed-agent", tools: [], trace: [], progress,
});

test("backs off mapping polling between two and ten seconds", () => {
  expect(nextMappingPollDelay(0)).toBe(2_000);
  expect(nextMappingPollDelay(2_000)).toBe(3_000);
  expect(nextMappingPollDelay(9_000)).toBe(10_000);
  expect(nextMappingPollDelay(10_000)).toBe(10_000);
});

test("classifies active and terminal mapping states deterministically", () => {
  for (const status of ["queued", "running", "validating", "interrupt_requested", "retrying"] as const) expect(isActiveMappingRun(run(status))).toBe(true);
  for (const status of ["interrupted", "needs_review", "completed", "failed", "stale"] as const) expect(isTerminalMappingRun(run(status))).toBe(true);
});

test("normalizes progress, stages and resumable storage keys", () => {
  expect(normalizeMappingProgress(run("running", 140))).toBe(100);
  expect(normalizeMappingProgress(run("queued"))).toBe(5);
  expect(mappingRunStage(run("interrupt_requested"))).toContain("controlled checkpoint");
  expect(mappingRunStorageKey("JD-DATA")).toBe("dekra.skill-mapping.active.JD-DATA");
});
