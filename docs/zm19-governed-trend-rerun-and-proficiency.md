# ZM-19 — Governed trend reruns and proficiency guidance

## Zielmodus instruction

Implement an asynchronous, governed rerun capability for the DEKRA Trend & Innovation Radar and Emerging Skills analysis. A user may start a scan, close the browser, resume status monitoring, interrupt the run at a controlled checkpoint, retry a failed or interrupted run and retrieve the latest completed snapshot. Persist run state and results in an n8n Data Table. The frontend must poll bounded status endpoints and must never hold a long-running browser request open.

The capability shall:

1. expose **Run trend scan**, **Re-run latest sources**, **Interrupt run** and **Retry run** according to run state;
2. show queued, screening, comparing, preparing-review, completed, interrupted and failed states with progress;
3. display the source cutoff, last successful completion, configuration version and snapshot version;
4. preserve earlier snapshots and link retries to the original run;
5. keep all generated signals, catalogue comparisons and emerging skills as proposals only;
6. separate agent analysis from human validation, approval and publication;
7. restore an active run after reload and continue polling while the page is visible;
8. retain evidence, error and interruption receipts for audit and recovery;
9. provide four skill-specific proficiency levels for every candidate in the white-spot view;
10. differentiate every proficiency level through **knowledge & collaboration**, **problem solving**, **accountability** and **impact**.

## Proficiency contract

| Level | Label | Differentiation intent |
| --- | --- | --- |
| 1 | Guided application | Uses foundational knowledge with support, follows defined approaches, owns assigned activity and contributes task-level value. |
| 2 | Independent application | Applies the skill without routine direction, resolves varied cases, owns end-to-end personal output and improves team outcomes. |
| 3 | Broad application | Integrates knowledge across complex contexts, resolves ambiguity, owns quality or methods and improves cross-team or value-stream outcomes. |
| 4 | Strategic contribution | Shapes the functional practice, resolves systemic challenges, is accountable for capability direction and creates enterprise or ecosystem impact. |

Descriptions must be adapted to the specific skill while preserving these four levers. A target level is a proposal derived from evidence, not an approval.

## Acceptance criteria

- The Trends & Emerging Skills header contains the state-appropriate run control.
- Starting a run returns promptly and stores the run identifier locally for restoration.
- Active status is polled with bounded backoff and pauses when the document is hidden.
- Interrupt and retry are explicit, auditable operations.
- A completed snapshot can replace the displayed signal and candidate analysis without mutating the approved skill catalogue.
- The white-spot table provides an accessible proficiency dropdown for every candidate and highlights the proposed target level.
- Lint, type-check and production build pass.

