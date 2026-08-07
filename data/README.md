# Governed skill data

`skill-workspace.approved.json` is the immutable, human-approved release snapshot used for audit and downstream consumption.

- n8n owns the mutable working state.
- The Skill Designer agent can only create proposals and review drafts.
- A named human approver must clear all validation findings and pending reviews before release.
- n8n commits the complete approved workspace to `main` at `data/skill-workspace.approved.json`.
- Public KFLA entries contain original internal navigation summaries only. Licensed definitions, anchors and development content must be supplied and access-controlled separately.
- Approved releases contain approved objects only. Draft skills, non-approved mappings, working elicitation sessions, agent traces and object-version snapshots remain in protected n8n working state.
- Approved `localizedLabels` reference stable canonical concept IDs and contain public or organization-authored terminology only; licensed translations remain backend-only.
- Approved role profiles must resolve to an active governed job description and contain unique links to active approved skills. Lifecycle and impact history remains protected n8n working state.
- Controlled business tools are released independently from callable agent tools. Approved mappings may reference only unique active controlled tools; replacement and merge history remains protected working state.
- Mapping feedback is a protected governance record: reviewer identity, rationale, calibrated confidence and evidence completeness persist through n8n but are removed from the public approved snapshot. Feedback never changes approval status by itself.
- `agent-tool-registry.json` is a deny-by-default, fully expanded contract for the eleven callable agent tools; it is separate from controlled business tools.
- `framework-version.json`, `prompt-versions.json` and `mapping-model-versions.json` pin the exact governed framework, prompt and score contracts used by a release.
- `evaluation/mapping-golden-baseline.json` is a versioned, organization-authored regression baseline for deterministic thirteen-dimensional scoring. It uses synthetic public-safe evidence and does not substitute for a representative human-labelled empirical dataset.
- `releases/index.json` and revision manifests are append-only release receipts. Rollback publishes a new reviewed revision.

The JSON contract is schema version 3. Consumers must reject newer major schema versions until their migration has been tested.
