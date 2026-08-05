# n8n PMO workflow redesign

## Production workflow

- Name: `PMO Assistant`
- Workflow ID: `CErz8oiufq2FQiNF`
- Production webhook path: `7666d3c6-b63f-4e79-b10a-82a002a9cf47`
- Pre-change backup: `O2rEV9jcqOsulCN7` (inactive)

## Findings from the production audit

The prior workflow was active but not production-ready:

1. `BuildAssistantInput` stored `META` and `EXTRACTED`, but the agent prompt only
   received the fixed sentence `Produce canonical PM JSON only`. Uploaded evidence
   never reached the model.
2. `ReturnCanonical` returned n8n expressions as literal strings rather than the
   canonical response object.
3. CORS contained a malformed origin (`*https://.../`).
4. The system prompt combined conflicting JSON-only and fixed-Markdown contracts.
5. Model output parsing did not reliably handle the agent's `output` wrapper or
   fenced JSON.
6. No payload count, identifier, or extracted-character validation ran before the
   model request.
7. Historical executions showed repeated `CommitToGithub` failures caused by
   invalid JSON bodies and an unreachable service, plus earlier memory-node
   failures. The current architecture therefore keeps GitHub writes in the
   authenticated application API.

## Applied workflow

```text
PMO-Intake
  -> BuildAssistantInput (validate + compose evidence prompt)
  -> PMO Assistant
       <- Eraneos LLM Gateway model
  -> NormalizeCanonical (parse + constrain + render)
  -> webhook JSON response
```

Changes applied on 2026-08-05:

- preserved the production webhook path and active state;
- restricted browser CORS to `https://florianliepe.github.io`;
- replaced the Set node with a validation Code node;
- required a safe work-package ID, 1-20 evidence objects, and at most 200,000
  extracted characters;
- embedded `meta` and `extracted` evidence in the actual agent input;
- marked evidence as untrusted content to reduce prompt-injection exposure;
- replaced the conflicting prompt with one strict canonical JSON contract;
- omitted unsupported model-temperature parameters for the configured Claude
  model behind the Eraneos gateway;
- hardened fenced/wrapped JSON parsing and enum/range normalization;
- included evidence filenames in `source` references;
- returned the last node's real JSON object instead of literal expressions;
- left GitHub persistence in the application server, protected by
  `APP_SHARED_SECRET`.

## Verification evidence

A production webhook test using `WP-GOLIVE-TEST6` returned HTTP 200 and:

- `ok: true`;
- the requested work-package ID;
- a dated deliverable extracted from the supplied evidence;
- canonical JSON and fixed-heading Markdown;
- three explicit review items for facts the model could not safely infer.

An empty payload was rejected before model execution. The Pages origin preflight
returned HTTP 204 with the exact allowed origin.

## Webhook authentication

Header Authentication was enabled after the functional redesign:

- credential: `DEKRA PMO Webhook Auth` (`XeRspTWURk5bdcPi`);
- header: `x-n8n-webhook-secret`;
- unauthenticated production request: HTTP 403;
- authenticated production request: successful canonical response for
  `WP-AUTH-GOLIVE`;
- matching GitHub environment secret: `N8N_WEBHOOK_SECRET`.

The same secret must be stored in Azure App Service as `N8N_WEBHOOK_SECRET`.
The application proxy already sends the header on server-to-server calls. Do not
reuse `APP_SHARED_SECRET`, the GitHub token, or the n8n management API key.
