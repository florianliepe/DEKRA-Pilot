# Production go-live guide

The application deploys a Node.js 22 standalone Next.js build to an Azure Linux
App Service. GitHub Actions builds and deploys the artifact; application secrets
remain runtime settings in Azure and are never included in the browser bundle.

## 1. Create or select the Azure App Service

In the Azure portal, create a **Web App** with:

- Publish: **Code**
- Runtime stack: **Node 22 LTS**
- Operating system: **Linux**
- Region and App Service plan: according to the DEKRA hosting decision
- Always On: enabled when the selected plan supports it

In **Configuration > General settings**, set the startup command to:

```text
node server.js
```

## 2. Configure production runtime settings in Azure

Open the Web App, then **Settings > Environment variables > App settings**.
Add the following settings and save/restart the app:

| Setting | Value | Sensitive |
| --- | --- | --- |
| `APP_SHARED_SECRET` | A new random value of at least 32 bytes | Yes |
| `PMO_GITHUB_TOKEN` | Fine-grained GitHub PAT for `DEKRA-Pilot` | Yes |
| `N8N_WEBHOOK_URL` | Production webhook URL for the active n8n workflow | Yes |
| `GITHUB_OWNER` | `florianliepe` | No |
| `GITHUB_REPO` | `DEKRA-Pilot` | No |
| `GITHUB_BRANCH` | `main` | No |
| `PMO_DATA_PATH` | `knowledge/pmo/control-tower.json` | No |
| `NODE_ENV` | `production` | No |

Generate `APP_SHARED_SECRET` locally with PowerShell and copy only its output:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

The project owner enters this same value in the application's **Publish to
GitHub** dialog. The browser sends it only for that request; it is not retained.
Do not use a GitHub personal access token as the shared secret.

## 3. Create the least-privilege GitHub token

In GitHub, open **Settings > Developer settings > Personal access tokens >
Fine-grained tokens** and create a token with:

- Resource owner: `florianliepe`
- Repository access: **Only select repositories > DEKRA-Pilot**
- Repository permission **Contents: Read and write**
- Metadata: the automatically granted read permission
- A short, managed expiration date

Store the token value in Azure as `PMO_GITHUB_TOKEN`. GitHub shows the value only
when it is created or regenerated. Never paste it into an issue, commit, chat, or
frontend environment variable.

## 4. Connect GitHub Actions to Azure

In the Azure Web App **Overview**, download **Get publish profile**. Treat the
downloaded XML as a secret.

In GitHub, open **DEKRA-Pilot > Settings > Environments > DEKRA-Secrets** and add:

- Environment secret `AZURE_WEBAPP_PUBLISH_PROFILE`: the complete publish-profile XML
- Environment variable `AZURE_WEBAPP_NAME`: the exact Azure Web App resource name

The deployment workflow references the `DEKRA-Secrets` environment explicitly.
The existing GitHub environment secret `APP_SHARED_SECRET` is not required for
deployment because GitHub Actions secrets do not become Azure runtime settings.
It can be removed after the same value is stored in Azure and n8n.

Secret expressions such as `${{ secrets.APP_SHARED_SECRET }}` belong in workflow
YAML under a job or step `env:` block. They are not entered in the GitHub secret
value field. This deployment deliberately does not expose the shared secret at
build time.

## 5. Configure and verify n8n

In the production n8n workflow:

1. Keep the existing production webhook URL and store it in Azure as
   `N8N_WEBHOOK_URL`.
2. Configure the Webhook node to respond with the final JSON from the **Respond
   to Webhook** node, including `wpId`, `markdown`, and `json`.
3. Ensure one system owns each GitHub write. The frontend currently normalises
   n8n output and commits the canonical PMO document; n8n should return extracted
   data rather than create a second commit.
4. Activate the workflow and run one non-production sample document through it.

The n8n management API key previously shared outside the n8n credential store
must be revoked and replaced before production. It is not an application runtime
setting and is not required by the frontend.

## 6. Release and smoke test

After the environment secret and variable exist, merge the deployment pull
request. The push to `main` runs lint, type-checking, the production build, and
the Azure deployment.

Verify:

1. GitHub Actions reports both `build` and `deploy` as successful.
2. The Azure URL loads the control tower over HTTPS.
3. `GET /api/pmo` reports `source: "github"`.
4. A publish attempt without the shared secret returns HTTP 401.
5. A controlled update with the shared secret creates exactly one GitHub commit.
6. An n8n intake refreshes the UI and leaves an audit-log entry.

If deployment approvals are desired, add required reviewers to the
`DEKRA-Secrets` GitHub environment before merging.
