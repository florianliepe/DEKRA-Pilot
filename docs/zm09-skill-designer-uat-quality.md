# ZM-09 — Skill Designer UAT and extraction quality

## Zielmodus instruction

Act as the end-to-end Skill Designer quality owner. Validate the live GitHub Pages application and authoritative n8n workflow with representative, synthetic job descriptions in DOCX, PPTX and XLSX formats. Preserve page, slide, sheet, block or range provenance; distinguish responsibilities, outcomes, activities, tools, qualifications, context and constraints; elicit material ambiguities before mapping; and map only to approved taxonomy skills through the controlled agent-tool registry.

Treat the expected-results workbook as a semantic oracle rather than a string-matching fixture. Equivalent wording passes when the capability boundary, evidence, exclusions, confidence and governance decision are preserved. Fail the UAT when provenance is lost, ambiguity is silently inferred, permissions are exceeded, audit evidence is missing, or an agent can approve or publish its own proposal.

For every run:

1. Record source format, content hash, extraction result, provenance coverage and latency.
2. Compare normalized evidence, elicitation questions, mapping proposals, omissions and score composition with the golden expectations.
3. Route every agent-created object to draft or pending review only.
4. Stop before approval and publication; verify those controls remain human-triggered and role-bound.
5. Remove only the exact synthetic UAT objects after verification, preserving the audit report and product fixes.

## Acceptance criteria

- DOCX, PPTX and XLSX sources are accepted and normalized locally before transfer.
- PPTX text retains explicit `Slide N` boundaries; XLSX retains sheet/range context; DOCX retains paragraph or block context.
- Clarification questions reference the actual job ambiguity and observable evidence needed for a decision.
- Mapping proposals resolve to approved skills, direct evidence references and all thirteen scoring dimensions.
- Below-threshold candidates are explained as omissions rather than forced mappings.
- Long-running agent steps show elapsed time and expected duration and fail safely after a bounded timeout.
- No agent action approves, publishes, deletes, accesses credentials or reveals licensed KFLA definitions.

## Delivery sequence

1. Baseline UAT and reproducible defect log.
2. Multi-format extraction and provenance fixes.
3. Context-specific elicitation and governed persistence fixes.
4. Mapping-quality and controlled-tool regression.
5. Live regression, targeted UAT-data cleanup and evidence-backed handover.
