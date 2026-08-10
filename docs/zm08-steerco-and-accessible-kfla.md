# ZM-08 — accessible KFLA views and governed SteerCo reporting

## Delivered experience

### KFLA competency interaction

- Cards expose a short, high-contrast hover and keyboard-focus preview.
- Click, Enter or Space opens the complete deep dive.
- The deep dive is an opaque `role="dialog"` with `aria-modal`, an accessible title, a sticky header and a scroll-contained body.
- Keyboard focus is trapped while open, Escape closes it, and focus returns to the originating card.
- Outside click closes only when no text is being selected, so users can copy evidence without losing context.
- The layout scales down to a full-height mobile dialog and honours reduced-motion preferences.
- Public-safe metadata remains distinct from the licensed-content guard. Licensed definitions are never bundled.

### Steering Committee reporting

The authenticated application contains a **SteerCo summary** workbench. An accountable PMO user can:

1. Select current month, previous month, since the last SteerCo, current phase, latest approved snapshot, or a custom date range.
2. Assemble a deterministic evidence package and RAG calculation from PMO and Skill Designer revisions.
3. Ask the governed n8n AI agent to create an evidence-linked executive narrative.
4. Edit claims, request a section-specific AI revision, record an accountable RAG override, approve, reject, publish, revoke or restore a prior immutable release.
5. Copy a separate read-only link and print or save the approved view as PDF.

The read-only route is selected with `?steerco=<opaque-share-id>`. The identifier is not accepted as mutation authority. It can retrieve only a backend-filtered, approved `steerco_read_only` snapshot through the unauthenticated read endpoint. All mutation endpoints remain protected by the existing n8n header-auth credential.

## Evidence and RAG rules

The deterministic layer is authoritative for status. AI explains evidence but cannot alter the calculated status.

- **Red:** critical unresolved risk or blocked deliverable.
- **Amber:** overdue deliverable, pending governance decisions, failed agent runs, or source data older than seven days.
- **Green:** no critical or attention signals.
- **Unknown:** the source has no milestone, deliverable, risk or meeting evidence sufficient for a defensible conclusion.

Every signal and claim carries source record IDs. Human overrides retain calculated and effective status, actor, reason and timestamp.

## AI boundary

The workflow supplies the agent only with:

- selected reporting period;
- deterministic RAG signals;
- source revision and freshness;
- public-safe section claims and their identifiers.

The agent must return strict JSON. Each material claim needs at least one resolvable source ID. Invalid JSON, unknown references, ungrounded claims and licensed-content markers fail closed. The AI creates or revises a draft only; approval and publication are separate human-controlled operations.

## Contracts

Runtime validation is implemented in `src/lib/steerco-schema.ts`. Portable JSON contracts are in `data/schemas/`:

- `steerco-report.schema.json`
- `steerco-period.schema.json`
- `steerco-claim.schema.json`
- `steerco-rag.schema.json`
- `steerco-ai-output.schema.json`
- `steerco-approval.schema.json`
- `steerco-share.schema.json`
- `steerco-publication-manifest.schema.json`

The importable workflow is `docs/n8n-steerco-v1.workflow.json`.

## n8n deployment

1. Import `docs/n8n-steerco-v1.workflow.json` into the Eraneos n8n instance.
2. Assign **DEKRA PMO Webhook Auth** to `Governed SteerCo API`.
3. Assign **Eraneos LLM Gateway** to the language-model node.
4. Confirm these production URLs:
   - governed: `/webhook/dekra-steerco-v1`
   - read-only: `/webhook/dekra-steerco-v1-read`
5. Configure GitHub-backed persistence for approved snapshots and manifests using the existing private `DEKRA-Pilot-Data` credential and paths under `knowledge/steerco/`. Do not persist licensed content.
6. Activate the workflow and perform generate, reject, regenerate, approve, publish, read, expiry, revoke and rollback smoke tests. Confirm the GitHub credential resolves to the private governed data repository before activation.
7. If endpoints differ, configure the public GitHub Actions variables `NEXT_PUBLIC_N8N_STEERCO_WEBHOOK_URL` and `NEXT_PUBLIC_N8N_STEERCO_READ_WEBHOOK_URL`. These variables are endpoint locations, never credentials.

## Security invariants

- No API key, webhook secret, shared pilot password or GitHub token is placed in the URL or frontend bundle.
- The read endpoint does not expose audit identities, internal fields, credentials or licensed KFLA content.
- Shared snapshots are immutable, scoped to one approved report, optionally expiring and revocable.
- A stale revision is rejected before approval or publication.
- Publication records a checksum and source revisions.
- Failed or partial GitHub publication must not make a snapshot readable; retry uses the original idempotency key and writes a uniquely named recovery release.
- Rollback selects a previously committed immutable revision, invalidates current links for that report, creates a new opaque share identifier and writes a new audited GitHub release. It never rewrites release history.

## Verification

Run:

```powershell
npm run lint
npm run typecheck
npm run verify:governance-artifacts
npm run verify:agent-policy
npm run verify:mapping-evaluation
npx playwright test
npm run build
```

The public-bundle verifier checks for the SteerCo and KFLA markers and scans configured secret values, token patterns and licensed-content markers.
