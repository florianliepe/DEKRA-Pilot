# Control Tower architecture

The evidence-first job-mapping slice is specified in [ZM-01 — Agent-guided job mapping](./zm01-agent-guided-job-mapping.md). It adds hashed multi-format intake, normalized evidence segments, save/resume clarification, direct mapping evidence references, explained omissions, approved-snapshot comparison and draft profile composition. n8n remains the working-state and orchestration boundary; GitHub JSON remains the human-approved release boundary.

## GitHub Pages decision

GitHub Pages hosts only the static product shell. n8n is the protected API and
automation boundary, while a separate private GitHub repository is the source
of truth for PMO data.

```text
People -> GitHub Pages workbench -> n8n PMO API -> DEKRA-Pilot-Data (private)
                    |                  |
             in-memory password        +-> PMO orchestration
             browser extraction        +-> specialist analysis options
             CRUD review/edit          +-> validated GitHub revisions
```

## Boundaries

- `src/components/control-tower.tsx`: interactive product shell and PMO views.
- `src/components/intake-workbench.tsx`: multimodal evidence and text landing view.
- `src/components/entity-editor.tsx`: canonical create/update/delete controls.
- `src/lib/pmo-schema.ts`: canonical runtime contract.
- `src/lib/n8n-client.ts`: browser-safe workflow client and evidence extraction.
- `.github/workflows/deploy-pages.yml`: Node.js 22 validation and Pages release.
- `src/components/multilingual-label-workbench.tsx`: governed localized-label CRUD linked to canonical concept IDs.
- `src/components/skill-designer.tsx`: role-profile CRUD and lifecycle control, including dependency previews and immutable version recording.
- `src/components/controlled-tool-workbench.tsx`: governed business-tool catalogue lifecycle, dependency analysis and mapping-reference migration.
- `src/components/job-mapping-workbench.tsx`: governed job intake, evidence/normalization comparison, save/resume clarification, thirteen-part scoring, omissions, approved-snapshot comparison, profile diagnostics and accountable mapping review.
- `src/components/taxonomy-standard-workbench.tsx`: governed hierarchy and relationship CRUD, including duplicate, archive, restore and deprecate actions with accountable reasons.
- `src/components/governance-workbench.tsx`: source, evidence and validation-rule lifecycle with duplicate, archive, restore, deprecate, replace and merge operations; source merges migrate dependent evidence.
- n8n: authentication, schema enforcement, revision control and GitHub writes.
- `florianliepe/DEKRA-Pilot-Data`: private canonical PMO and work-package data.

No Next.js route handler runs in production. Secrets, GitHub credentials and PMO
documents must not be embedded in the static export.

## Extension model

The Method Studio previews four modules that share the shell, workflow API and
audit stream:

1. Skill Designer — agent-led interviews, design dimensions and evidence.
2. Taxonomy Framework — clusters, relationships, naming and governance.
3. Job-to-Skill Mapping — profiles, target proficiency and coverage constraints.
4. Data Ingestion — validated sources normalized through n8n.

The current orchestrator accepts a routing preference and enabled specialist
roles (`evidence`, `delivery`, `risk`, `meeting`). These are prompt-routed in the
MVP and can become parallel n8n Agent nodes while preserving the same intake
request and canonical response contract.

Each module should add a schema under `src/lib`, explicit n8n operation modes,
and a versioned directory in the private data repository.

Role profiles are working-state governed objects. Create, edit, duplicate,
archive, restore, deprecate, replace and merge operations remain in n8n until
release. Structural actions require an accountable actor and reason, show the
affected source job and mappings, preserve skill-link migration, and record
immutable source and target versions. Editing an approved profile moves it back
to `in_review`; approval itself remains available only through the review gate.

Controlled business tools are distinct from callable AI agent tools. Their
catalogue supports create, edit, duplicate, archive, restore, deprecate,
replace and merge. Replace and merge migrate job-mapping references, merge
aliases and linked skills, route affected mappings and the target tool back to
review, and preserve immutable source and target versions.

## Authentication seam

The MVP uses one shared password enforced by n8n Header Auth. The frontend keeps
it only in component memory. The next authentication iteration should replace
the header with Microsoft Entra ID access tokens without changing the static
hosting or canonical data model.
