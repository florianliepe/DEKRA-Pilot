# Skill Designer UAT report — 19 August 2026

## Scope

Live application: `https://florianliepe.github.io/DEKRA-Pilot/`

Authoritative workflow observed in n8n: `DEKRA Skill Designer Orchestrator v3` (`etuCxjr2u5bPYqP2`). A second workflow with the same display name (`1jgGJdy3wXW6kH87`) is published but stale and did not receive current requests.

Synthetic sources:

- Vehicle Inspection Engineer — DOCX
- IT Application Manager — PPTX
- Cloud Platform Engineer — XLSX
- Business Process Manager — DOCX
- Expected-results workbook — XLSX semantic oracle

The run stops before human approval or JSON publication.

## Findings and remediation

| ID | Severity | Finding | Evidence | Remediation |
|---|---:|---|---|---|
| UAT-001 | High | PPTX could be selected but was rejected during extraction. | Live error: `Unsupported file type: 02_legacy_it_application_manager.pptx`. | Added client-side PPTX extraction with ordered `Slide N` provenance and aligned both intake accept lists. |
| UAT-002 | High | Clarification used a generic five-question template instead of job-specific ambiguity questions. | Vehicle Inspection Engineer session asked generic outcome, incident, autonomy, complexity and level questions despite six explicit intake findings. | Added explicit agent response schema for contextual questions, a governed contextual fallback, and source-specific rationales. |
| UAT-003 | Medium | Governed AI calls took approximately 40–78 seconds without meaningful progress information. | DOCX normalization: 77.6s; clarification turns: approximately 44–50s. | Added elapsed-time status messages, expected-duration guidance and a 120-second safe timeout. |
| UAT-004 | Medium | A newly ingested job appeared in the catalog but the view remained on the previously selected job. | After successful DOCX intake the catalog showed two jobs while the detail view remained Global Reporting Analyst. | Select the newly returned job deterministically by comparing governed job identifiers. |
| UAT-005 | Medium | Two published n8n workflows share the same Skill Designer Orchestrator v3 name. | n8n workflow IDs `etuCxjr2u5bPYqP2` and `1jgGJdy3wXW6kH87`; only the former received current traffic. | Open: archive or clearly label the stale workflow after owner confirmation; do not delete automatically. |
| UAT-006 | Medium | The local agent permission registry accumulated duplicate object keys from sequential sync scripts. | Repeated `skill.ingest_job` and `skill.clarify_job` keys in the generated context code. | Rebuilt the registry once with unique mode definitions. |
| UAT-007 | High | A governed mapping run could finish successfully with an empty profile, no mapping, no omission and no taxonomy-gap proposal. | Initial Vehicle Inspection Engineer run `RUN-1787143213215` invoked five allowlisted mapping tools successfully, but the approved catalog had no suitable vehicle skill and the workflow persisted an empty draft profile. The post-fix live run on 19 August at 15:18 produced four evidence-grounded vehicle-skill drafts and one explicit abstention for `Managing Complexity` at score 29, while persisting no empty profile. | Expanded the strict response schema with evidence references and omissions; route no-fit concepts to draft taxonomy-gap proposals; block unexplained empty mapping output; do not persist empty profiles. **Verified live.** |
| UAT-008 | High | n8n's editor-level **Import from file** action merges imported nodes into the current draft rather than replacing the workflow. | Importing the committed ZM-09 artifact into workflow `etuCxjr2u5bPYqP2` produced parallel legacy and v3 node sets in **Current changes** while the published ZM-07 version remained intact. | Restored the intact published ZM-07 version, synchronized the five governed parameter sets in place, clipboard-verified each value against the committed artifact and published operational workflow version `ZM-09 UAT quality and mapping guardrails`. Do not use editor import for in-place synchronization; use `scripts/update-live-n8n.mjs` when API access is available. |

## Baseline quality observations

The DOCX extractor retained source name and block-level locations and correctly separated purpose, responsibilities, activities, outcomes, qualifications, constraints, context and intake findings. The Vehicle Inspection Engineer normalization aligned semantically with the golden target and explicitly flagged regulatory scope, proficiency evidence and impartiality conflicts instead of silently resolving them.

The governance boundary remained intact during the observed run: normalized jobs and clarification evidence were drafts in n8n working state, the review queue remained human-controlled, and `Release approved JSON` was not invoked.

The final live mapping run preserved the control boundary: five allowlisted tools ran with zero denials, all four new skills entered human review as drafts, one below-threshold candidate was explained as an omission, and no approval or approved-JSON publication occurred.

Targeted cleanup completed at n8n working revision 21 after the final regression: one synthetic job, four draft skills, four pending reviews, one clarification session, five clarification evidence records, one omission and eight related agent runs were removed. A follow-up governed read found zero marker-bearing UAT records. The approved GitHub snapshot and non-UAT records were not changed.

## Remaining regression gates

- Ingest and compare PPTX, XLSX and the second DOCX after the frontend deployment.
- Complete governed mapping for the remaining PPTX, XLSX and second-DOCX job fixtures and compare the four-role result against the 25-skill / 30-link golden expectation semantically.
- Verify all thirteen score dimensions on at least one accepted mapping; the vehicle fixture exercised the below-threshold omission path because its approved-taxonomy fit correctly abstained.
