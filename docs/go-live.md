# GitHub Pages MVP go-live guide

The frontend is a static Next.js export hosted at
`https://florianliepe.github.io/DEKRA-Pilot/`. The public bundle contains no
credential or PMO data. A protected n8n webhook provides the runtime API and
stores canonical artifacts in the private `florianliepe/DEKRA-Pilot-Data`
repository.

## Architecture

```text
GitHub Pages -> protected n8n webhook -> private GitHub data repository
       |                 |
  static UI        validation, AI and commits
```

The shared pilot password is entered after opening the site. It is retained only
in React memory and cleared when the page is refreshed or closed.

## 1. Configure the n8n workflow

For the ZM-01 Skill Designer flow, synchronize and import `docs/n8n-skill-designer-v3.workflow.json` after running `npm run sync:n8n-v3` and `npm run sync:n8n-zm01`. The operations `skill.ingest_job`, `skill.clarify_job` and `skill.map_job` require idempotency keys and persist drafts only. See [the ZM-01 runbook](./zm01-agent-guided-job-mapping.md).

Use the active `PMO Assistant` workflow and keep its production webhook path.
The webhook must accept the `x-n8n-webhook-secret` Header Auth credential and
allow the origin `https://florianliepe.github.io`.

Route requests using the JSON `mode` field:

| Mode | Input | Output |
| --- | --- | --- |
| `pmo.read` | none | `{ ok, source, storageConfigured, document }` |
| `pmo.save` | `document` | validated document with incremented revision and commit metadata |
| `pmo.ingest` | `meta`, `extracted` | canonical work-package result and committed file paths |

For `pmo.read`, read `knowledge/pmo/control-tower.json` from the private data
repository. For `pmo.save`, validate the document, update `revision` and
`project.updatedAt`, and commit the JSON. For `pmo.ingest`, retain the existing
agent normalization and commit the generated Markdown and JSON below
`knowledge/work-packages/`.

Configure the n8n GitHub credential with access only to
`florianliepe/DEKRA-Pilot-Data` and repository permission **Contents: Read and
write**. Do not put this token or the pilot password in the Pages repository,
Pages variables, or client code.

## 2. Configure the Pages repository

The deployment uses `.github/workflows/deploy-pages.yml`. In **Settings > Pages**,
select **GitHub Actions** as the build and deployment source.

The production webhook URL has a safe code fallback. To override it without a
code change, add this non-sensitive repository variable under **Settings >
Secrets and variables > Actions > Variables**:

```text
NEXT_PUBLIC_N8N_PMO_WEBHOOK_URL=https://eraneos-agentic-platform.azurewebsites.net/webhook/7666d3c6-b63f-4e79-b10a-82a002a9cf47
```

Do not add `APP_SHARED_SECRET`, `N8N_WEBHOOK_SECRET`, or a GitHub token to the
Pages build. Any `NEXT_PUBLIC_*` value is readable by site visitors.

## 3. Release

Merge the GitHub Pages pull request into `main`. The workflow runs lint,
type-checking, the static build, artifact upload, and Pages deployment.

Verify:

1. The Pages Actions run completes successfully.
2. The project URL displays the pilot-password prompt.
3. An invalid password is rejected by n8n.
4. A valid password loads the PMO document from the private repository.
5. One controlled update creates exactly one private-repository commit.
6. Evidence intake creates the expected Markdown and JSON artifacts.
7. Refreshing the browser requires the password again.

## Security limitations accepted for the MVP

- The application shell and source repository are public.
- A shared password provides workspace access; it does not identify individual
  users.
- Authorized users can inspect their own request payloads in browser developer
  tools.
- Browser-side text, spreadsheet and OCR extraction means selected evidence is
  sent to n8n as extracted text, not raw files.

Replace the shared password with Microsoft Entra ID before broader rollout or
when per-user access and audit attribution become mandatory.
