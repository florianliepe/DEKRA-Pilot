"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "./icons";
import type { Lifecycle, SkillWorkspace } from "@/lib/skill-schema";

type ArchitectureNode = {
  id: string;
  name: string;
  description: string;
  kind: "factor" | "cluster" | "competency" | "domain" | "group" | "skill";
  status: Lifecycle | "reference";
};

const hiddenStatuses: Lifecycle[] = ["archived", "retired"];
const diagramId = (id: string) => `N_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
const mermaidText = (value: string) => value.replace(/["\[\]{}()<>]/g, " ").replace(/\s+/g, " ").trim();

function isVisible(status: Lifecycle | undefined, includeReview: boolean, includeDraft: boolean) {
  if (!status || hiddenStatuses.includes(status)) return false;
  return status === "approved" || (includeReview && status === "in_review") || (includeDraft && status === "draft");
}

function buildMermaid(
  workspace: SkillWorkspace,
  expandedFactors: Set<string>,
  expandedClusters: Set<string>,
  expandedDomains: Set<string>,
  expandedGroups: Set<string>,
  includeReview: boolean,
  includeDraft: boolean,
) {
  const visibleDiagramIds = new Set<string>();
  const lines = [
    "flowchart LR",
    "  accTitle: Skill architecture orientation map",
    "  accDescr: Read-only view of the KFLA orientation hierarchy and the governed domain, group and skill taxonomy.",
    "  subgraph ORIENTATION[Orientation layer - behavior context]",
    "    direction TB",
  ];
  workspace.kflaFactors.filter((factor) => isVisible(factor.status, includeReview, includeDraft)).forEach((factor) => {
    visibleDiagramIds.add(factor.id);
    lines.push(`    ${diagramId(factor.id)}["${mermaidText(factor.name)}"]`);
    if (!expandedFactors.has(factor.id)) return;
    workspace.kflaClusters.filter((cluster) => cluster.factorId === factor.id && isVisible(cluster.status, includeReview, includeDraft)).forEach((cluster) => {
      visibleDiagramIds.add(cluster.id);
      lines.push(`    ${diagramId(factor.id)} --> ${diagramId(cluster.id)}["${mermaidText(cluster.name)}"]`);
      if (!expandedClusters.has(cluster.id)) return;
      workspace.kfla.filter((competency) => competency.clusterId === cluster.id && competency.enabled).forEach((competency) => {
        visibleDiagramIds.add(competency.id);
        lines.push(`    ${diagramId(cluster.id)} --> ${diagramId(competency.id)}["${competency.number}. ${mermaidText(competency.name)}"]`);
      });
    });
  });
  lines.push("  end", "  subgraph TAXONOMY[Governed skill taxonomy]", "    direction TB");
  workspace.domains.filter((domain) => isVisible(domain.status, includeReview, includeDraft)).forEach((domain) => {
    visibleDiagramIds.add(domain.id);
    lines.push(`    ${diagramId(domain.id)}["${mermaidText(domain.name)}"]`);
    if (!expandedDomains.has(domain.id)) return;
    workspace.groups.filter((group) => group.domainId === domain.id && isVisible(group.status, includeReview, includeDraft)).forEach((group) => {
      visibleDiagramIds.add(group.id);
      lines.push(`    ${diagramId(domain.id)} --> ${diagramId(group.id)}["${mermaidText(group.name)}"]`);
      if (!expandedGroups.has(group.id)) return;
      workspace.skills.filter((skill) => skill.groupId === group.id && isVisible(skill.status, includeReview, includeDraft)).forEach((skill) => {
        visibleDiagramIds.add(skill.id);
        lines.push(`    ${diagramId(group.id)} --> ${diagramId(skill.id)}["${mermaidText(skill.name)}"]`);
        if (skill.kflaCompetencyId && visibleDiagramIds.has(skill.kflaCompetencyId)) lines.push(`    ${diagramId(skill.kflaCompetencyId)} -. behavior link .-> ${diagramId(skill.id)}`);
      });
    });
  });
  lines.push("  end");
  workspace.relationships.filter((edge) => edge.status === "approved").forEach((edge) => {
    if (visibleDiagramIds.has(edge.sourceId) && visibleDiagramIds.has(edge.targetId)) lines.push(`  ${diagramId(edge.sourceId)} -. ${mermaidText(edge.type)} .-> ${diagramId(edge.targetId)}`);
  });
  lines.push(
    "  classDef factor fill:#173f2d,color:#fff,stroke:#173f2d,stroke-width:2px",
    "  classDef taxonomy fill:#eef6f0,color:#173f2d,stroke:#4e9d69",
    `  class ${workspace.kflaFactors.map((item) => diagramId(item.id)).join(",")} factor`,
    `  class ${workspace.domains.map((item) => diagramId(item.id)).join(",")} taxonomy`,
  );
  return lines.join("\n");
}

function MermaidDiagram({ source }: { source: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", deterministicIds: true, deterministicIDSeed: "dekra-zm14", flowchart: { useMaxWidth: true, curve: "basis" }, themeVariables: { fontFamily: "Arial, sans-serif", primaryColor: "#eef6f0", primaryTextColor: "#173f2d", primaryBorderColor: "#4e9d69", lineColor: "#769080", clusterBkg: "#fafcf9", clusterBorder: "#cad8ce" } });
        const rendered = await mermaid.render(`skill-architecture-${Date.now()}`, source);
        if (!active || !target.current) return;
        target.current.innerHTML = rendered.svg;
        setError("");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "The diagram could not be rendered.");
      }
    };
    void render();
    return () => { active = false; };
  }, [source]);

  return <div className="architecture-mermaid" aria-live="polite">{error ? <div className="error-banner">{error}</div> : <div ref={target}/>}</div>;
}

export function SkillArchitectureMap({ workspace, onOpenTaxonomy }: { workspace: SkillWorkspace; onOpenTaxonomy: () => void }) {
  const [includeReview, setIncludeReview] = useState(false);
  const [includeDraft, setIncludeDraft] = useState(false);
  const [expandedFactors, setExpandedFactors] = useState<Set<string>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string>(workspace.kflaFactors[0]?.id || workspace.domains[0]?.id || "");
  const [copied, setCopied] = useState(false);

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => setter((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const expandAll = () => {
    setExpandedFactors(new Set(workspace.kflaFactors.map((item) => item.id)));
    setExpandedClusters(new Set(workspace.kflaClusters.map((item) => item.id)));
    setExpandedDomains(new Set(workspace.domains.map((item) => item.id)));
    setExpandedGroups(new Set(workspace.groups.map((item) => item.id)));
  };
  const collapseAll = () => { setExpandedFactors(new Set()); setExpandedClusters(new Set()); setExpandedDomains(new Set()); setExpandedGroups(new Set()); };
  const source = useMemo(() => buildMermaid(workspace, expandedFactors, expandedClusters, expandedDomains, expandedGroups, includeReview, includeDraft), [workspace, expandedFactors, expandedClusters, expandedDomains, expandedGroups, includeReview, includeDraft]);
  const nodes = useMemo<ArchitectureNode[]>(() => [
    ...workspace.kflaFactors.map((item) => ({ ...item, kind: "factor" as const })),
    ...workspace.kflaClusters.map((item) => ({ ...item, kind: "cluster" as const })),
    ...workspace.kfla.map((item) => ({ id: item.id, name: item.name, description: item.publicSummary, kind: "competency" as const, status: "reference" as const })),
    ...workspace.domains.map((item) => ({ ...item, kind: "domain" as const })),
    ...workspace.groups.map((item) => ({ ...item, kind: "group" as const })),
    ...workspace.skills.map((item) => ({ ...item, kind: "skill" as const })),
  ], [workspace]);
  const selected = nodes.find((item) => item.id === selectedId) || nodes[0];
  const selectedSkill = selected?.kind === "skill" ? workspace.skills.find((item) => item.id === selected.id) : undefined;
  const selectedCompetency = selected?.kind === "competency" ? workspace.kfla.find((item) => item.id === selected.id) : selectedSkill?.kflaCompetencyId ? workspace.kfla.find((item) => item.id === selectedSkill.kflaCompetencyId) : undefined;
  const linkedSkills = selectedCompetency ? workspace.skills.filter((skill) => skill.kflaCompetencyId === selectedCompetency.id && isVisible(skill.status, includeReview, includeDraft)) : [];
  const linkedMappings = selectedSkill ? workspace.mappings.filter((mapping) => mapping.skillId === selectedSkill.id) : linkedSkills.flatMap((skill) => workspace.mappings.filter((mapping) => mapping.skillId === skill.id));

  const copySource = async () => { await navigator.clipboard.writeText(source); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
  const downloadSource = () => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([source], { type: "text/plain;charset=utf-8" })); link.download = "dekra-skill-architecture.mmd"; link.click(); URL.revokeObjectURL(link.href); };

  return <div className="architecture-page">
    <section className="panel architecture-hero">
      <div><span className="section-kicker">ZM-14 · SKILL ARCHITECTURE ORIENTATION</span><h2>Understand the model before changing it.</h2><p>The behavioral orientation and governed skill taxonomy are separate structures. Expand either side to see how competency context supports—not replaces—domain, group and skill placement.</p></div>
      <div className="architecture-method"><span><b>1</b>Orient behavior</span><i/><span><b>2</b>Place capability</span><i/><span><b>3</b>Trace evidence</span></div>
    </section>
    <section className="panel architecture-toolbar" aria-label="Architecture map controls">
      <div><button className="button secondary" onClick={expandAll}>Expand all</button><button className="button ghost" onClick={collapseAll}>Reset view</button></div>
      <div className="architecture-status-filters"><span>Visible lifecycle</span><label><input type="checkbox" checked readOnly/>Approved</label><label><input type="checkbox" checked={includeReview} onChange={(event) => setIncludeReview(event.target.checked)}/>In review</label><label><input type="checkbox" checked={includeDraft} onChange={(event) => setIncludeDraft(event.target.checked)}/>Draft</label></div>
      <button className="button secondary" onClick={onOpenTaxonomy}>Open taxonomy workbench <Icons.arrow/></button>
    </section>
    <div className="architecture-layers">
      <section className="panel architecture-layer" aria-labelledby="orientation-heading"><header><div><span className="architecture-level">REFERENCE</span><h3 id="orientation-heading">Behavioral orientation</h3><p>4 factors → 12 navigation clusters → 38 competency references</p></div><span className="architecture-layer-tag">Context, not taxonomy</span></header>
        <div className="architecture-factor-grid">{workspace.kflaFactors.filter((item) => isVisible(item.status, includeReview, includeDraft)).map((factor) => {
          const open = expandedFactors.has(factor.id); const clusters = workspace.kflaClusters.filter((item) => item.factorId === factor.id && isVisible(item.status, includeReview, includeDraft));
          return <article key={factor.id} className={`architecture-branch factor-${factor.name.toLowerCase()}`}><button className="architecture-node root" aria-expanded={open} aria-controls={`branch-${factor.id}`} data-description={factor.description} onClick={() => { toggle(setExpandedFactors, factor.id); setSelectedId(factor.id); }}><span><b>{factor.name}</b><small>{clusters.length} clusters · {workspace.kfla.filter((item) => item.factorId === factor.id).length} competencies</small></span><Icons.chevron/></button>{open && <div id={`branch-${factor.id}`} className="architecture-children">{clusters.map((cluster) => { const clusterOpen = expandedClusters.has(cluster.id); const competencies = workspace.kfla.filter((item) => item.clusterId === cluster.id && item.enabled); return <div key={cluster.id}><button className="architecture-node" aria-expanded={clusterOpen} aria-controls={`branch-${cluster.id}`} data-description={cluster.description} onClick={() => { toggle(setExpandedClusters, cluster.id); setSelectedId(cluster.id); }}><span><b>{cluster.name}</b><small>{competencies.length} competencies</small></span><Icons.chevron/></button>{clusterOpen && <div id={`branch-${cluster.id}`} className="architecture-leaves">{competencies.map((competency) => <button key={competency.id} className={selectedId === competency.id ? "selected" : ""} data-description={competency.publicSummary} onClick={() => setSelectedId(competency.id)}><b>{String(competency.number).padStart(2, "0")}</b><span>{competency.name}</span></button>)}</div>}</div>; })}</div>}</article>;
        })}</div>
      </section>
      <section className="panel architecture-layer" aria-labelledby="taxonomy-heading"><header><div><span className="architecture-level">GOVERNED</span><h3 id="taxonomy-heading">Skill taxonomy</h3><p>L1 domains → L2 groups → L3 atomic skills</p></div><span className="architecture-layer-tag governed">Approval controlled</span></header>
        <div className="architecture-domain-list">{workspace.domains.filter((item) => isVisible(item.status, includeReview, includeDraft)).map((domain) => { const open = expandedDomains.has(domain.id); const groups = workspace.groups.filter((item) => item.domainId === domain.id && isVisible(item.status, includeReview, includeDraft)); return <article key={domain.id} className="architecture-branch"><button className="architecture-node root" aria-expanded={open} aria-controls={`branch-${domain.id}`} data-description={domain.description} onClick={() => { toggle(setExpandedDomains, domain.id); setSelectedId(domain.id); }}><span><b>{domain.name}</b><small>{groups.length} groups</small></span><Icons.chevron/></button>{open && <div id={`branch-${domain.id}`} className="architecture-children">{groups.map((group) => { const groupOpen = expandedGroups.has(group.id); const skills = workspace.skills.filter((item) => item.groupId === group.id && isVisible(item.status, includeReview, includeDraft)); return <div key={group.id}><button className="architecture-node" aria-expanded={groupOpen} aria-controls={`branch-${group.id}`} data-description={group.description} onClick={() => { toggle(setExpandedGroups, group.id); setSelectedId(group.id); }}><span><b>{group.name}</b><small>{skills.length} skills</small></span><Icons.chevron/></button>{groupOpen && <div id={`branch-${group.id}`} className="architecture-leaves skills">{skills.map((skill) => <button key={skill.id} className={selectedId === skill.id ? "selected" : ""} data-description={skill.description} onClick={() => setSelectedId(skill.id)}><span><b>{skill.name}</b><small>{skill.dimension} · {skill.status}</small></span></button>)}</div>}</div>; })}</div>}</article>; })}</div>
      </section>
    </div>
    <div className="architecture-map-grid">
      <section className="panel architecture-diagram"><header><div><span className="section-kicker">GENERATED MERMAID VIEW</span><h3>Current unfolded architecture</h3><p>The diagram mirrors only the branches and lifecycle states selected above.</p></div><div><button className="button ghost" onClick={() => void copySource()}><Icons.copy/>{copied ? "Copied" : "Copy Mermaid"}</button><button className="button secondary" onClick={downloadSource}><Icons.document/>Download .mmd</button></div></header><MermaidDiagram source={source}/></section>
      <aside className="panel architecture-inspector">{selected ? <><span className="section-kicker">SELECTED {selected.kind.toUpperCase()}</span><h3>{selected.name}</h3><p>{selected.description}</p><dl><div><dt>Identity</dt><dd>{selected.id}</dd></div><div><dt>Lifecycle</dt><dd>{selected.status}</dd></div>{selectedCompetency && <div><dt>Orientation</dt><dd>{selectedCompetency.factor} · {workspace.kflaClusters.find((item) => item.id === selectedCompetency.clusterId)?.name}</dd></div>}<div><dt>Mapped jobs</dt><dd>{new Set(linkedMappings.map((item) => item.jobDescriptionId)).size}</dd></div></dl>{selectedCompetency && <><h4>Linked governed skills</h4>{linkedSkills.length ? linkedSkills.map((skill) => <button key={skill.id} className="architecture-link" onClick={() => setSelectedId(skill.id)}><b>{skill.name}</b><small>{skill.status}</small></button>) : <p className="architecture-empty">No visible skill uses this competency reference yet.</p>}</>}{selectedSkill && <><h4>Skill relationships</h4>{workspace.relationships.filter((item) => item.sourceId === selectedSkill.id || item.targetId === selectedSkill.id).map((edge) => <button key={edge.id} className="architecture-link" onClick={() => setSelectedId(edge.sourceId === selectedSkill.id ? edge.targetId : edge.sourceId)}><b>{edge.type}</b><small>{nodes.find((item) => item.id === (edge.sourceId === selectedSkill.id ? edge.targetId : edge.sourceId))?.name}</small></button>)}</>}<button className="button primary architecture-edit-link" onClick={onOpenTaxonomy}>Inspect in governed workbench</button></> : <p>Select a node to inspect its context.</p>}</aside>
    </div>
    <section className="panel architecture-legend"><div><b>How to read this page</b><p>Solid arrows express hierarchy. Dotted “behavior link” arrows associate a skill with a competency context. They do not make the competency a taxonomy parent.</p></div><div><b>Hover or focus</b><p>Preview a definition. Click to pin the node and inspect its identifiers, lifecycle, job mappings and governed relationships.</p></div><div><b>Governance boundary</b><p>This page is read-only. Creation, movement, replacement and relationship changes remain in the Taxonomy workbench and review queue.</p></div></section>
  </div>;
}
