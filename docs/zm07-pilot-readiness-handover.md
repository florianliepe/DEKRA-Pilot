# ZM-07 — Pilot readiness and operational handover

## Target outcome

Taxonomy stewards and job architects can operate the complete Skill Design Framework as a controlled pilot. Platform owners can distinguish content readiness from service availability, diagnose failures through stable identifiers, recover idempotently, and prove which approved GitHub release is live.

## Delivered production controls

- A **Pilot readiness** control room evaluates eight evidence-backed gates: schema/KFLA integrity, release validation, human decisions, agent-tool policy, approved mapping baseline, agent execution stability, release receipts and localization coverage.
- The n8n orchestrator exposes a bounded, authenticated, read-only `skill.health` operation. It reports workflow/store reachability, working revision, framework version, required-tool coverage, retry-receipt count, failed runs and audit volume. It returns no source evidence, credentials or licensed content.
- Release readiness and endpoint health are intentionally separate. A reachable workflow cannot approve or publish content.
- A recovery order is embedded in the UI: reload conflicting state, retry with the same idempotency key only for the same transaction, trace the correlation ID, and use governed forward rollback.
- GitHub Pages deployment now scans the generated public bundle for credentials and licensed-content markers before artifact upload.
- Responsive and accessible pilot checks confirm labelled controls, keyboard focus and a non-overflowing governance workspace at mobile width.

## Operating roles

| Role | Accountabilities |
| --- | --- |
| Taxonomy steward | Resolve validation findings, taxonomy overlaps, replacement chains, KFLA/public-metadata governance, multilingual labels and canonical review decisions. |
| Job architect | Validate normalized job evidence, answer clarifications, challenge mappings, tune role profiles and record mapping feedback. |
| Platform owner | Maintain n8n credentials and allowlists, investigate health/audit signals, rotate secrets, run releases and verify Pages deployments. |

## Pilot journey

1. Ingest one representative job description and verify direct evidence lineage.
2. Complete clarification questions and generate a draft mapping package.
3. Review all mappings, omissions and the draft profile; record decisions and reasons.
4. Resolve taxonomy proposals, validation findings and overlap signals.
5. Record a governance diagnostic snapshot.
6. Run the live n8n health check.
7. Confirm that no blocking findings or pending human decisions remain.
8. Release approved JSON, retain the commit/manifest receipt, and verify the public Pages bundle.

## Incident and recovery runbook

### Revision conflict — HTTP 409

Reload with `skill.read`, compare immutable versions, reapply the intended change to the latest revision and save with a new transaction key. Never lower `expectedRevision` or overwrite the remote state.

### Validation failure — HTTP 400/422

Use the structured rule ID, entity, field, correction and blocking status. Correct the draft and retry. A rejected mapping batch creates an audit/run record but no partial mapping proposal.

### Timeout or transient n8n failure

For the same unchanged payload, retry using the original idempotency key. If the receipt already exists, the workflow returns the prior response with replay evidence. For changed input, generate a new key.

### Agent-tool denial

Inspect the correlation ID and `agent_tool.denied` event. Correct lifecycle, permission, classification, action or contract configuration through governed review. Do not broaden the tool or expose credentials to bypass the denial.

### Failed publication

Keep the prepared manifest and idempotency key. Resolve GitHub SHA drift or validation findings, then use the explicit retry action only if the working revision and timestamp are unchanged. Otherwise prepare a new release.

### Incorrect approved release

Request rollback from the release-history view. Human approval creates a new forward revision; published history is never rewritten.

## Security acceptance

- Shared-password access is acceptable only for the bounded pilot population.
- The shared password remains browser-memory-only and is sent solely in the protected webhook header.
- n8n/GitHub credentials stay in their respective protected credential stores and never use `NEXT_PUBLIC_*` variables.
- Agent tools are deny-by-default, versioned and limited to public/internal/confidential classifications; licensed access is always denied.
- Public JSON and bundles contain public metadata and internally authored explanations only, never licensed KFLA definitions.
- Microsoft Entra ID and per-user authorization are required before broader production adoption.

## Verification commands

```text
npm run sync:n8n-zm07
npm run lint
npm run typecheck
npm run verify:governance-artifacts
npm run verify:agent-policy
npm run verify:mapping-evaluation
npm run build
npm run verify:public-bundle
npm run test:e2e
```

## Known limitations and next decisions

- Shared credentials identify the actor only through the accountable name entered in each governed action; they do not provide cryptographic user identity.
- Current golden mapping cases are public-safe synthetic baselines, not empirical proof across all DEKRA job families, languages or countries.
- Localization coverage reports governed labels but does not perform professional translation quality assurance.
- Operational health is on-demand and retained through n8n execution history; external alerting/SLA monitoring is not configured.
- Licensed KFLA definitions remain deferred until licence scope, content owner and role-based backend access are approved.

Decisions for the next programme increment: Entra ID timing, pilot job-family sample, named backup stewards, service-level targets, alert destination, licensed-content operating model and production data-retention period.
