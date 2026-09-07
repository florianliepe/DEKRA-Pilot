# ZM-15 — Taxonomy-aware mapping and portfolio assurance

## Target outcome

Convert governed job evidence into a compact role profile containing only evidence-backed core capabilities:

- up to five technical skills;
- up to five behavioral competencies;
- no more than ten mappings in total;
- fewer than ten when the evidence does not support more;
- experiences, traits, drivers, tools, tasks and qualifications retained as context rather than counted as core skills.

Every mapping remains a draft until accountable review. The agent cannot approve or publish.

## Mapping model

```text
Job source
  → normalized responsibility/outcome evidence
  → approved L3 candidate retrieval
  → technical-skill / behavioral-competency classification
  → thirteen-part evidence and compatibility score
  → L3 skill → inherited L2 group → inherited L1 domain
  → behavioral competency → primary KFLA competency → cluster → factor
  → 5 + 5 / 10 composition and evidence-coverage gate
  → human review
```

The canonical taxonomy is a mono-hierarchy: one approved L3 skill has one L2 group and that group has one L1 domain. Synonyms, related concepts, tools and KFLA associations are relationships, not additional hierarchy parents.

## Controlled n8n mapping tools

ZM-15 adds only the four capabilities missing from the existing governed mapping chain:

1. `taxonomy_hierarchy_resolver` resolves an approved L3 skill to L2 and L1.
2. `skill_type_classifier` returns technical or behavioral classification with evidence and ambiguity.
3. `kfla_relationship_mapper` proposes one primary and optional secondary public-metadata KFLA relationships for behavioral competencies.
4. `profile_composition_validator` enforces the 5 + 5 / 10 policy without filler.

They inherit the existing least-privilege controls: allowlisted operations, schema validation, data-classification boundaries, rate limits, opaque result references and audit receipts. Licensed definitions remain outside the public workflow payload.

## Portfolio workbench

The Jobs & mapping workbench provides seven linked views:

- job-to-skill coverage matrix;
- role comparison for profile boundaries and MECE review;
- L1 domain heatmap;
- overlapping and redundant skill list;
- KFLA factor concentration and gaps;
- cross-role reusable skill clusters;
- working proposal versus approved release comparison.

The profile gate separately displays technical and behavioral counts and calls its range an operational uncertainty range, not a statistical confidence interval.

## Acceptance criteria

- A profile with six technical skills is blocked.
- A profile with six behavioral competencies is blocked.
- A profile with more than ten total mappings is blocked.
- A profile with an experience, trait or driver in its core mappings is blocked.
- A profile with fewer than ten evidence-backed mappings is allowed when all material evidence has a primary owner, mappings are unique and weights total 100%.
- An approved L3 mapping resolves to a valid group and domain.
- A technical mapping carries no KFLA relationship.
- A behavioral mapping identifies a primary KFLA relationship or exposes a reviewable KFLA gap.
- New-skill proposals include governed taxonomy placement or remain explicitly unplaced and blocking.
- All seven portfolio views work from the same workspace and approved-release baseline.
- No agent output crosses the approval or publication boundary.

## Source-informed design decisions

Korn Ferry publicly describes competencies, experiences, traits and drivers as distinct talent dimensions. Therefore ZM-15 keeps experiences, traits and drivers outside the core skill count and uses KFLA only as a behavioral reference. ESCO’s downloadable model uses a mono-hierarchy for skill placement and separate relationship datasets; ZM-15 applies the same structural principle to preserve stable taxonomy meaning.

- Korn Ferry: https://ir.kornferry.com/news-events/press-releases/detail/557/korn-ferry-launches-new-big-data-talent-analytics-engine-to-help-organizations-select-top-leaders-and-assess-overall-talent-performance
- ESCO skills pillar: https://esco.ec.europa.eu/en/classification/skill-main
- ESCO dataset structure: https://esco.ec.europa.eu/en/structure-esco-downloadable-datasets

## UAT outcome

The disposable live UAT used the deployed asynchronous n8n path and stopped at `needs_review`. It returned six evidence-backed mappings: three technical skills and three behavioral competencies, with 100% total weight, valid L3 → L2 → L1 paths and valid KFLA contracts. The test restored its baseline working state and did not approve or publish anything.

An earlier pass exposed a fail-open condition: a proposed taxonomy gap could reach review without governed domain/group placement. The strict agent response schema and governance gate now reject that state, require a valid approved placement plus rationale, and expose the failure for correction. Local type-check, lint, production build, governance verification, policy verification, mapping evaluation, focused UI regression and the live workflow UAT all pass after the fix.
