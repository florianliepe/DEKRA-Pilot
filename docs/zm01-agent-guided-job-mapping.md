# ZM-01 — Agent-guided job mapping

## Zielmodus

Deliver an evidence-first workflow for taxonomy stewards and job architects that ingests a job description, normalizes its content, closes material evidence gaps, proposes mappings against the approved taxonomy and composes a draft skill profile. The agent may create drafts and review packages only. Accountable humans approve, defer, reject, edit and publish.

## User workflow

1. Open **Method studio → Jobs & mapping** and choose **Ingest job description**.
2. Add DOCX, PDF, JSON, XLSX, CSV, text or image sources, or paste the description. Set role metadata and the data classification.
3. Review source text beside normalized purpose, responsibilities, outcomes, activities, tools, qualifications, context and constraints. Intake findings expose duplicates, unsupported input and low-quality evidence.
4. Start or resume the job-specific clarification. Answers for outcomes, critical incidents, autonomy, complexity and performance level become governed evidence records.
5. Run the governed mapping agent. It can call only the eleven allowlisted tools and can use only approved taxonomy concepts, public KFLA metadata and approved controlled tools.
6. Inspect direct evidence links, KFLA/tool/vector associations, the ten positive score contributions, three penalties, confidence and explained omissions.
7. Compare the proposed profile with the last approved GitHub snapshot. Correct level and weight, record feedback, then approve, defer or reject each review item with an accountable name and reason.
8. Save working state in n8n. Only accepted objects can enter the next approved JSON release.

## Persistence and recovery

- Working state, agent runs, clarification progress, evidence, drafts and reviews are persisted by the n8n orchestrator.
- `skill.ingest_job`, `skill.clarify_job` and `skill.map_job` require an idempotency key. Replayed requests return the prior receipt instead of creating duplicates.
- Failed structured parsing or denied tool calls produce an auditable failed run with an error code, retryability flag, attempt number and optional prior-run reference.
- Source batches are limited to 20 files / 29 MB, individual extracted content is bounded, and the shared pilot workflow is rate-limited.

## Security boundary

GitHub Pages is a static client. It receives only the narrowly scoped shared webhook credential supplied by the pilot user. The n8n API key, GitHub publishing credential and LLM gateway credential remain server-side in n8n and must never use a `NEXT_PUBLIC_` variable or enter repository JSON. Licensed KFLA definitions are outside the agent boundary. Internal and confidential job evidence remains working-state content and is removed from the public release surface.

## Acceptance evidence

- TypeScript domain contracts: `src/lib/skill-schema.ts`
- Deterministic validation and release sanitization: `src/lib/skill-governance.ts`
- Job intake, clarification and mapping views: `src/components/job-mapping-workbench.tsx`
- Client extraction and workflow calls: `src/lib/n8n-client.ts`, `src/lib/skill-client.ts`
- n8n artifact and repeatable transformation: `docs/n8n-skill-designer-v3.workflow.json`, `scripts/sync-zm01-n8n.mjs`
- Governed JSON schema: `data/schemas/skill-workspace.schema.json`
- Six public-safe mapping regression cases: `data/evaluation/mapping-golden-baseline.json`
- Framework regression tests: `tests/skill-framework.spec.ts`

## Deployment runbook

1. Run `npm run sync:n8n-v3` and `npm run sync:n8n-zm01`.
2. Import or update the n8n orchestrator artifact and keep the existing webhook path active.
3. Confirm the shared secret header check, server-side credentials and LLM connection.
4. Run `npm run verify:governance-artifacts`, `npm run verify:mapping-evaluation`, `npm run verify:agent-policy`, `npm run lint`, `npm run typecheck`, tests and a production build.
5. Deploy the frontend to GitHub Pages and execute one synthetic public-safe intake, clarification, mapping and review smoke test.
6. Do not publish a working-state data release until every pending review is resolved by an accountable human.
