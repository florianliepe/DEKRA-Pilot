# Control Tower architecture

## Design decision

GitHub is the source of truth. The frontend and automation workflows do not maintain independent databases. They read and write the same versioned project document at `knowledge/pmo/control-tower.json`.

```text
People ──────────────> Responsive Control Tower ──> /api/pmo ──> GitHub
Documents / files ──> /api/intake ──> n8n agent ──> canonical artifacts
                                            └─────> activity evidence
```

## Boundaries

- `src/components/control-tower.tsx`: interactive product shell and all PMO views.
- `src/lib/pmo-schema.ts`: canonical runtime contract shared by UI and API.
- `src/lib/github-store.ts`: server-only GitHub storage adapter.
- `src/app/api/pmo/route.ts`: validated read/publish API for the canonical project document.
- `src/app/api/intake/route.ts`: multi-format extraction adapter for n8n normalisation.
- `src/app/api/n8n/route.ts`: tolerant workflow proxy.
- `src/app/api/github/commit/route.ts`: restricted compatibility route for canonical knowledge artifacts.

## Extension model

The Method Studio previews four modules that share the shell, GitHub storage and audit stream:

1. Skill Designer — agent-led interviews, design dimensions, evidence and granularity.
2. Taxonomy Framework — clusters, relationships, naming and lifecycle governance.
3. Job-to-Skill Mapping — profiles, target proficiency and coverage constraints.
4. Data Ingestion — validated structured sources normalised through n8n.

Each module should add a separate schema under `src/lib`, a dedicated route group, and a versioned directory below `knowledge/`. Project-control records remain independent from method artifacts while their status and activity can be surfaced in the same shell.

## Authentication seam

Authentication is postponed by product decision. Publishing currently requires `APP_SHARED_SECRET`; secrets and GitHub credentials remain server-side. A later credential vault can replace this request secret with email/password sessions without changing the data adapter or canonical schema.
