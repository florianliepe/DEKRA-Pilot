# ZM-05 — Mapping quality, calibration and evaluation

## Target outcome

Taxonomy stewards and job architects can explain, reproduce and challenge every job-to-skill score. The workbench exposes the ten positive dimensions, three penalties, governed weights, direct evidence, validation findings and complete version lineage. Low-confidence candidates abstain instead of becoming mappings. Human feedback calibrates future work without approving or publishing it.

## Delivered control model

- The thirteen-dimensional score uses the weights in `data/framework-config.json` in both the frontend and n8n.
- Every factor shows its raw value, governed weight and signed score contribution.
- Agent proposals fail closed when the skill is not approved, evidence references do not resolve, any score field is missing/out of range, or the weighted score is below the abstention threshold.
- Failed proposal batches persist a structured audit event and agent-run error, but no mapping proposal.
- Every agent mapping retains framework, rules, prompt, score-model and golden-dataset versions.
- Manual score differences require an evidence-based override reason.
- Feedback requires a named taxonomy steward or job architect, decision and reason. `needs_evidence` is tracked separately from outcome calibration.
- The live workbench reports mapping accuracy, abstention accuracy, version drift and per-case failures for ten public-safe synthetic golden cases.

## Persistence and recovery

The existing governed n8n idempotency receipt protects state-changing retries. Mapping validation executes before proposal persistence. A 422 `MAPPING_VALIDATION_FAILED` response contains structured findings and can be corrected and retried with a new request; no partial proposal package is stored.

## Security and licensing

Evaluation cases are organization-authored synthetic text. They contain no credentials, private job material or licensed KFLA definitions. The public bundle scanner remains a deployment gate.

## Operating checks

Run:

```text
npm run verify:mapping-evaluation
npm run verify:governance-artifacts
npm run verify:agent-policy
npm run typecheck
npm run lint
npm run build
npm run verify:public-bundle
npm run test:e2e
```

The mapping evaluator must report ten passing cases, 100% mapping accuracy, 100% abstention accuracy and no version drift.

## Limitations

The baseline is a deterministic, public-safe regression suite, not a claim of empirical validity. Production calibration requires sufficiently large, representative human-reviewed samples across job families, countries and languages.

## Next Zielmodus — ZM-06

Deliver complete workbench experiences for governed operations: a dedicated audit explorer, version comparison, comprehensive data-quality diagnostics, framework configuration, taxonomy overlap analysis, job coverage/gap analysis, cross-role comparison, change-impact and replacement-chain views, and multilingual labels. Every mutation remains attributable, versioned and draft-first.
