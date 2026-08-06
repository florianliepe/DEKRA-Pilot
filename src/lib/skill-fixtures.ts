import type { KflaCompetency, SkillWorkspace } from "./skill-schema";

const factors: Record<KflaCompetency["factor"], number[]> = {
  Thought: [5, 8, 12, 17, 18, 19, 33, 35],
  Results: [1, 2, 11, 15, 25, 27, 28, 32, 38],
  People: [4, 6, 7, 9, 13, 14, 16, 20, 21, 23, 24, 34, 36, 37],
  Self: [3, 10, 22, 26, 29, 30, 31],
};
const names = [
  "Action Oriented", "Ensures Accountability", "Manages Ambiguity", "Attracts Top Talent", "Business Insight",
  "Collaborates", "Communicates Effectively", "Manages Complexity", "Manages Conflict", "Courage",
  "Customer Focus", "Decision Quality", "Develops Talent", "Values Differences", "Directs Work",
  "Drives Engagement", "Financial Acumen", "Global Perspective", "Cultivates Innovation", "Interpersonal Savvy",
  "Builds Networks", "Nimble Learning", "Organizational Savvy", "Persuades", "Plans and Aligns",
  "Being Resilient", "Resourcefulness", "Drives Results", "Demonstrates Self-Awareness", "Self-Development",
  "Situational Adaptability", "Balances Stakeholders", "Strategic Mindset", "Builds Effective Teams", "Tech Savvy",
  "Instills Trust", "Drives Vision and Purpose", "Optimizes Work Processes",
];

export const publicKflaCompetencies: KflaCompetency[] = names.map((name, index) => {
  const number = index + 1;
  const factor = (Object.entries(factors).find(([, values]) => values.includes(number))?.[0] || "Thought") as KflaCompetency["factor"];
  return { id: `KFLA-${String(number).padStart(2, "0")}`, number, name, factor, enabled: true, definition: "", source: "public-name" };
});

export const bootstrapSkillWorkspace: SkillWorkspace = {
  schemaVersion: 2,
  revision: 1,
  updatedAt: "2026-08-06T10:00:00.000Z",
  domains: [
    { id: "DOM-DT", name: "Digital & Technology", description: "Digital products, data and technology capabilities.", status: "approved" },
    { id: "DOM-PC", name: "People & Culture", description: "Organisation, talent and people leadership capabilities.", status: "approved" },
  ],
  groups: [
    { id: "GRP-DA", domainId: "DOM-DT", name: "Data & Analytics", description: "Data products, insight and decision support.", status: "approved" },
    { id: "GRP-SBO", domainId: "DOM-PC", name: "Skill-based Organisation", description: "Skill architecture, governance and workforce activation.", status: "approved" },
  ],
  skills: [
    { id: "SK-DV", name: "Data Visualization", description: "Transforms data into clear visual narratives that support decisions.", groupId: "GRP-DA", dimension: "technical", aliases: ["Dashboard Design"], evidence: ["Global Reporting Analyst JD"], confidence: 92, observability: "Builds decision-ready dashboards and explains the underlying signal.", futureRelevance: "core", status: "approved", syntax: { action: "Visualise", object: "business data", outcome: "to enable decision-making" }, externalRefs: [{ framework: "ESCO", id: "optional", label: "External mapping candidate" }] },
    { id: "SK-ST", name: "Skill Taxonomy Design", description: "Designs coherent, governed and usable enterprise skill structures.", groupId: "GRP-SBO", dimension: "technical", aliases: ["Skill Architecture"], evidence: ["SBO design workshop"], confidence: 88, observability: "Defines MECE taxonomy nodes and resolves overlaps using evidence.", futureRelevance: "core", status: "in_review", syntax: { action: "Design", object: "skill taxonomies", outcome: "to create a reusable capability language" } },
    { id: "SK-MC", name: "Managing Complexity", description: "Makes sense of complex, high-volume and sometimes contradictory information.", groupId: "GRP-SBO", dimension: "competency", kflaCompetencyId: "KFLA-08", aliases: [], evidence: ["Programme Lead interview"], confidence: 83, observability: "Frames ambiguity, identifies patterns and selects a viable course of action.", futureRelevance: "core", status: "approved", syntax: { action: "Resolve", object: "complex information", outcome: "to select a viable course of action" } },
    { id: "SK-CU", name: "Curiosity", description: "Inclination to explore unfamiliar perspectives and test assumptions.", groupId: "GRP-SBO", dimension: "trait", aliases: [], evidence: ["SME calibration"], confidence: 71, observability: "Asks targeted questions and seeks disconfirming evidence.", futureRelevance: "emerging", status: "draft", syntax: { action: "Explore", object: "unfamiliar perspectives", outcome: "to test assumptions" } },
  ],
  profiles: [{
    id: "ROLE-DATA", title: "Global Reporting Analyst", jobFamily: "Data & Analytics", purpose: "Turn operational data into trusted management insight.", status: "in_review",
    skills: [
      { skillId: "SK-DV", targetLevel: 3, weight: 30, critical: true },
      { skillId: "SK-MC", targetLevel: 2, weight: 20, critical: true },
      { skillId: "SK-ST", targetLevel: 1, weight: 10, critical: false },
      { skillId: "SK-CU", targetLevel: 2, weight: 10, critical: false },
    ],
  }],
  interviews: [{ id: "INT-001", roleTitle: "Global Reporting Analyst", stakeholder: "Manager", interviewee: "Analytics Lead", status: "in_progress", currentQuestion: 3, responses: [] }],
  reviewQueue: [
    { id: "REV-001", title: "Skill Taxonomy Design", type: "new_skill", summary: "Agent normalized three task statements into one durable capability.", confidence: 88, evidence: "SBO design workshop · 3 excerpts", status: "pending" },
    { id: "REV-002", title: "Dashboard Design → Data Visualization", type: "duplicate", summary: "Alias candidate detected against an approved skill.", confidence: 94, evidence: "Global Reporting Analyst JD · line 18", status: "pending" },
  ],
  kfla: publicKflaCompetencies,
  jobDescriptions: [{
    id: "JD-DATA", title: "Global Reporting Analyst", jobFamily: "Data & Analytics", country: "Global", language: "English",
    purpose: "Turn operational and financial data into trusted management insight.",
    sourceText: "Build interactive dashboards to report weekly revenue metrics. Analyse performance drivers and explain material movements to senior stakeholders. Maintain reporting definitions and improve data quality.",
    responsibilities: ["Build interactive dashboards for weekly revenue reporting.", "Analyse performance drivers and material movements.", "Maintain reporting definitions and improve data quality."],
    outcomes: ["Decision-ready management insight", "Consistent reporting definitions", "Improved data quality"], status: "mapped", version: 1, updatedAt: "2026-08-06T10:00:00.000Z",
  }],
  mappings: [
    { id: "MAP-DV", jobDescriptionId: "JD-DATA", skillId: "SK-DV", targetLevel: 3, weight: 35, critical: true, relevance: 96, rationale: "Dashboard creation and executive reporting require advanced visualisation capability.", evidence: ["Build interactive dashboards to report weekly revenue metrics."], strategicVectorIds: ["VEC-AI"], source: "agent", status: "approved" },
    { id: "MAP-MC", jobDescriptionId: "JD-DATA", skillId: "SK-MC", targetLevel: 2, weight: 20, critical: true, relevance: 84, rationale: "Explaining material performance movements requires structuring complex information.", evidence: ["Analyse performance drivers and explain material movements."], strategicVectorIds: ["VEC-LEAD"], source: "agent", status: "proposed" },
  ],
  strategicVectors: [
    { id: "VEC-AI", name: "AI & Data", description: "Use trustworthy data and AI to improve decisions, services and productivity.", horizon: "2026–2029", priority: "accelerate", skillIds: ["SK-DV"], status: "approved" },
    { id: "VEC-DIG", name: "Digitalisation", description: "Digitise journeys and operations through scalable products and platforms.", horizon: "2026–2029", priority: "accelerate", skillIds: [], status: "draft" },
    { id: "VEC-CUST", name: "Customer", description: "Translate customer and market insight into differentiated value.", horizon: "2026–2029", priority: "differentiate", skillIds: [], status: "draft" },
    { id: "VEC-OPS", name: "Operational Excellence", description: "Improve quality, flow, reliability and cost through disciplined systems.", horizon: "2026–2029", priority: "foundational", skillIds: [], status: "approved" },
    { id: "VEC-SUS", name: "Sustainability", description: "Embed environmental and social outcomes into business decisions.", horizon: "2026–2029", priority: "differentiate", skillIds: [], status: "draft" },
    { id: "VEC-LEAD", name: "Leadership", description: "Mobilise people through clarity, trust, learning and accountable delivery.", horizon: "2026–2029", priority: "foundational", skillIds: ["SK-MC"], status: "approved" },
  ],
  agentRuns: [{ id: "RUN-001", mode: "job_mapping", status: "needs_review", jobDescriptionId: "JD-DATA", startedAt: "2026-08-06T09:58:00.000Z", completedAt: "2026-08-06T10:00:00.000Z", model: "claude-sonnet-5", tools: ["read_catalog", "find_duplicates", "map_job_skills", "propose_profile"], trace: [{ step: "Evidence audit", result: "3 responsibility statements retained" }, { step: "Taxonomy match", result: "2 approved skills matched; 1 proposal requires review" }] }],
};
