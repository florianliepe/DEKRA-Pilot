# DEKRA Skill Design Framework v3

## Architecture and trust boundaries

The browser is an interaction surface, not a data authority. Mutable working state and AI runs are stored by the authenticated n8n orchestrator. GitHub `main` contains immutable, human-approved and public-safe JSON releases. The browser never receives GitHub credentials and cannot publish directly.

```text
job evidence / elicitation
        |
        v
authenticated n8n orchestrator ----> versioned working state
        |                                  |
        | draft proposals                  | accountable decisions
        v                                  v
human review queue -----------------> deterministic release gate
                                           |
                                           v
authenticated n8n publisher --> atomic Git commit --> approved JSON + manifest + index
```

Untrusted job text is evidence only and never interpreted as agent instructions. Callable agent tools use an explicit deny-by-default registry. Licensed KFLA content is a separate protected-backend concern and is excluded from all public artifacts.

## Data model and governed lifecycles

`SkillWorkspace` schema version 3 contains taxonomy domains/groups, relationships, skills, profiles, jobs, mappings, controlled business tools, the callable agent-tool registry, 4/12/38 KFLA metadata, validation rules, review items, elicitation sessions, agent traces, immutable object versions, audit events, framework configuration and release history.

Material changes are soft lifecycle transitions (`draft`, `in_review`, `approved`, `deprecated`, `archived`, `retired`). Merge, move, archive, deprecate and replace actions require dependency analysis and create immutable before/after evidence. Approved snapshots contain approved objects only; working interviews, elicitation sessions, agent traces and object snapshots remain out of the public release.

Authoritative machine-readable contracts:

- `data/schemas/skill-workspace.schema.json`
- `data/schemas/release-manifest.schema.json`
- `data/validation-rules.json`
- `data/framework-config.json`
- `data/agent-tool-registry.json`

## KFLA public and licensed-content policy

The public layer provides four factors, twelve organisation-authored navigation clusters and all 38 competency names with internally authored summaries, boundaries, inclusion/exclusion criteria, examples, counterexamples, evidence guidance, relationships and provenance links. These explanations are not represented as official Korn Ferry definitions.

Licensed definitions, anchors and development content require a licensed-content administrator and a protected backend with role checks. Only a protected reference may enter working state. The public release sanitizer always removes licensed content and references. Essential public-safe information is available in the deep-dive dialog and is not hover-only.

## Agent-tool contract

The eleven allowlisted tools are job parser, evidence extractor, taxonomy search, skill-similarity search, syntax validator, granularity validator, KFLA lookup, controlled-tool lookup, mapping scorer, draft-suggestion writer and review-package generator. Each has input/output JSON schemas, permission, allowed data classifications, timeout/retry/rate limits, error contract, audit fields, version, owner, lifecycle and allowed actions.

The agent has no unrestricted network, filesystem, credential, workflow-administration or publication permission. Every invocation records correlation ID, acting user, input/output references, duration, outcome, errors/retries, tool version, rules and framework version.

## Validation and mapping

Deterministic release findings contain rule ID, severity, object, field, explanation, correction, blocking state, framework/rule version and evidence reference. The mapping score uses thirteen configurable dimensions. Positive dimensions are weighted; duplicate, contradiction and missing-evidence dimensions subtract from the result. Manual overrides require a reason and retain both the calculated and overridden values.

`data/evaluation/mapping-golden-baseline.json` and its JSON schema provide an executable, version-bound regression gate for direct matches, ambiguous evidence, missing evidence and contradictions. `npm run verify:mapping-evaluation` verifies score composition, expected ranking, thresholds and margins. The baseline is deliberately synthetic and public-safe; empirical mapping quality still requires a representative, accountable human-labelled dataset.

Agent-tool execution is deny-by-default at runtime through `authorizeAgentToolCall`. A call is permitted only when the registry entry exists and is active, the acting identity holds the exact permission, the requested action is allowlisted, the data classification is allowed and non-licensed, and correlation/input references are present. Every decision produces an invocation-shaped audit record, including denied calls.

## Review and approved-release transaction

1. Save or resume working state through the orchestrator.
2. Run deterministic validation and mapping regression.
3. Human reviewers approve, reject, edit, merge, defer or request re-evaluation. Reviewer identity and reason are mandatory.
4. `prepareRelease` rejects pending reviews, blocking findings, stale revisions and missing approvers.
5. The publisher compares expected revision and GitHub blob SHA.
6. It creates the sanitized snapshot, immutable manifest and release index in one Git tree.
7. It creates one commit and fast-forwards `main` without force.
8. The response returns the commit SHA, manifest and idempotency receipt.

The first populated release is revision 1. The repository currently carries revision 0 as an explicit empty bootstrap, so it cannot be mistaken for a business-approved release.

## Concurrency, drift, failure recovery and rollback

- Revision mismatch or blob-SHA mismatch returns a conflict; reload and review drift before retrying.
- Reusing the same idempotency key returns the existing receipt rather than publishing twice.
- A failed publication remains `failed`/`publishing`; correct the external error and retry the same prepared payload.
- Drift compares release revisions and object counts. Resolve it by reloading the GitHub-approved snapshot, reviewing working changes and preparing a new release.
- Rollback is requested from release history, enters the human review queue and publishes a new revision that points to the prior snapshot. No Git history is force-rewritten.

## n8n API contracts

Both endpoints require the configured header-auth shared secret.

Orchestrator v3 modes:

- `skill.read`
- `skill.save`
- `skill.ingest`
- `skill.interview`
- `skill.elicitation`
- `skill.map_job`
- `skill.regression`

Publisher v3 accepts `skill.publish` with schema-v3 workspace, accountable approver, prepared manifest, expected previous revision and expected GitHub blob SHA. It returns `ok`, released workspace, manifest, commit SHA, message and recovery receipt. Credentials remain in n8n credentials and GitHub environment secrets; never add them to browser variables or JSON.

Workflow artifacts:

- `docs/n8n-skill-designer-v3.workflow.json`
- `docs/n8n-skill-publisher-v3.workflow.json`

Active isolated production workflows:

- Orchestrator v3: `1jgGJdy3wXW6kH87` → `/webhook/skill-designer-orchestrator-v3`
- Atomic publisher v3: `d8RFwzlJJHxBv2HI` → `/webhook/skill-designer-publisher-v3`

Both workflows were imported from commit `4de21ab`, retained the existing header-auth and GitHub credential bindings, and were published before the frontend defaults moved to the `-v3` paths. An unauthenticated or incorrect-secret request returns HTTP 403 by design; complete the authenticated read/save validation with the current shared pilot password.

## Workbench user validation

1. Unlock the pilot with the shared password.
2. Open **Method studio → Skill designer**.
3. Complete and resume an elicitation draft; run AI rewrite/validation and submit it for review.
4. Create/edit/archive a skill and confirm a version/audit event appears.
5. Open **Taxonomy standards** and verify 4 factors, 12 clusters and 38 deep dives.
6. Exercise hierarchy, relationship and controlled-tool CRUD; review impact before structural changes.
7. Open **Jobs & mapping**, inspect all thirteen score dimensions and confirm an override requires a reason.
8. Open **Governance** to inspect data quality, tool contracts, versions, audit, configuration, graph and coverage insights.
9. Record decisions for every pending review item with reviewer and reason.
10. Use **Release approved JSON** and confirm revision, commit receipt and manifest.
11. Retry the same release to verify idempotency; simulate a stale revision to verify conflict handling.
12. Request rollback from a published release and confirm it creates a new review item instead of rewriting history.

## Verification evidence and remaining risks

Required pre-release checks are lint, TypeScript, production build, Playwright regression tests, JSON parsing/schema checks, public-bundle credential scan and public-bundle licensed-content scan. Live n8n and GitHub Pages verification must be repeated after each endpoint or workflow change.

Known external gates:

- An accountable human must decide every pending suggestion before revision 1.
- Licensed KFLA material and authorization are not supplied; licensed administration therefore remains a protected-reference boundary rather than content ingestion.
- Production mapping-quality calibration requires a representative human-labelled evaluation extension; the repository baseline proves deterministic regression behavior but does not establish empirical validity.
