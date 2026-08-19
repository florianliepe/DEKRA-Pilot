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
| UAT-003 | Medium | Governed AI calls took approximately 40–210 seconds without meaningful progress information. | DOCX normalization: 78–190s; clarification turns: approximately 44–75s; Cloud mapping completed after the former 180s boundary. | Added elapsed-time status messages, expected-duration guidance and a 240-second safe client boundary. Async run polling remains the recommended architectural fix. |
| UAT-004 | Medium | A newly ingested job appeared in the catalog but the view remained on the previously selected job. | After successful DOCX intake the catalog showed two jobs while the detail view remained Global Reporting Analyst. | Select the newly returned job deterministically by comparing governed job identifiers. |
| UAT-005 | Medium | Two published n8n workflows share the same Skill Designer Orchestrator v3 name. | n8n workflow IDs `etuCxjr2u5bPYqP2` and `1jgGJdy3wXW6kH87`; only the former received current traffic. | Open: archive or clearly label the stale workflow after owner confirmation; do not delete automatically. |
| UAT-006 | Medium | The local agent permission registry accumulated duplicate object keys from sequential sync scripts. | Repeated `skill.ingest_job` and `skill.clarify_job` keys in the generated context code. | Rebuilt the registry once with unique mode definitions. |
| UAT-007 | High | A governed mapping run could finish successfully with an empty profile, no mapping, no omission and no taxonomy-gap proposal. | Initial Vehicle Inspection Engineer run `RUN-1787143213215` invoked five allowlisted mapping tools successfully, but the approved catalog had no suitable vehicle skill and the workflow persisted an empty draft profile. The post-fix live run on 19 August at 15:18 produced four evidence-grounded vehicle-skill drafts and one explicit abstention for `Managing Complexity` at score 29, while persisting no empty profile. | Expanded the strict response schema with evidence references and omissions; route no-fit concepts to draft taxonomy-gap proposals; block unexplained empty mapping output; do not persist empty profiles. **Verified live.** |
| UAT-008 | High | n8n's editor-level **Import from file** action merges imported nodes into the current draft rather than replacing the workflow. | Importing the committed ZM-09 artifact into workflow `etuCxjr2u5bPYqP2` produced parallel legacy and v3 node sets in **Current changes** while the published ZM-07 version remained intact. | Restored the intact published ZM-07 version, synchronized the five governed parameter sets in place, clipboard-verified each value against the committed artifact and published operational workflow version `ZM-09 UAT quality and mapping guardrails`. Do not use editor import for in-place synchronization; use `scripts/update-live-n8n.mjs` when API access is available. |
| UAT-009 | High | Mapping validation referenced an undefined `mappingScoreKeys` variable. | The IT Application Manager mapping execution failed in `Governance Gate & Store` with `mappingScoreKeys is not defined [line 43]`. | Defined and enforced all thirteen score keys. Local lint, type-check and production build passed; the subsequent IT mapping completed with three explained omissions and three taxonomy-gap drafts. |
| UAT-010 | Medium | Fractional agent confidence was rendered literally as `0.65%`. | IT review items returned fractional confidence while evidence segments used percentage values. | Normalized values in `(0,1]` to percentages in job evidence, the review queue, skill library and evidence registry. |
| UAT-011 | High | The first XLSX fallback classified raw CSV rows and manager-note IDs as outcomes and omitted responsibilities. | Initial Cloud Platform Engineer result contained `0 responsibilities`, `8 outcomes` and raw values such as `N-01,Role scope,...`. | Added sheet-aware CSV parsing, task-row recognition, controlled tool extraction and sheet/row evidence provenance. Structured XLSX now routes through deterministic normalization; clarification and mapping remain agentic. Verified with 13 responsibilities, one explicitly vague outcome, 13 activities and 16 tool references. |
| UAT-012 | High | Malformed LLM JSON caused a valid structured job intake to be rejected after 146 seconds. | XLSX execution `18791` succeeded technically but returned `403 Agent output failed structured parsing`. | Added a narrow fail-safe: only `skill.ingest_job` with `INVALID_AGENT_JSON` may use deterministic source normalization and receives an `AGENT_PARSE_FALLBACK` warning. Mapping, tool policy and publication remain fail-closed. |
| UAT-013 | Medium | Governed Cloud mapping exceeded the 180-second client timeout although n8n completed the idempotent request afterward. | The browser timed out at 180 seconds; a governed reload later showed six draft taxonomy-gap skills and two explained omissions. | Increased the client boundary to 240 seconds, clarified that the server may still complete an idempotent request, and instructs users to reload before retrying. Longer term: add async run polling and server-side job status rather than holding the webhook request open. |
| UAT-014 | High | Non-XLSX fallback trusted the agent's collapsed `sourceText`, so deterministic supplementation could not recover missing paragraphs; defect statements could also be mistaken for outcomes. | Initial Business Process Manager intake retained only 5 of 10 responsibilities and treated `Trait language dominates...` as an outcome. | Deterministic supplementation now uses the original extracted document, merges verb-led responsibilities with agent output, expands tool recognition, removes known defect statements from outcomes and flags absent measurable outcomes rather than inventing them. Published as `ZM-09.6 Source-faithful legacy evidence`. |
| UAT-015 | Medium | Clarification answer persistence did not advance the visible IT session on the first observed turn. | The answer request completed successfully in n8n but the UI remained at `0/5` and displayed the same question. | Open regression: capture the original request body at the governance gate, return the updated session explicitly, and add a deterministic UI assertion that answered question IDs cannot remain open. No answer data was approved or published. |

## Baseline quality observations

The DOCX extractor retained source name and block-level locations and correctly separated purpose, responsibilities, activities, outcomes, qualifications, constraints, context and intake findings. The Vehicle Inspection Engineer normalization aligned semantically with the golden target and explicitly flagged regulatory scope, proficiency evidence and impartiality conflicts instead of silently resolving them.

The governance boundary remained intact during the observed run: normalized jobs and clarification evidence were drafts in n8n working state, the review queue remained human-controlled, and `Release approved JSON` was not invoked.

The mapping runs preserved the control boundary. Vehicle Inspection produced four taxonomy-gap drafts and one explained omission. IT Application Management produced three taxonomy-gap drafts and three explicit omissions. Cloud Platform Engineering produced six taxonomy-gap drafts and two explicit omissions (`Data Visualization` score 35 and `Managing Complexity` score 54). No proposal was approved and no approved-JSON publication occurred.

The golden workbook defines 25 canonical skills and 30 role links, while the live approved catalog contained only two relevant approved skills during UAT. Exact link recall is therefore not a valid release gate yet. The correct observed behavior was abstention plus evidence-grounded taxonomy-gap proposals, not forced mappings.

Targeted cleanup is executed with `scripts/cleanup-skill-uat.mjs`. It matches only the four synthetic fixture names and an explicit allowlist of UAT-created draft skill names, then removes dependent mappings, profiles, clarifications, omissions, feedback, evidence, runs, reviews, versions and audit records. The approved GitHub snapshot and non-UAT records are never changed.

## Remaining regression gates

- Fix and automate the clarification answer/advance regression (`UAT-015`).
- Replace synchronous mapping webhooks with an async run contract (`queued → running → needs_review / failed`) and frontend polling.
- Expand the approved pilot taxonomy before scoring exact recall against the 25-skill / 30-link golden oracle.
- Verify all thirteen score dimensions on an accepted mapping once an accountable reviewer approves a suitable non-UAT proposal.
- Archive or clearly label the stale duplicate workflow after owner confirmation.
