# Zielmodus — Job description ↔ skill profile comparison

Objective: make the direct relationship between a governed job description and its skill profile visible to job architects and taxonomy stewards without bypassing review.

1. Use `JobDescription.id` as the canonical source key. Join `JobSkillMapping.jobDescriptionId` to show evidence-linked, proposed or approved skills. Join `RoleProfile.jobDescriptionId` to show the stored profile. Do not infer a relation from matching titles.
2. Add a dedicated, read-only **Job ↔ profile** Skill Designer section and a direct entry from **Jobs & mapping**. Let users choose the job and, where more than one is linked, the role profile.
3. Show normalized purpose, responsibility and outcome evidence beside the proposed core skill profile. Expose each mapping's evidence IDs, rationale, proficiency, weight, governance status and operational confidence range. Distinguish technical skills from KFLA competencies.
4. Show missing, overlapping and unowned evidence; profile-only and mapping-only skills; approved-baseline count; and the existing 5 technical + 5 behavioral, maximum-10 quality gate. Do not silently count an unlinked profile as approved.
5. Preserve n8n working-state and GitHub approved-release boundaries. This comparison makes no write or approval. On accountable mapping review, deterministically synchronize an in-review profile from the active job mappings, record its derivation, and require a separate profile decision. Never change the source job description as a side effect of mapping.
6. Test job-to-profile joins, discrepancy reporting and navigation. Run lint, type-check, production build and UAT before committing to `main` and verifying GitHub Pages.

Acceptance: a reviewer can choose a job, see its normalized role evidence and linked skill profile side by side, identify every unsupported or missing link, and navigate to the existing governed editing views.

Clarification applied: the job description is the read-only source for derivation. The skill profile is computed from its active evidence-linked mappings, and accountable mapping review synchronizes an in-review stored profile even when the agent omitted a profile proposal. Profile approval is blocked until its links exactly match the approved mappings and the MECE/weight quality gate passes.
