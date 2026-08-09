# ZM-06 — Governed steward workbench

## Target outcome

Taxonomy stewards and job architects can diagnose, compare and govern the framework from one coherent control plane. The experience connects data quality, immutable history, taxonomy structure, role coverage, localization and release readiness without creating a second source of truth.

## Delivered experiences

- **Quality triage:** filter structured findings by severity and entity type, inspect release gates, and record an attributable diagnostic snapshot.
- **Audit explorer:** search by action, object, actor, framework version or correlation ID; filter by actor and action; export the visible trace as JSON.
- **Version comparison:** deterministic field-level comparison with changed-field counts and an explicit warning for cross-object comparisons.
- **Taxonomy graph analysis:** focus a governed skill, inspect mappings, profiles, tools and relationships, tune overlap thresholds, and distinguish governed relations from steward-triage candidates.
- **Replacement integrity:** follow explicit replacement relations and governance successor IDs, and identify unresolved or cyclic chains.
- **Job coverage:** compare active mappings with approved taxonomy skills and expose jobs without active skill coverage.
- **Cross-role comparison:** compare shared and unique skills plus approved-skill coverage for two governed role profiles.
- **Multilingual governance:** show coverage across configured non-English languages while retaining one canonical English concept identity. Existing localized-label CRUD remains draft-first and versioned.
- **Framework configuration:** use the existing governed configuration and validation-rule CRUD for supported languages, thirteen mapping weights and rule lifecycle.

## Persistence and audit

Analytical views are deterministic and read-only. “Record diagnostic snapshot” persists the current quality, overlap, localization, review and replacement-chain indicators as an immutable `governance_diagnostics` object version and audit event through the existing authenticated n8n save transaction. It does not alter canonical taxonomy content or publish a release.

## Operating model

1. A steward triages blocking validation findings and unexplained overlap signals.
2. A job architect reviews role and job-coverage gaps.
3. Structural corrections use the governed taxonomy, relationship, profile and localized-label CRUD flows.
4. The steward records a diagnostic snapshot when the workbench state is decision-ready.
5. Human review and the approved JSON release gate remain mandatory before publication.

## Security and licensing

Diagnostics contain identifiers, counts, framework versions and public-safe explanations only. They do not copy licensed KFLA definitions or secrets. Audit export is scoped to the currently filtered trace and retains correlation identifiers for investigation.

## Verification

Run:

```text
npm run typecheck
npm run lint
npm run build
npm run verify:governance-artifacts
npm run verify:public-bundle
npm run test:e2e
```

## Next Zielmodus — ZM-07

Complete production hardening and pilot readiness: end-to-end steward and job-architect journeys, accessibility and responsive checks, operational telemetry, recovery runbooks, deployment verification, security review, and a concise handover with known limitations.
