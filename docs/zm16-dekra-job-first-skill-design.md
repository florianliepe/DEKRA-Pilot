# ZM-16 — DEKRA job-first skill design

## Target outcome

Give job architects and taxonomy stewards one simple, governed path from an unchanged DEKRA job-role description to a reusable skill profile. The supplied design-principles PDF is a working design reference, not a substitute for a steward-approved framework release. The supplied KFLA workbook contains internally authored descriptions and draft proficiency anchors, not licensed Korn Ferry definitions.

## Decision rules

1. Ingest the DEKRA role description and preserve its original text, file identity and source locations. Normalize evidence in a separate derived layer; never rewrite the source to make a mapping fit.
2. Compose at most ten distinct skills. Target roughly half behavioural competencies and half hard/technical/job-functional skills (normally five and five for a full ten-skill profile). Do not pad a short profile. Review and document a justified imbalance.
3. Behavioural selections resolve to the 38 KFLA competency metadata. Mark exact DEKRA Leadership Standard name matches separately. Show DEKRA Core Competency themes as contextual alignment, not automatic one-to-one KFLA equivalences.
4. Derive hard/technical/functional capability candidates from observable action, object, outcome, context and method in the job evidence. Search the approved catalogue first. Use controlled technologies and methods as evidence, not as automatic skill names. A genuine gap becomes a draft for taxonomy-steward review.
5. Maintain a mutually exclusive set of canonical skill concepts and collectively cover material role outcomes. A source passage may support a technical capability and a behavioural competency; distinguish primary outcome ownership from supporting behavioural evidence. Show gaps and overlaps rather than hiding them.
6. Separate catalogue definitions from role profiles: a skill is reusable across roles, while each role profile specifies target proficiency, weight, evidence and approval status.
7. Keep mapping, proficiency and publication human-controlled. The agent drafts and explains; a job architect validates role truth and a taxonomy steward validates canonical skill boundaries. Do not publish draft or licensed content.

## Principles traceability

| Principle | Workbench conformance question |
| --- | --- |
| P1 Strategic alignment | Which approved DEKRA priority or documented business outcome explains the skill's relevance? An absent strategy source stays an open review item. |
| P2 Ability to act | What observable role outcome would fail without the capability? |
| P3 Universal technology fluency | Where is practical technology use and learning evidenced for this role? If absent, ask for evidence; do not invent a requirement. |
| P4 Common language | Is the proposed concept an approved reusable catalogue skill with a stable L1 domain, L2 group and L3 skill, or a governed draft gap? |
| P5 Continuous learning | Does each target proficiency have an observable current-level and next-level indicator? Generic four-level labels are insufficient alone. |
| P6 Composable profiles | Could the skill definition be reused for another role without copying this job's wording? Are interface skills represented without duplicate boundaries? |

The PDF itself labels the six-principle overview as draft and has incomplete conformance tests for some principles. This workbench therefore displays the conformance questions as design-review guidance, not as a claim that the source is a finalized DEKRA policy.

## Delivery sequence

1. Remove contradictory and duplicate entry points; present one path: Job intake → Clarify → Map → Compare → Review. Retain taxonomy, KFLA hierarchy, profile and approval views.
2. Align the profile count and type checks across Role profiles, mapping, playbook and review. Surface behavioural/technical balance as a visible target and explain shortfalls rather than adding filler.
3. Show direct source-to-profile lineage, leadership-standard and KFLA allocation, gaps, composition and approval status in the comparison view.
4. Keep existing asynchronous n8n mapping and publication boundaries. Change backend prompts/validators only after a versioned contract and live UAT can be checked safely; do not mutate an active n8n workflow merely to change screen copy.

## Implementation and remaining contract work

The frontend now starts from Jobs & mapping, places legacy skill-only intake in More tools, shows P1–P6 review questions, makes original ingested job text read-only, labels the six exact Leadership Standard matches, and uses the ten-skill/five-per-category rule in both stored-profile and mapping guidance. A materially uneven approved profile requires a recorded evidence-based exception reason. New manually governed non-behavioural skills can be marked hard, technical, functional or interface; older catalogue entries remain visibly unreviewed rather than being inferred into a subtype.

The active n8n mapping workflow now carries the job-first 5+5 target, evidence-based imbalance exception, technical capability subtype, KFLA draft linkage, and a blocked-review route when an approved L2 group is missing. These rules remain draft guidance; the P1–P6 strategic-alignment source has not been approved by a taxonomy steward. No skill proposal or release was approved or published.

## Live UAT and recovery, 22 September 2026

- The first isolated mapping execution produced five evidence-linked draft gaps: three technical-category and two behavioural, with 100 total weight points. Technical subtypes were two technical and one functional. The initial prompt did not return KFLA IDs for the two behavioural drafts; the revised prompt and persistence gate corrected that gap.
- The next execution returned KFLA IDs for both behavioural drafts. All five proposals lacked a valid L2 group because the pilot's two approved groups did not cover platform engineering or general behavioural capabilities. Previously, the gate rejected the entire run with `MAPPING-GAP-DESIGN-001`. The revised gate retains these as blocked draft proposals requiring taxonomy-steward placement; deterministic replay of the actual agent output passed with five blocked placements and no publication.
- A direct synchronous mapping request exceeded the web gateway's response window and returned HTTP 504 while the n8n execution continued to completion. The application already uses asynchronous start/status/result polling; future end-to-end UAT must use that path, not the direct orchestrator webhook.
- The UAT uncovered a separate persistence defect: the failed-validation path wrote an isolated test workspace despite `deferPersistence: true`, and `skill.read` could write a request-supplied workspace. Both paths were corrected in the active workflow. The exact four-job, five-pending-review pre-test workspace was restored using revision-checked save; durable state was verified at revision 65 with no UAT job remaining.
- Local replay now checks 3 technical/2 behavioural drafts, KFLA links, evidence, blocked L2 placement, non-mutating deferred failure, and non-mutating read. Framework tests: 54 passed; lint and type-check passed. A new complete asynchronous live mapping UAT after these fixes remains open, as does steward approval of suitable L2 groups and the DEKRA principle source.

## Acceptance tests

- A profile with eleven skills, six in either category, an unsupported trait/driver, or no linked role description cannot be presented as conformant.
- A ten-skill profile with five in each category displays the intended balance; a smaller evidence-backed profile is not padded and its imbalance is visible.
- Source text remains unchanged when reviewing mappings or a derived profile.
- All six DEKRA Leadership Standard exact-name matches are identifiable without mislabelling other KFLA competencies.
- The public UI distinguishes draft/internal KFLA wording from licensed Korn Ferry material.
- Build, type-check, lint and relevant framework tests pass. Live n8n and publication UAT are reported separately and never presumed from local checks.
