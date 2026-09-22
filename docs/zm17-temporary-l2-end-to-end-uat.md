# ZM-17 — Temporary L2 groups and end-to-end mapping UAT

## Target outcome

Prove the complete job-first Skill Designer journey with temporary, explicitly non-canonical L2 groups so frontend changes can be released without prematurely deciding the pilot taxonomy. Exercise the production asynchronous n8n start/status/result route, stop at human review, and remove every UAT artifact afterward.

## Temporary taxonomy

The UAT workspace may add only these clearly labelled groups:

1. `UAT · Cloud Platform Engineering` under Digital & Technology.
2. `UAT · Service Reliability` under Digital & Technology.
3. `UAT · Collaboration & Stakeholder Alignment` under People & Culture.

These groups are test fixtures. They are not DEKRA taxonomy decisions, must never enter an approved release, and must be removed with the UAT job and every linked draft artifact.

## Journey under test

1. Capture an immutable cloud-platform job description and normalized evidence.
2. Mark clarification sufficient for the controlled fixture.
3. Start mapping through `skill.map_job.start`; poll `skill.map_job.status`; obtain the completed result through `skill.map_job.result`.
4. Validate no more than five hard/technical/functional skills, no more than five KFLA competencies, and no more than ten total.
5. Validate direct evidence lineage, 100 total profile weight, technical subtype, KFLA allocation, valid L1/L2 placement, review-only status, and unchanged source text.
6. Confirm the frontend comparison model can render the unchanged role evidence beside the derived draft profile and review state.
7. Stop before approval or publication.
8. Restore the exact pre-test working state with optimistic revision protection and confirm no `UAT-ZM17` record remains.

## Safety rules

- Do not execute the synchronous mapping webhook; long mapping runs use asynchronous polling.
- Do not approve a group, skill, mapping or profile outside the isolated UAT workspace.
- Do not publish approved JSON.
- On cleanup, compare the current workspace with the test identifiers and refuse a broad overwrite if unrelated concurrent changes are detected.
- Preserve credentials in environment variables and never print them.

## Acceptance criteria

- The async run reaches `needs_review` or a clearly diagnosed governed failure.
- Source evidence remains byte-for-byte unchanged.
- Every returned proposal is a draft/pending review item with evidence.
- Composition and weight rules pass; behavioral drafts have KFLA links and technical drafts have subtypes.
- All taxonomy placements resolve through the temporary L2 groups.
- No approval or publication occurs.
- Cleanup restores the original four jobs and five pending reviews and removes all temporary groups and UAT artifacts.
- Framework tests, lint, type-check, production build and bundle-secret verification pass before commit.
- Only intended project files are committed to `main`; unrelated user files remain untouched.
