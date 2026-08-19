# ZM-11 and ZM-12 — agent interaction maturity

## ZM-11: evidence-grounded adaptive clarification

Target outcome: the Skill Designer asks the highest-value unanswered question, explains why it matters, cites the source statements considered and stops automatically when evidence sufficiency reaches 80/100. A user may request another question without losing mapping readiness.

Governance rules:

- critical contradictions block mapping and cannot be deferred;
- non-critical contradictions remain visible and reduce the score;
- every answer becomes governed evidence with session and revision lineage;
- stale session versions and mapping bypass attempts are rejected;
- the workflow never approves or publishes.

UAT result (2026-08-19): passed locally and against the published n8n workflow. A synthetic authority contradiction was blocked, explicit resolution was accepted, sufficiency reached 88/80 and the additional-question path remained available. Test data was removed afterward.

## ZM-12: explainable mapping recommendations

Target outcome: every proposed job-to-skill mapping gives an accountable reviewer a compact decision package rather than an opaque score.

Required explanation contract:

- concise recommendation summary, without hidden chain-of-thought;
- evidence classified as direct, inferred or unsupported, with governed excerpts;
- all thirteen score dimensions with contribution and evidence references;
- responsibility, outcome, controlled-tool and KFLA relationship coverage;
- rejected alternatives and missing-skill signals;
- unsupported claims are blocking and must be clarified or routed as a taxonomy gap;
- every result stops at `needs_review`; approval and publication remain separate human actions.

UAT result (2026-08-19): passed locally and through the asynchronous n8n data-table runtime. One synthetic role produced one explainable proposal with direct evidence and thirteen score narratives, ended at `needs_review`, and created no approval or publication. Test data was removed afterward.

## Repeatable verification

```powershell
npm run typecheck
npm run lint
npm run build
npx playwright test tests/skill-framework.spec.ts
npx playwright test tests/control-tower.spec.ts
npm run uat:zm11:live
npm run uat:zm12:live
```

The two live commands require the local shared webhook secret and operate only on temporary synthetic records with cleanup in a `finally` block.
