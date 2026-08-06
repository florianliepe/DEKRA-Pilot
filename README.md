# DEKRA × Eraneos SBO Pilot Control Tower

A responsive project-management workspace for the Skill-Based Organisation pilot. The static frontend runs on GitHub Pages, protected workflows run in n8n, and PMO data is versioned in a private GitHub repository.

## Product surface

- Lean PMO workbench intake for PDF, Excel, Markdown, text, CSV and image evidence
- Written-update composer routed through the n8n PMO Orchestrator
- Selectable evidence, delivery, risk and meeting specialist analyses
- Executive overview with project health and workstream pulse
- Editable gate roadmap and full deliverable CRUD
- Editable risk register with probability-impact matrix and guarded deletion
- Editable meeting summaries, participants, decisions and actions
- Human and automation activity trail
- Method Studio extension architecture for Skill Designer, Taxonomy and Job-to-Skill Mapping
- n8n intake adapter for document extraction and canonical normalisation

## Local development

```bash
npm install
npm run dev
```

Optionally create `.env.local` to override the production webhook during local development:

```env
NEXT_PUBLIC_N8N_PMO_WEBHOOK_URL=<protected n8n webhook URL>
```

Never put a secret in a `NEXT_PUBLIC_*` variable. The user supplies the shared
pilot password after opening the application. It is held in memory only and sent
to n8n as the Header Auth value.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

See [docs/architecture.md](docs/architecture.md) for the data flow and extension model and
[docs/go-live.md](docs/go-live.md) for the production deployment checklist. The production
[n8n redesign](docs/n8n-redesign.md) records the workflow audit and verification evidence.
