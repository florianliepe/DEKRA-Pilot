# ZM-10 — Deterministic clarification and asynchronous job mapping

## Outcome

ZM-10 removes the two blocking interaction patterns from the Skill Designer:

- clarification answers now advance by an explicit, versioned command contract;
- long-running job mapping continues in n8n after the browser closes and is observed through status polling.

Mapping output remains a governed suggestion in `needs_review`. The runtime does not approve or publish a release.

## Runtime architecture

1. The frontend creates a run ID and sends `skill.map_job.start` to the asynchronous start webhook.
2. n8n acknowledges immediately and persists the run in `DEKRA Skill Mapping Runs`.
3. The worker moves the run through `queued`, `running` and `validating`.
4. The worker invokes the governed Skill Designer as an internal n8n sub-workflow. This avoids reverse-proxy timeouts without weakening webhook authentication.
5. The governed workspace is saved once and the run becomes `needs_review`.
6. The frontend polls the control webhook with bounded backoff, pauses while the document is hidden, and resumes a persisted run after reload.
7. `Interrupt run` stores `interrupt_requested`; the worker stops at the next controlled checkpoint and records `interrupted` without saving a result.

The shared header credential is restricted to `eraneos-agentic-platform.azurewebsites.net` for HTTP Request use. Its value is never stored in workflow JSON or frontend source.

## Contracts

### Clarification

Supported actions are `start`, `answer`, `skip`, `back` and `edit`.

Every mutation supplies `sessionId` and `expectedSessionVersion`. A stale browser receives HTTP 409 and must reload before continuing. Answer edits update the existing governed evidence record instead of creating duplicate evidence.

### Mapping

- Start: `skill.map_job.start`
- Status: `skill.map_job.status`
- Result: `skill.map_job.result`
- Interrupt: `skill.map_job.interrupt`

Terminal states are `interrupted`, `needs_review`, `completed`, `failed` and `stale`. Failed and interrupted runs expose a governed retry action with a new run ID and a `retryOfRunId` link.

## Recovery and operations

- A run remains discoverable from the n8n Data Table even if the tab is closed.
- A connection failure does not discard the run ID; polling backs off and resumes.
- A failed mapping or governed save is terminal and retryable rather than remaining indefinitely active.
- Interrupt is cooperative: an in-flight model call is not forcibly terminated, but no governed result is saved after the interrupt checkpoint is observed.
- The orchestrator returns the same governed terminal payload to authenticated webhook callers and internal sub-workflow callers.

Regenerate the governed artifacts with:

```bash
npm run sync:n8n-zm10
```

Set `ZM10_ORCHESTRATOR_WORKFLOW_ID` while generating a runtime for a newly created n8n orchestrator.

## Acceptance evidence

- Immediate start acknowledgement: under one second in the production smoke test.
- Cooperative interrupt: run reached `interrupted`, 100%, and produced no result.
- Successful mapping: run reached `needs_review`, 100%, and returned the governed workspace through the result endpoint.
- No approval or publication action was executed by the acceptance run.
- Type checking, linting, focused Playwright coverage and the production static export are required before release.
