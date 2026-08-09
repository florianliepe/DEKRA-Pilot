# ZM-02 — Governed taxonomy CRUD and graph experience

## Target outcome

Taxonomy stewards and job architects can create, inspect, relate, move, duplicate,
deprecate, replace, merge, archive and restore governed taxonomy concepts without
editing JSON. Every material structural change is preceded by dependency impact,
retains a named actor and reason, and either remains a draft or enters accountable
human review. The graph makes hierarchy, relationships, overlap signals and
replacement lineage understandable before a decision is made.

## Delivery scope

1. **Canonical hierarchy CRUD**
   - Govern L1 domains, L2 groups and L3 skills through stable IDs.
   - Keep definition edits and structural operations non-mutating until reviewed.
   - Support duplicate, move, deprecate, replace, merge, archive and restore.
   - Protect approved concepts from silent browser-side mutation.

2. **Relationship and synonym CRUD**
   - Create and edit broader, narrower, related, prerequisite, replacement and
     synonym edges.
   - Prevent self-links, unresolved endpoints and duplicate active edges.
   - Version lifecycle actions and retain archived edges in history.

3. **Graph and overlap experience**
   - Filter the graph by concept type, relationship type, ID, name or definition.
   - Select a concept and inspect mappings, profiles, relationships and total
     dependency impact.
   - Highlight connected concepts and traverse direct edges.
   - Calculate deterministic overlap signals from names, descriptions and aliases.
   - Route suspected synonyms into the governed relationship editor; never merge
     automatically.

4. **Change impact and lineage**
   - Preview affected groups, skills, mappings, profiles, jobs, tools and graph
     edges before structural changes.
   - Preserve replacement and merge lineage in object versions and audit events.
   - Expose immutable object-version comparison in the governance workbench.

5. **Persistence and release boundary**
   - Persist working-state drafts through the authenticated n8n skill workflow.
   - Apply optimistic concurrency and idempotency to state-changing saves.
   - Allow only accepted, validated records into the next GitHub-approved snapshot.
   - Keep rejected, deferred and superseded records outside public approved data.

6. **Security and licensing**
   - Keep credentials and privileged n8n/GitHub operations outside the browser.
   - Exclude licensed definitions and protected references from public bundles.
   - Treat overlap analysis as a deterministic advisory signal, not an AI decision.

## Acceptance criteria

- A taxonomy steward can complete hierarchy and relationship CRUD without JSON.
- Structural operations show dependency impact before submission.
- Approved concepts cannot be silently rewritten by edits or lifecycle actions.
- The graph supports search, type filters, connection traversal and concept impact.
- Suspected overlap can be reviewed as a synonym draft without an automatic merge.
- Every governed action records an accountable actor, reason and object version.
- Working changes persist through n8n and survive reload.
- Concurrent or repeated saves cannot overwrite a newer working revision.
- Governance, agent-policy, mapping evaluation, lint, type-check, end-to-end tests,
  production build and public-bundle credential scan pass.
- Main and GitHub Pages serve the verified implementation.

## Explicit non-goals

- AI cannot approve, merge or publish taxonomy concepts.
- Licensed KFLA definitions are not administered in the public application.
- Graph layout does not replace the canonical JSON model; it is a governed view of it.
