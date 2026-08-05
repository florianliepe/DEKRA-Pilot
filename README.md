# DEKRA × Eraneos SBO Pilot Control Tower

A responsive project-management workspace for the Skill-Based Organisation pilot. It combines delivery status, gates, deliverables, risks, meeting evidence and an audit log in one GitHub-backed application.

## Product surface

- Executive overview with project health and workstream pulse
- Gate roadmap and interactive deliverable register
- Prioritised risk register with probability-impact matrix
- Meeting summaries, decisions and action capture
- Human and automation activity trail
- Method Studio extension architecture for Skill Designer, Taxonomy and Job-to-Skill Mapping
- n8n intake adapter for document extraction and canonical normalisation

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` with:

```env
N8N_WEBHOOK_URL=<production webhook URL>
N8N_WEBHOOK_SECRET=<separate n8n Header Auth secret>
APP_SHARED_SECRET=<workspace publishing secret>
PMO_GITHUB_TOKEN=<fine-grained token with contents read/write>
GITHUB_OWNER=florianliepe
GITHUB_REPO=DEKRA-Pilot
GITHUB_BRANCH=main
PMO_DATA_PATH=knowledge/pmo/control-tower.json
```

Secrets are server-only. The workspace secret is supplied for an individual publish request and is not retained in browser storage. Authentication is intentionally deferred; the API boundary is ready to be placed behind a credential vault and session layer later.

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
