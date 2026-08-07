# Skill Design governance and release architecture

## Data authority

The active n8n workflow is the source of truth for mutable working state. GitHub stores approved release snapshots only. The frontend never receives a GitHub credential and never writes directly to GitHub.

## Agent boundary

Allowed actions:

1. Read approved skills, taxonomy nodes, KFLA public metadata, controlled tools and strategic vectors.
2. Extract action, object, outcome, context and exact evidence from untrusted job descriptions or interviews.
3. Detect duplicates and apply canonical syntax and granularity rules.
4. Score and explain job-to-skill mappings.
5. Create draft skills, mappings and profiles in the human review queue.

Blocked actions: approve, publish, hard-delete, retire an in-use record, change an approved record in place, or reproduce/invent licensed content.

## Mapping score

The displayed relevance score must be accompanied by four reviewable dimensions: evidence strength, taxonomy identity, target-proficiency fit and strategic alignment. Strategy and tool references may enrich a mapping but cannot replace direct role evidence.

## Release transaction

1. Save edits as n8n working state.
2. Run deterministic regression checks.
3. Resolve all pending human reviews.
4. Capture the accountable approver name.
5. Increment the revision, add a release audit event and set `publication.state` to `approved_release`.
6. Commit the complete JSON snapshot to `data/skill-workspace.approved.json` on `main` through the n8n GitHub credential.
7. Persist the released revision back to n8n and return the commit reference.

The workflow must use optimistic concurrency with the current GitHub blob SHA and reject conflicting publication attempts.

## KFLA content policy

The application uses the 38 public competency names and four public factors as navigation metadata. Every `publicSummary` is original internal wording and is visibly labelled as such. Korn Ferry definitions, clusters, rating anchors, skilled/less-skilled indicators and development guidance remain empty until an authorised licensed source and access policy are supplied.
