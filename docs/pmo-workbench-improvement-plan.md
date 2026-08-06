# DEKRA Pilot PMO workbench improvement plan

## Product objective

Make the dashboard the daily PMO workbench: one place to ingest evidence,
review agent-proposed changes, maintain canonical project records and publish an
auditable GitHub revision.

## Implemented foundation

### 1. Workbench intake

- Dedicated lean landing view for PDF, Excel, Markdown, text, CSV and image
  evidence.
- A written-update composer for meeting notes, progress updates, decisions,
  risks and free-form PMO context.
- Local extraction before transfer: spreadsheets become sheet-scoped CSV, PDFs
  become page-scoped text, images use OCR and text formats remain lossless.
- Optional routing hints for project overview, delivery, risks or meetings.
- Visible specialist-agent selection and an orchestrator status model.
- The n8n response replaces the UI with the new canonical PMO revision, avoiding
  a second manual import or stale screen.

### 2. Interactive project control

- Project profile: edit phase, dates, progress, RAG and descriptive fields.
- Workstreams: create, read, edit and delete.
- Milestones: create, read, edit and delete.
- Deliverables: create, read, update status/progress/all fields and delete.
- Risks and issues: create, read, edit scoring/mitigation/state and delete.
- Meetings: create, read, edit summaries/participants/decisions/actions and
  delete.
- Every local change produces an audit entry, marks the workspace dirty and is
  persisted only after the user publishes a validated GitHub revision.
- Delete actions require an explicit confirmation and remain reversible until
  publish by reloading the canonical document.

### 3. n8n orchestration

The production workflow now follows this path:

```text
Workbench intake
  -> extraction and input validation
  -> PMO Orchestrator
       -> enabled specialist analysis instructions
  -> canonical normalization
  -> immutable work-package JSON + Markdown evidence
  -> read current control-tower document
  -> convention-based upsert into PMO entities
  -> increment revision and append audit activity
  -> commit canonical control-tower document
  -> return the updated document and applied-change manifest
```

The merge stage rejects incomplete dated entities rather than inventing dates.
Records are matched by a supplied stable ID or an exact normalized title. New
IDs are namespaced by intake ID. Project progress and scoring are clamped to the
canonical ranges.

## Agent extension options

The UI already exposes four selectable specialist roles. The MVP uses one
orchestrator prompt with enabled-role instructions; each role can later become
an independent n8n AI Agent node without changing the frontend contract.

| Agent | Input | Output responsibility | Suggested guardrail |
| --- | --- | --- | --- |
| Evidence verifier | Extracted sources | Confidence, contradictions, review list | Source reference required |
| Delivery planner | Scope, dates, commitments | Milestones and deliverables | Never infer missing dates |
| Risk analyst | Constraints and concerns | Risks, scoring and mitigation | Explain score evidence |
| Meeting synthesizer | Notes or transcript | Summary, decisions and actions | Never turn discussion into a decision |

Recommended next orchestration iteration:

1. Fan out evidence to selected specialist agents in parallel.
2. Require each agent to return a typed proposal plus source references.
3. Add a governance agent that resolves duplicates and conflicting proposals.
4. Present a change-review diff in the frontend before the GitHub write.
5. Capture per-field confidence and human approval in the activity log.

## Usability and collaboration roadmap

### Now — MVP workbench

- Responsive intake and CRUD workflows.
- Searchable canonical views and visible unsaved state.
- Shared-password access, n8n enforcement and GitHub audit trail.
- Human review before manual edits are published.

### Next — collaborative pilot

- Change-review drawer with accept/reject per proposed field.
- Comments, mentions and named owners on risks, deliverables and actions.
- Optimistic concurrency using the loaded GitHub revision to prevent accidental
  overwrites by two users.
- Saved filters, assigned-to-me and upcoming-deadline views.
- Notifications from n8n for overdue actions, high exposure and gate slippage.

### Later — enterprise-ready

- Microsoft Entra ID instead of a shared password.
- Role-based edit/publish permissions and approval stages.
- Full source citations and confidence at field level.
- Agent execution observability, cost controls and retry/dead-letter handling.
- Integration adapters for Teams, SharePoint, Outlook and Jira/Confluence.

## Acceptance evidence

- Static GitHub Pages build completes on Node.js 22.
- Type-check, lint and browser tests cover hydration, responsive navigation,
  intake orchestration and representative CRUD operations.
- The active n8n workflow remains authenticated and keeps the production webhook
  path.
- A pre-workbench n8n backup exists before the production workflow update.
- A production smoke intake returns an updated canonical document and applied
  changes before the feature is considered fully released.
