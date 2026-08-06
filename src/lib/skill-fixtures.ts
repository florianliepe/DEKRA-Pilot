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
  schemaVersion: 1,
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
    { id: "SK-DV", name: "Data Visualization", description: "Transforms data into clear visual narratives that support decisions.", groupId: "GRP-DA", dimension: "technical", aliases: ["Dashboard Design"], evidence: ["Global Reporting Analyst JD"], confidence: 92, observability: "Builds decision-ready dashboards and explains the underlying signal.", futureRelevance: "core", status: "approved" },
    { id: "SK-ST", name: "Skill Taxonomy Design", description: "Designs coherent, governed and usable enterprise skill structures.", groupId: "GRP-SBO", dimension: "technical", aliases: ["Skill Architecture"], evidence: ["SBO design workshop"], confidence: 88, observability: "Defines MECE taxonomy nodes and resolves overlaps using evidence.", futureRelevance: "core", status: "in_review" },
    { id: "SK-MC", name: "Managing Complexity", description: "Makes sense of complex, high-volume and sometimes contradictory information.", groupId: "GRP-SBO", dimension: "competency", kflaCompetencyId: "KFLA-08", aliases: [], evidence: ["Programme Lead interview"], confidence: 83, observability: "Frames ambiguity, identifies patterns and selects a viable course of action.", futureRelevance: "core", status: "approved" },
    { id: "SK-CU", name: "Curiosity", description: "Inclination to explore unfamiliar perspectives and test assumptions.", groupId: "GRP-SBO", dimension: "trait", aliases: [], evidence: ["SME calibration"], confidence: 71, observability: "Asks targeted questions and seeks disconfirming evidence.", futureRelevance: "emerging", status: "draft" },
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
};
