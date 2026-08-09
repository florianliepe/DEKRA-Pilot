# ZM-04 — Governed agent-tool control plane

## Target outcome

Taxonomy stewards and job architects can understand and govern the complete
deny-by-default runtime contract for the eleven canonical agent tools. Every tool
has a separate deterministic implementation, explicit schemas and permissions,
bounded runtime policies, redacted errors, versioned ownership and an observable
invocation trail. No tool can obtain ambient authority.

## Delivery scope

1. Maintain exactly eleven canonical allowlisted implementations for job parsing,
   evidence extraction, taxonomy and similarity search, syntax and granularity
   validation, public KFLA lookup, controlled-tool lookup, mapping scoring, draft
   writing and review-package generation.
2. Validate input/output schemas, exact permissions, data classifications, timeout,
   retry/backoff, per-tool rate limits, error codes, redaction, audit fields,
   semantic versions, owners and allowed actions.
3. Reauthorize every requested tool call after model output and before execution.
4. Return opaque working-state output references; never place raw protected inputs
   in invocation logs or public artifacts.
5. Expose searchable contracts, lifecycle state, impact, schemas, policy simulation
   and recent invocation history in the governance workbench.
6. Route edits, restoration, replacement and merge through accountable review while
   preserving historical tool IDs and versions.

## Acceptance criteria

- All eleven required tool IDs are active and backed by named implementations.
- Missing permission, disallowed action, licensed classification, incomplete input,
  inactive contract, missing implementation and rate limit fail closed.
- Each successful call records version, opaque input/output references, duration,
  result, actor, correlation ID, framework/rules version and retry count.
- Registry editors can govern every contract field without editing JSON.
- The policy simulator reproduces allow/deny decisions without executing a tool.
- No runtime tool has unrestricted network, filesystem, credential, workflow,
  publication or licensed-content access.
- Governance, agent-policy, schema, UI, build and public-bundle checks pass.

## Explicit non-goals

- Tool registration does not activate a contract; human approval is mandatory.
- Runtime implementations do not approve or publish taxonomy or mapping records.
- Business tools and methods remain a separate governed vocabulary.
