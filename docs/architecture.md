# Control Tower architecture

## GitHub Pages decision

GitHub Pages hosts only the static product shell. n8n is the protected API and
automation boundary, while a separate private GitHub repository is the source
of truth for PMO data.

```text
People -> GitHub Pages -> n8n PMO API -> DEKRA-Pilot-Data (private)
               |              |
        in-memory password     +-> AI normalization
        browser extraction     +-> validated GitHub commits
```

## Boundaries

- `src/components/control-tower.tsx`: interactive product shell and PMO views.
- `src/lib/pmo-schema.ts`: canonical runtime contract.
- `src/lib/n8n-client.ts`: browser-safe workflow client and evidence extraction.
- `.github/workflows/deploy-pages.yml`: Node.js 22 validation and Pages release.
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

Each module should add a schema under `src/lib`, explicit n8n operation modes,
and a versioned directory in the private data repository.

## Authentication seam

The MVP uses one shared password enforced by n8n Header Auth. The frontend keeps
it only in component memory. The next authentication iteration should replace
the header with Microsoft Entra ID access tokens without changing the static
hosting or canonical data model.
