# ZM-03 — Taxonomy elicitation, consistent syntax and KFLA guidance

## Target outcome

Taxonomy stewards can pause and resume a guided evidence elicitation, derive an
atomic Action + Object + Outcome candidate, compare it with approved concepts and
submit an evidence-backed proposal for accountable review. AI can validate or
rewrite only the draft fields. It cannot approve, publish, alter evidence lineage
or access licensed KFLA definitions.

## Delivery scope

1. Save/resume the eleven-step elicitation workflow with progress and status.
2. Capture exact source location and quotation per elicitation dimension.
3. Derive deterministic syntax, granularity, observability, uniqueness and evidence
   findings before review.
4. Show existing-concept similarity as an advisory signal rather than an automatic
   merge decision.
5. Provide public-safe summary guidance by hover and deep dive for all 38 KFLA
   competencies, linked to the canonical four-factor and twelve-cluster hierarchy.
6. Route AI validation and rewriting through the allowlisted n8n tool registry with
   idempotency, rate limiting, audit context and a human-review boundary.
7. Preserve field evidence, actor, reason, framework version, rules version and an
   immutable object-version snapshot for each governed decision.

## Acceptance criteria

- A steward can save, resume and submit a partially completed elicitation.
- Review submission requires accountable actor and reason and at least 70% progress.
- Direct quotations and locations survive AI validation and rewrite requests.
- Blocking syntax or outcome findings are visible before review.
- AI output remains a proposal and can update only allowlisted draft fields.
- All 38 KFLA entries expose public-safe navigation and guidance without licensed
  definitions in the public application or release JSON.
- Repeated AI requests cannot duplicate a state transition.
- Schema validation, governance tests, end-to-end tests, lint, type-check, build and
  public-bundle security scans pass.

## Explicit non-goals

- AI does not approve canonical taxonomy records.
- Similarity signals do not merge concepts automatically.
- Licensed Korn Ferry definitions are not stored or rendered by the public client.
