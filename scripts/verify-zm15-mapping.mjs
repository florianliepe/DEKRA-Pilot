import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const workflow = JSON.parse(read("docs/n8n-skill-designer-v3.workflow.json"));
const code = workflow.nodes.map((node) => `${node.parameters?.jsCode || ""}\n${node.parameters?.options?.systemMessage || ""}`).join("\n");
const required = [
  "ZM-15 TAXONOMY-AWARE CORE PROFILE CONTRACT", "taxonomyHierarchy", "technicalCount>5", "behavioralCount>5",
  "taxonomy_hierarchy_resolver", "skill_type_classifier", "kfla_relationship_mapper", "profile_composition_validator",
  "primaryKflaCompetencyId", "taxonomyPlacement", "never pad with filler",
  "placementGroup", "MAPPING-TAXONOMY-PATH-001",
];
for (const marker of required) if (!code.includes(marker)) throw new Error(`ZM-15 workflow marker missing: ${marker}`);

const profile = read("src/lib/mapping-profile-quality.ts");
for (const marker of ["ROLE_TECHNICAL_MAX = 5", "ROLE_BEHAVIORAL_MAX = 5", "unsupportedFacetCount"]) if (!profile.includes(marker)) throw new Error(`ZM-15 profile marker missing: ${marker}`);

const workbench = read("src/components/mapping-portfolio-analytics.tsx");
for (const marker of ["Coverage matrix", "Role comparison", "Domain heatmap", "Overlap", "KFLA concentration", "Reusable clusters", "Proposed vs approved"]) if (!workbench.includes(marker)) throw new Error(`ZM-15 workbench view missing: ${marker}`);

console.log("ZM-15 verified: 5+5/10 composition, taxonomy-aware agent contract, four controlled tools and seven portfolio views.");
