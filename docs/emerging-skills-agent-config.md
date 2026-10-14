# Emerging Skills Agent configuration

The machine-readable source of truth is [`data/emerging-skills-agent-config.json`](../data/emerging-skills-agent-config.json).

## Runtime pattern

Use one scheduled n8n trigger per quarter and an authenticated event trigger for material regulatory, standard, strategy or repeated-role-gap events. Each run writes an immutable signal record and a candidate-review package to the working data store. Frontend polling reads run status and results; no browser request should wait for the complete scan.

Recommended controlled operations:

| Operation | Purpose | Mutation |
| --- | --- | --- |
| `read_source_registry` | Load the allowlist and last-reviewed dates | None |
| `screen_trend_sources` | Fetch and extract source claims | Signal drafts only |
| `qualify_dekra_relevance` | Link evidence to strategy and value chain | Analysis only |
| `compare_skill_catalogue` | Detect exact, partial and missing coverage | Analysis only |
| `compare_job_profiles` | Identify evidence-linked affected profiles | Analysis only |
| `score_emerging_skill` | Calculate the transparent priority index | Analysis only |
| `draft_skill_candidate` | Prepare a proposed global skill definition | Proposal only |
| `prepare_review_package` | Route a traceable package to human governance | Review queue only |

Every operation needs an input/output schema, permission, data-classification allowlist, timeout, retry policy, rate limit, error contract, audit record and version. Approval and publication operations must remain separate human-authorized workflows.

## Priority index

`priority = 28% strategic fit + 22% urgency + 20% value impact + 15% role breadth + 15% gap magnitude`

All components are normalized to 0–100. Gap magnitude is 100 for a white spot, 55 for a partial match and 10 for covered catalogue capability. Reviewers may challenge inputs but must not silently overwrite the calculated score.

## Data lifecycle

- Re-evaluate active signals quarterly and when configured events occur.
- Preserve prior scores and evidence as versioned history.
- Mark stale sources; never silently remove history.
- Retain rejected proposals with rationale to prevent repeated rediscovery.
- Add SAP SuccessFactors only after its fields, ownership, retention and access controls are approved.

