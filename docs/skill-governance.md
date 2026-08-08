# Skill Design governance and release architecture

## Data authority

The active n8n workflow is the source of truth for mutable working state. GitHub stores approved release snapshots only. The frontend never receives a GitHub credential and never writes directly to GitHub.

Mapping feedback is immutable, versioned and auditable. A reviewer and evidence-based reason are mandatory; adjusted confidence must remain between 0 and 100. Reviewer feedback is retained in protected working state and excluded from public approved JSON to avoid publishing internal identities or rationales.

Sources, evidence records and validation rules use soft lifecycle operations. Create, edit, duplicate, archive, restore, deprecate, replace and merge require an accountable actor and reason. Proficiency-definition edits and framework-configuration changes have the same accountability gate. Every save stores the rationale in the immutable object-version snapshot and the named actor in the audit event. Source replacement migrates evidence references; evidence merge consolidates supported entities and confidence; validation-rule replacement preserves historical rule IDs while routing the target contract back to review.

## Agent boundary

Allowed actions:

1. Read approved skills, taxonomy nodes, KFLA public metadata, controlled tools and strategic vectors.
2. Extract action, object, outcome, context and exact evidence from untrusted job descriptions or interviews.
3. Detect duplicates and apply canonical syntax and granularity rules.
4. Score and explain job-to-skill mappings.
5. Create draft skills, mappings and profiles in the human review queue.

Blocked actions: approve, publish, hard-delete, retire an in-use record, change an approved record in place, or reproduce/invent licensed content.

## Mapping score

The displayed relevance score is a versioned weighted calculation over thirteen reviewable dimensions: semantic relevance, direct evidence strength, responsibility coverage, outcome relevance, taxonomy compatibility, granularity compatibility, KFLA compatibility, controlled-tool relevance, proficiency compatibility, similarity to approved mappings, duplicate penalty, contradiction penalty and missing-evidence penalty. Weights live in `data/framework-config.json`. A reviewer can override the result only with an accountable reason; the original composition remains in history.

Job-description create, edit and archive operations require a named job-architecture owner and governance reason. Governed mapping create/edit operations carry the same accountability data in their immutable version snapshots; mapping feedback remains a separate reviewer decision and never implies approval.

Guided elicitation save/resume, AI rewrite and review submission share one accountable capability-owner context. The actor and rationale are persisted with each session version and copied into the review payload; AI assistance is unavailable until that context is supplied.

Skill and role-profile editors require a named owner and reason for every create or material edit. Profile skill additions, removals and target-level changes use a separate impact-confirmation gate. Review-summary edits and controlled re-evaluation requests remain pending, require reviewer identity and rationale, and create immutable history. Strategic vectors use versioned create/edit/archive/restore rather than hard deletion; dependent mapping references are preserved and returned to proposed review state.

## Release transaction

1. Save edits as n8n working state.
2. Run deterministic regression checks.
3. Resolve all pending human reviews.
4. Capture the accountable approver name.
5. Increment the revision, add a release audit event and set `publication.state` to `approved_release`.
6. Commit the complete JSON snapshot to `data/skill-workspace.approved.json` on `main` through the n8n GitHub credential.
7. Persist the released revision back to n8n and return the commit reference.

The workflow uses both the approved revision and current GitHub blob SHA for optimistic concurrency. An idempotency key makes retries safe. The version 3 publisher creates the approved snapshot, release manifest and release index in one Git tree and fast-forwards `main` without force. A failed run remains recoverable by retrying the same prepared release; a rollback is a new reviewed release and never rewrites history.

After GitHub accepts the atomic commit, the frontend reloads the approved snapshot to obtain its new blob SHA and records a publication receipt in the full n8n working workspace. This advances the approved base revision without replacing draft, deferred or in-review objects with the sanitized public snapshot. Receipt persistence is idempotent; retrying a completed publication cannot duplicate its release history or audit version.

## KFLA content policy

The application uses the 38 public competency names as research/navigation metadata. The four-factor and twelve-cluster navigation layer, summaries and examples in the public app are explicitly classified as organisation-authored pending licensed verification. Korn Ferry definitions, rating anchors, skilled/less-skilled indicators and development guidance remain outside the repository and public bundle. When licensed material is supplied, only a protected backend reference is stored in working state; the release sanitizer removes both the reference and the content.

## Multilingual terminology

`localizedLabels` is a governed collection of language-specific labels and optional descriptions. Every record references one canonical concept by `entityType` and `entityId`; translations never create a second skill, taxonomy node, KFLA competency or controlled tool. The framework canonical language remains on the source concept and the resolver falls back to that label when no active translation exists.

Create, edit, archive and restore operations require an accountable actor and governance reason and produce an immutable object version plus audit event. Validation rejects orphaned references, unsupported languages, blank labels and duplicate active concept/language pairs. The public release contains approved public or organisation-authored translations only. Licensed wording is not accepted by this public collection and must remain in the protected licensed-content backend.

See [skill-framework-v3.md](skill-framework-v3.md) for contracts, operational recovery, test evidence and user validation.

## Role-profile lifecycle

Role profiles support create, view, edit, duplicate, archive, restore,
deprecate, replace and merge. A profile may link to one governed source job and
contains unique links to active skills with target proficiency, weight and
criticality. The release validator blocks duplicate or unavailable skill links
and blocks an approved profile without an active source job.

Every skill-link edit and structural lifecycle action creates an immutable
object version and audit event. Replace and merge show related mappings and the
source job before execution, require an accountable actor and reason, mark the
source with `replacedById`, migrate unique skill links to the target, and route
the target back to `in_review`.

## Controlled business-tool lifecycle

Controlled tools and methods are governed business vocabulary, not executable
agent functions. Create, edit, duplicate, archive, restore, deprecate, replace
and merge operations show linked skills and job mappings before execution and
require an accountable actor and reason.

Replace and merge rewrite governed mapping `toolIds`, deduplicate aliases,
skills and allowed catalogue actions, add a `replacedById` chain, and return
affected mappings plus the target tool to review. Validation blocks duplicate
or unavailable skill links and obsolete mapping-to-tool references.

## Domain and group lifecycle

Domain and group create/edit candidates are stored in the review payload and
do not change the active hierarchy before approval. Duplicate produces a draft
working copy. Move, archive, restore, deprecate, replace and merge requests
require an accountable proposer and reason, preview affected groups, skills,
mappings, profiles, tools, relationships and jobs, and enter the human review
queue. Approval applies child/reference migrations atomically and records
replacement lineage; rejection or deferral remains non-mutating.

## KFLA structural lifecycle

The fixed public reference layer retains four factors, twelve clusters and 38
competencies. Archive, restore, deprecate, replace and move requests are
proposals: they require an accountable proposer and evidence-based reason,
show child and downstream impact, and enter the human review queue before any
hierarchy mutation occurs. Approval applies factor/cluster propagation, skill
reference migration and replacement lineage atomically; rejection or deferral
leaves the structure unchanged. Release validation requires the complete,
enabled and internally aligned 4/12/38 model.

Public-safe factor, cluster and competency metadata follows the same gate. The
complete candidate, accountable proposer, evidence reason and dependency counts
are retained in a review payload. Rejection or deferral is non-mutating;
approval applies the metadata atomically, synchronizes factor assignments for
affected child competencies and creates an immutable object version. Canonical
IDs, factor names, competency names and competency numbers cannot be changed
through the metadata editor. Licensed definitions remain outside this public
workflow and bundle.

## Callable agent-tool lifecycle

The callable registry is governed separately from business tools. Contract
edits and new registrations are always draft and produce a pending review.
Duplicate, disable, restore, deprecate, replace and merge operations preserve
immutable versions and show recorded run/invocation impact. Restore, replace
and merge require approval before activation. Historical invocation tool IDs,
versions and correlation IDs are never rewritten, and the release gate blocks
missing, inactive, duplicated or incomplete canonical tool contracts.

## Governed portability and rollback

Workspace imports are parsed into schema-v3 fields, scanned for credential-like
material and protected KFLA definitions, validated, and previewed by changed
collection before submission. The active workspace remains unchanged until an
accountable reviewer accepts the import. Application preserves the local
release history, publication receipt, audit history and immutable object
versions, so an imported file cannot rewrite governance evidence. Working JSON
exports require a named actor and reason and add an export receipt to the audit
and object-version history.

Rollback requests require a named requester and evidence reason, retain the
target manifest, revision and Git commit, and reject duplicate pending requests.
Approval is a forward publication transaction; it never rewrites Git history.
