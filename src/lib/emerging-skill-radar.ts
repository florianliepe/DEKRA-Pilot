import type { Skill, SkillWorkspace } from "./skill-schema";

export type TrendHorizon = "now" | "next" | "later";
export type EmergingSkillCategory = "technical" | "functional" | "behavioral";
export type GapState = "white_spot" | "partial" | "covered";

export type TrendSignal = {
  id: string;
  title: string;
  horizon: TrendHorizon;
  summary: string;
  sourceLabel: string;
  sourceUrl: string;
  strategicFit: number;
  urgency: number;
  valueImpact: number;
  maturity: number;
  valueElements: string[];
  jobFamilies: string[];
};

export type EmergingSkillCandidate = {
  id: string;
  name: string;
  category: EmergingSkillCategory;
  definition: string;
  horizon: TrendHorizon;
  trendIds: string[];
  jobFamilies: string[];
  roleKeywords: string[];
  targetLevel: 1 | 2 | 3 | 4;
};

export const emergingSkillWeights = {
  strategicFit: 0.28,
  urgency: 0.22,
  valueImpact: 0.2,
  roleBreadth: 0.15,
  gapMagnitude: 0.15,
} as const;

export const valueChainElements = ["Mobility", "Digital trust", "Sustainability", "Inspection delivery", "Customer & market", "Enterprise enablement"];

export const jobFamilyGroups = [
  { id: "G1", label: "Group 1", families: ["Administration & Workplace Services", "Finance", "Procurement & Logistics", "Communications & Corporate Affairs", "Hospitality", "Marketing"], catalogueRoles: 285 },
  { id: "G2", label: "Group 2", families: ["Digital & Information Technology", "Human Resources", "Client Services", "Sales", "Strategy & Business Excellence"] },
  { id: "G3", label: "Group 3", families: ["Legal, Compliance & Audit", "General Management"] },
] as const;

export const trendSignals: TrendSignal[] = [
  { id: "TR-AI-ASSURANCE", title: "AI conformity assessment", horizon: "now", summary: "Assurance methods, evidence and certification schemes for trustworthy AI systems.", sourceLabel: "EU AI Act / ISO 42006", sourceUrl: "https://commission.europa.eu/topics/artificial-intelligence_en", strategicFit: 5, urgency: 5, valueImpact: 5, maturity: 4, valueElements: ["Digital trust", "Inspection delivery"], jobFamilies: ["Digital & Information Technology", "Legal, Compliance & Audit", "Client Services"] },
  { id: "TR-DPP", title: "Digital Product Passports", horizon: "next", summary: "Interoperable product identity, lifecycle evidence and regulatory data exchange.", sourceLabel: "European Commission DPP", sourceUrl: "https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en", strategicFit: 5, urgency: 4, valueImpact: 5, maturity: 3, valueElements: ["Digital trust", "Sustainability", "Inspection delivery"], jobFamilies: ["Digital & Information Technology", "Client Services", "Procurement & Logistics"] },
  { id: "TR-CRA", title: "Lifecycle product cybersecurity", horizon: "now", summary: "Cyber-resilience evidence from product design through vulnerability handling and market surveillance.", sourceLabel: "EU Cyber Resilience Act", sourceUrl: "https://digital-strategy.ec.europa.eu/en/policies/cra-summary", strategicFit: 5, urgency: 5, valueImpact: 5, maturity: 4, valueElements: ["Digital trust", "Inspection delivery"], jobFamilies: ["Digital & Information Technology", "Legal, Compliance & Audit", "Client Services"] },
  { id: "TR-SDV", title: "Software-defined vehicle assurance", horizon: "now", summary: "Cybersecurity and software-update management assurance for connected vehicles.", sourceLabel: "UNECE R155 / R156", sourceUrl: "https://unece.org/transport/documents/2021/03/standards/un-regulation-no-156-software-update-and-software-update", strategicFit: 5, urgency: 5, valueImpact: 5, maturity: 4, valueElements: ["Mobility", "Digital trust", "Inspection delivery"], jobFamilies: ["Digital & Information Technology", "Client Services"] },
  { id: "TR-EV", title: "EV battery and charging assurance", horizon: "next", summary: "Safety, performance, traceability and interoperability across batteries and charging ecosystems.", sourceLabel: "IEA Global EV Outlook 2026", sourceUrl: "https://www.iea.org/reports/global-ev-outlook-2026", strategicFit: 5, urgency: 4, valueImpact: 5, maturity: 4, valueElements: ["Mobility", "Sustainability", "Inspection delivery"], jobFamilies: ["Client Services", "Strategy & Business Excellence"] },
  { id: "TR-ADS", title: "Automated-driving scenario validation", horizon: "next", summary: "Scenario-based testing, simulation evidence and safety-case evaluation for automated vehicles.", sourceLabel: "DEKRA Digital Services", sourceUrl: "https://www.dekra.com/en/digital-services/", strategicFit: 5, urgency: 4, valueImpact: 5, maturity: 3, valueElements: ["Mobility", "Digital trust", "Inspection delivery"], jobFamilies: ["Digital & Information Technology", "Client Services"] },
  { id: "TR-H2", title: "Hydrogen lifecycle assurance", horizon: "next", summary: "Safety and conformity across production, transport, storage and use of hydrogen.", sourceLabel: "IEA Global Hydrogen Review 2025", sourceUrl: "https://www.iea.org/reports/global-hydrogen-review-2025", strategicFit: 4, urgency: 3, valueImpact: 4, maturity: 3, valueElements: ["Sustainability", "Inspection delivery"], jobFamilies: ["Client Services", "Strategy & Business Excellence"] },
  { id: "TR-REMOTE", title: "Remote and continuous inspection", horizon: "now", summary: "Remote evidence capture, assisted inspection and analytics-enabled assurance delivery.", sourceLabel: "DEKRA Remote Inspection", sourceUrl: "https://www.dekra.com/en/precise-remote-inspections-in-real-time/", strategicFit: 5, urgency: 4, valueImpact: 4, maturity: 4, valueElements: ["Inspection delivery", "Digital trust"], jobFamilies: ["Client Services", "Digital & Information Technology"] },
  { id: "TR-CLAIMS", title: "Sustainability claims assurance", horizon: "next", summary: "Evidence-based assurance of environmental, circularity and product claims.", sourceLabel: "DEKRA Sustainability Strategy", sourceUrl: "https://www.dekra.com/en/strategies-and-targets/", strategicFit: 5, urgency: 4, valueImpact: 4, maturity: 3, valueElements: ["Sustainability", "Customer & market"], jobFamilies: ["Marketing", "Communications & Corporate Affairs", "Legal, Compliance & Audit"] },
  { id: "TR-PROVENANCE", title: "Digital content provenance", horizon: "now", summary: "Authenticity, provenance and disclosure controls for AI-generated and edited media.", sourceLabel: "C2PA Technical Specification", sourceUrl: "https://spec.c2pa.org/specifications/", strategicFit: 4, urgency: 4, valueImpact: 4, maturity: 3, valueElements: ["Digital trust", "Customer & market"], jobFamilies: ["Marketing", "Communications & Corporate Affairs", "Legal, Compliance & Audit"] },
  { id: "TR-AGENTS", title: "Agentic service operations", horizon: "next", summary: "Human-controlled AI agents that orchestrate evidence, workflows and service decisions.", sourceLabel: "WEF Future of Jobs 2025", sourceUrl: "https://www.weforum.org/publications/the-future-of-jobs-report-2025/digest/", strategicFit: 5, urgency: 4, valueImpact: 5, maturity: 3, valueElements: ["Inspection delivery", "Enterprise enablement", "Customer & market"], jobFamilies: ["Digital & Information Technology", "Administration & Workplace Services", "Finance", "Human Resources"] },
  { id: "TR-THREATS", title: "AI-enabled threat and fraud defence", horizon: "now", summary: "Detection and response to scalable cyber, identity and information-integrity threats.", sourceLabel: "ENISA Threat Landscape 2026", sourceUrl: "https://www.enisa.europa.eu/publications/enisa-threat-landscape-2026", strategicFit: 5, urgency: 5, valueImpact: 4, maturity: 4, valueElements: ["Digital trust", "Enterprise enablement"], jobFamilies: ["Digital & Information Technology", "Finance", "Legal, Compliance & Audit"] },
];

export const emergingSkillCandidates: EmergingSkillCandidate[] = [
  { id: "ES-AI-CONFORMITY", name: "AI Conformity Assessment", category: "technical", definition: "Apply standards, tests and evidence criteria to evaluate whether an AI system meets defined conformity requirements.", horizon: "now", trendIds: ["TR-AI-ASSURANCE"], jobFamilies: ["Digital & Information Technology", "Legal, Compliance & Audit", "Client Services"], roleKeywords: ["ai", "audit", "compliance", "certification", "quality"], targetLevel: 3 },
  { id: "ES-AI-EVIDENCE", name: "AI Assurance Evidence Engineering", category: "technical", definition: "Design traceable evidence pipelines that connect AI risks, controls, test results and assurance conclusions.", horizon: "now", trendIds: ["TR-AI-ASSURANCE", "TR-AGENTS"], jobFamilies: ["Digital & Information Technology", "Client Services"], roleKeywords: ["data", "platform", "engineer", "quality", "product"], targetLevel: 3 },
  { id: "ES-DPP", name: "Digital Product Passport Integration", category: "technical", definition: "Implement interoperable product identity and lifecycle-data exchanges for digital product passports.", horizon: "next", trendIds: ["TR-DPP"], jobFamilies: ["Digital & Information Technology", "Client Services", "Procurement & Logistics"], roleKeywords: ["product", "supply", "data", "integration", "service"], targetLevel: 3 },
  { id: "ES-PSIRT", name: "Product Cybersecurity Conformity", category: "technical", definition: "Evaluate product cybersecurity controls, vulnerability handling and lifecycle evidence against regulatory requirements.", horizon: "now", trendIds: ["TR-CRA", "TR-THREATS"], jobFamilies: ["Digital & Information Technology", "Legal, Compliance & Audit", "Client Services"], roleKeywords: ["security", "product", "audit", "compliance", "engineer"], targetLevel: 3 },
  { id: "ES-OTA", name: "Software Update Compliance Testing", category: "technical", definition: "Test software-update governance, traceability and safe deployment evidence for regulated products and vehicles.", horizon: "now", trendIds: ["TR-SDV"], jobFamilies: ["Digital & Information Technology", "Client Services"], roleKeywords: ["software", "vehicle", "test", "engineer", "quality"], targetLevel: 3 },
  { id: "ES-BATTERY", name: "Battery Lifecycle Verification", category: "technical", definition: "Verify battery identity, safety, performance and lifecycle evidence across regulated value chains.", horizon: "next", trendIds: ["TR-EV", "TR-DPP"], jobFamilies: ["Client Services", "Strategy & Business Excellence"], roleKeywords: ["battery", "mobility", "sustainability", "product"], targetLevel: 3 },
  { id: "ES-SCENARIO", name: "Automated-Driving Scenario Validation", category: "technical", definition: "Design and evaluate scenario-based simulation and test evidence for automated-driving safety cases.", horizon: "next", trendIds: ["TR-ADS"], jobFamilies: ["Digital & Information Technology", "Client Services"], roleKeywords: ["vehicle", "simulation", "test", "engineer", "safety"], targetLevel: 3 },
  { id: "ES-H2", name: "Hydrogen Systems Safety Assessment", category: "technical", definition: "Assess hazards, controls and conformity evidence across hydrogen production, transport, storage and use.", horizon: "next", trendIds: ["TR-H2"], jobFamilies: ["Client Services", "Strategy & Business Excellence"], roleKeywords: ["safety", "energy", "engineer", "sustainability"], targetLevel: 3 },
  { id: "ES-REMOTE", name: "Remote Inspection Technology Operation", category: "technical", definition: "Operate secure remote evidence-capture and collaboration technology to support defensible inspection decisions.", horizon: "now", trendIds: ["TR-REMOTE"], jobFamilies: ["Client Services", "Digital & Information Technology"], roleKeywords: ["inspection", "service", "quality", "engineer"], targetLevel: 2 },
  { id: "ES-CONTINUOUS", name: "Continuous Assurance Analytics", category: "technical", definition: "Use monitored operational data to identify control deviations and prioritize assurance activity continuously.", horizon: "next", trendIds: ["TR-REMOTE", "TR-AGENTS"], jobFamilies: ["Digital & Information Technology", "Client Services", "Finance"], roleKeywords: ["data", "analytics", "audit", "quality", "risk"], targetLevel: 3 },
  { id: "ES-PROVENANCE", name: "Content Provenance Verification", category: "technical", definition: "Verify origin, edit history and authenticity signals for digital and AI-generated content.", horizon: "now", trendIds: ["TR-PROVENANCE", "TR-THREATS"], jobFamilies: ["Marketing", "Communications & Corporate Affairs", "Legal, Compliance & Audit"], roleKeywords: ["content", "communication", "marketing", "brand", "media"], targetLevel: 2 },
  { id: "ES-AGENT-CONTROLS", name: "Agentic Workflow Control Engineering", category: "technical", definition: "Configure bounded AI-agent workflows with permissions, observability, error contracts and human control points.", horizon: "next", trendIds: ["TR-AGENTS"], jobFamilies: ["Digital & Information Technology"], roleKeywords: ["ai", "automation", "platform", "architect", "engineer"], targetLevel: 3 },
  { id: "ES-AI-SCHEMES", name: "AI Conformity Scheme Design", category: "functional", definition: "Define assurance scope, criteria, decision rights and evidence rules for repeatable AI conformity services.", horizon: "now", trendIds: ["TR-AI-ASSURANCE"], jobFamilies: ["Client Services", "Legal, Compliance & Audit", "Strategy & Business Excellence"], roleKeywords: ["product", "service", "portfolio", "certification", "compliance"], targetLevel: 4 },
  { id: "ES-DIGITAL-TRUST", name: "Digital Trust Service Design", category: "functional", definition: "Translate emerging trust risks and regulation into scalable, evidence-led assurance services.", horizon: "now", trendIds: ["TR-AI-ASSURANCE", "TR-CRA", "TR-PROVENANCE"], jobFamilies: ["Client Services", "Strategy & Business Excellence", "Marketing"], roleKeywords: ["product", "service", "portfolio", "business", "marketing"], targetLevel: 3 },
  { id: "ES-HORIZON", name: "Regulatory Horizon Scanning", category: "functional", definition: "Identify, interpret and prioritize regulatory change for products, services and capability portfolios.", horizon: "now", trendIds: ["TR-AI-ASSURANCE", "TR-CRA", "TR-DPP"], jobFamilies: ["Legal, Compliance & Audit", "Strategy & Business Excellence", "Client Services"], roleKeywords: ["legal", "compliance", "strategy", "product", "portfolio"], targetLevel: 3 },
  { id: "ES-LIFECYCLE", name: "Lifecycle Cybersecurity Assurance", category: "functional", definition: "Coordinate product-security evidence and assurance decisions across development, operation and incident response.", horizon: "now", trendIds: ["TR-CRA", "TR-SDV", "TR-THREATS"], jobFamilies: ["Digital & Information Technology", "Legal, Compliance & Audit", "Client Services"], roleKeywords: ["security", "product", "risk", "compliance", "service"], targetLevel: 3 },
  { id: "ES-CLAIMS", name: "Sustainability Claims Assurance", category: "functional", definition: "Plan and govern evidence-based evaluation of environmental, circularity and product claims.", horizon: "next", trendIds: ["TR-CLAIMS", "TR-DPP"], jobFamilies: ["Marketing", "Communications & Corporate Affairs", "Legal, Compliance & Audit"], roleKeywords: ["sustainability", "marketing", "communication", "brand", "legal"], targetLevel: 3 },
  { id: "ES-PORTFOLIO", name: "Future Service Portfolio Sensing", category: "functional", definition: "Convert market, technology and regulatory signals into prioritized service and capability options.", horizon: "next", trendIds: ["TR-AI-ASSURANCE", "TR-DPP", "TR-H2", "TR-EV"], jobFamilies: ["Strategy & Business Excellence", "Marketing", "Client Services"], roleKeywords: ["portfolio", "product", "strategy", "marketing", "innovation"], targetLevel: 4 },
  { id: "ES-EVIDENCE-ORCH", name: "Cross-Regulatory Evidence Orchestration", category: "functional", definition: "Reuse and govern evidence across overlapping regulations, standards and assurance decisions.", horizon: "next", trendIds: ["TR-AI-ASSURANCE", "TR-CRA", "TR-DPP"], jobFamilies: ["Legal, Compliance & Audit", "Client Services", "Digital & Information Technology"], roleKeywords: ["audit", "compliance", "data", "quality", "product"], targetLevel: 3 },
  { id: "ES-TRUST-MARKETING", name: "Trust-Centred Marketing Governance", category: "functional", definition: "Govern claims, provenance and disclosure so market communication remains accurate, explainable and trusted.", horizon: "now", trendIds: ["TR-PROVENANCE", "TR-CLAIMS", "TR-THREATS"], jobFamilies: ["Marketing", "Communications & Corporate Affairs", "Legal, Compliance & Audit"], roleKeywords: ["marketing", "communication", "brand", "content", "campaign"], targetLevel: 3 },
  { id: "ES-AI-JUDGEMENT", name: "Critical AI Judgement", category: "behavioral", definition: "Challenge AI outputs, surface uncertainty and choose proportionate human intervention before acting.", horizon: "now", trendIds: ["TR-AI-ASSURANCE", "TR-AGENTS"], jobFamilies: ["General Management", "Digital & Information Technology", "Client Services"], roleKeywords: ["manager", "lead", "product", "analyst", "specialist"], targetLevel: 3 },
  { id: "ES-CALIBRATION", name: "Evidence Challenge and Calibration", category: "behavioral", definition: "Test the strength of evidence and calibrate confidence to decision risk and consequence.", horizon: "now", trendIds: ["TR-AI-ASSURANCE", "TR-REMOTE"], jobFamilies: ["Client Services", "Legal, Compliance & Audit", "Finance"], roleKeywords: ["audit", "inspection", "risk", "quality", "analyst"], targetLevel: 3 },
  { id: "ES-HUMAN-AGENT", name: "Human-Agent Orchestration", category: "behavioral", definition: "Delegate to AI agents deliberately while retaining accountability, oversight and effective exception handling.", horizon: "next", trendIds: ["TR-AGENTS"], jobFamilies: ["General Management", "Digital & Information Technology", "Administration & Workplace Services"], roleKeywords: ["manager", "lead", "owner", "coordinator", "operations"], targetLevel: 3 },
  { id: "ES-ETHICAL", name: "Ethical Technology Trade-off Resolution", category: "behavioral", definition: "Resolve competing value, safety, fairness and delivery pressures transparently in technology-enabled decisions.", horizon: "next", trendIds: ["TR-AI-ASSURANCE", "TR-THREATS"], jobFamilies: ["General Management", "Legal, Compliance & Audit", "Digital & Information Technology"], roleKeywords: ["manager", "lead", "legal", "compliance", "architect"], targetLevel: 3 },
  { id: "ES-SYSTEMS", name: "Adaptive Systems Thinking", category: "behavioral", definition: "Connect regulatory, technology, market and operating dependencies and adapt action as the system changes.", horizon: "next", trendIds: ["TR-DPP", "TR-H2", "TR-EV", "TR-AGENTS"], jobFamilies: ["Strategy & Business Excellence", "General Management", "Digital & Information Technology"], roleKeywords: ["strategy", "architect", "portfolio", "manager", "product"], targetLevel: 3 },
  { id: "ES-ECOSYSTEM", name: "Cross-Boundary Ecosystem Collaboration", category: "behavioral", definition: "Align regulators, partners, customers and internal specialists around shared assurance outcomes.", horizon: "next", trendIds: ["TR-DPP", "TR-EV", "TR-H2"], jobFamilies: ["Client Services", "Strategy & Business Excellence", "Communications & Corporate Affairs"], roleKeywords: ["partner", "stakeholder", "product", "service", "communication"], targetLevel: 3 },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: string) => new Set(normalize(value).split(" ").filter((item) => item.length > 3));

function similarity(candidate: EmergingSkillCandidate, skill: Skill) {
  const candidateName = normalize(candidate.name);
  const labels = [skill.name, ...skill.aliases].map(normalize);
  if (labels.includes(candidateName)) return 1;
  const left = tokens(`${candidate.name} ${candidate.definition}`);
  const right = tokens(`${skill.name} ${skill.description} ${skill.aliases.join(" ")}`);
  const common = [...left].filter((token) => right.has(token)).length;
  return common / Math.max(1, Math.min(left.size, right.size));
}

export type EmergingSkillAssessment = EmergingSkillCandidate & {
  score: number;
  gapState: GapState;
  match?: Pick<Skill, "id" | "name" | "status"> & { similarity: number };
  impactedRoleCount: number;
  impactedRoles: string[];
  scoreParts: { strategicFit: number; urgency: number; valueImpact: number; roleBreadth: number; gapMagnitude: number };
};

export function buildEmergingSkillAnalysis(workspace: SkillWorkspace, candidates: EmergingSkillCandidate[] = emergingSkillCandidates, signals: TrendSignal[] = trendSignals): EmergingSkillAssessment[] {
  return candidates.map((candidate) => {
    const relatedTrends = signals.filter((trend) => candidate.trendIds.includes(trend.id));
    const best = workspace.skills.map((skill) => ({ skill, similarity: similarity(candidate, skill) })).sort((a, b) => b.similarity - a.similarity)[0];
    const gapState: GapState = best?.similarity >= 0.72 ? "covered" : best?.similarity >= 0.34 ? "partial" : "white_spot";
    const impactedRoles = workspace.jobDescriptions.filter((job) => {
      const haystack = normalize(`${job.title} ${job.jobFamily} ${job.purpose} ${job.responsibilities.join(" ")} ${job.activities.join(" ")} ${job.tools.join(" ")}`);
      return candidate.jobFamilies.some((family) => normalize(family) === normalize(job.jobFamily)) || candidate.roleKeywords.some((keyword) => haystack.includes(normalize(keyword)));
    }).map((job) => job.title);
    const strategicFit = Math.max(...relatedTrends.map((trend) => trend.strategicFit), 1) * 20;
    const urgency = Math.max(...relatedTrends.map((trend) => trend.urgency), 1) * 20;
    const valueImpact = Math.max(...relatedTrends.map((trend) => trend.valueImpact), 1) * 20;
    const roleBreadth = Math.min(100, candidate.jobFamilies.length * 18 + impactedRoles.length * 8);
    const gapMagnitude = gapState === "white_spot" ? 100 : gapState === "partial" ? 55 : 10;
    const scoreParts = { strategicFit, urgency, valueImpact, roleBreadth, gapMagnitude };
    const score = Math.round(Object.entries(emergingSkillWeights).reduce((sum, [key, weight]) => sum + scoreParts[key as keyof typeof scoreParts] * weight, 0));
    return { ...candidate, score, gapState, match: best && best.similarity >= 0.34 ? { id: best.skill.id, name: best.skill.name, status: best.skill.status, similarity: best.similarity } : undefined, impactedRoleCount: impactedRoles.length, impactedRoles, scoreParts };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function trendHeat(trend: TrendSignal, element: string) {
  return trend.valueElements.includes(element) ? Math.round(((trend.strategicFit + trend.valueImpact + trend.urgency) / 15) * 100) : 0;
}
