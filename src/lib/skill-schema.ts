export const proficiencyLevels = [
  { id: 1, name: "Awareness", description: "Understands the concept and works with direct guidance." },
  { id: 2, name: "Application", description: "Performs standard work independently in routine situations." },
  { id: 3, name: "Mastery", description: "Solves complex, non-routine problems and coaches others." },
  { id: 4, name: "Strategic / Expert", description: "Shapes strategy and pioneers new methods." },
] as const;

export type SkillDimension = "technical" | "competency" | "experience" | "trait" | "driver";
export type Lifecycle = "draft" | "in_review" | "approved" | "retired";

export type TaxonomyNode = { id: string; name: string; description: string; status: Lifecycle };
export type KflaCompetency = {
  id: string;
  number: number;
  name: string;
  factor: "Thought" | "Results" | "People" | "Self";
  enabled: boolean;
  definition: string;
  source: "public-name" | "licensed" | "custom";
};
export type Skill = {
  id: string;
  name: string;
  description: string;
  groupId: string;
  dimension: SkillDimension;
  kflaCompetencyId?: string;
  aliases: string[];
  evidence: string[];
  confidence: number;
  observability: string;
  futureRelevance: "core" | "emerging" | "legacy";
  status: Lifecycle;
  syntax?: { action: string; object: string; outcome?: string; context?: string };
  externalRefs?: Array<{ framework: "ESCO" | "ONET" | "KornFerry" | "custom"; id: string; label: string }>;
};
export type ProfileSkill = { skillId: string; targetLevel: 1 | 2 | 3 | 4; weight: number; critical: boolean };
export type RoleProfile = { id: string; title: string; jobFamily: string; purpose: string; status: Lifecycle; skills: ProfileSkill[]; jobDescriptionId?: string; strategicVectorIds?: string[] };
export type JobDescription = {
  id: string;
  title: string;
  jobFamily: string;
  country: string;
  language: string;
  purpose: string;
  sourceText: string;
  responsibilities: string[];
  outcomes: string[];
  status: "draft" | "analysed" | "mapped" | "approved";
  version: number;
  updatedAt: string;
};
export type JobSkillMapping = {
  id: string;
  jobDescriptionId: string;
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4;
  weight: number;
  critical: boolean;
  relevance: number;
  rationale: string;
  evidence: string[];
  strategicVectorIds: string[];
  source: "agent" | "manual";
  status: "proposed" | "approved" | "rejected";
};
export type StrategicVector = {
  id: string;
  name: string;
  description: string;
  horizon: string;
  priority: "foundational" | "accelerate" | "differentiate";
  skillIds: string[];
  status: Lifecycle;
};
export type AgentRun = {
  id: string;
  mode: "ingest" | "interview" | "job_mapping" | "regression";
  status: "running" | "completed" | "needs_review" | "failed";
  jobDescriptionId?: string;
  startedAt: string;
  completedAt?: string;
  model: string;
  tools: string[];
  trace: Array<{ step: string; result: string }>;
};
export type Interview = {
  id: string;
  roleTitle: string;
  stakeholder: "Incumbent" | "Manager" | "SME" | "HR";
  interviewee: string;
  status: "not_started" | "in_progress" | "complete";
  currentQuestion: number;
  responses: Array<{ question: string; answer: string }>;
};
export type ReviewItem = {
  id: string;
  title: string;
  type: "new_skill" | "duplicate" | "mapping" | "profile";
  summary: string;
  confidence: number;
  evidence: string;
  status: "pending" | "accepted" | "rejected";
  entityId?: string;
  payload?: Record<string, unknown>;
};
export type SkillWorkspace = {
  schemaVersion: 2;
  revision: number;
  updatedAt: string;
  domains: TaxonomyNode[];
  groups: Array<TaxonomyNode & { domainId: string }>;
  skills: Skill[];
  profiles: RoleProfile[];
  interviews: Interview[];
  reviewQueue: ReviewItem[];
  kfla: KflaCompetency[];
  jobDescriptions: JobDescription[];
  mappings: JobSkillMapping[];
  strategicVectors: StrategicVector[];
  agentRuns: AgentRun[];
};

export function migrateSkillWorkspace(value: unknown, fallback: SkillWorkspace): SkillWorkspace {
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<SkillWorkspace> & { schemaVersion?: number };
  return {
    ...fallback,
    ...source,
    schemaVersion: 2,
    domains: Array.isArray(source.domains) ? source.domains : fallback.domains,
    groups: Array.isArray(source.groups) ? source.groups : fallback.groups,
    skills: Array.isArray(source.skills) ? source.skills : fallback.skills,
    profiles: Array.isArray(source.profiles) ? source.profiles : fallback.profiles,
    interviews: Array.isArray(source.interviews) ? source.interviews : fallback.interviews,
    reviewQueue: Array.isArray(source.reviewQueue) ? source.reviewQueue : fallback.reviewQueue,
    kfla: Array.isArray(source.kfla) ? source.kfla : fallback.kfla,
    jobDescriptions: Array.isArray(source.jobDescriptions) ? source.jobDescriptions : fallback.jobDescriptions,
    mappings: Array.isArray(source.mappings) ? source.mappings : fallback.mappings,
    strategicVectors: Array.isArray(source.strategicVectors) ? source.strategicVectors : fallback.strategicVectors,
    agentRuns: Array.isArray(source.agentRuns) ? source.agentRuns : fallback.agentRuns,
  };
}

export function skillQuality(skill: Skill, workspace: SkillWorkspace) {
  const duplicate = workspace.skills.some((item) => item.id !== skill.id && (item.name.toLowerCase() === skill.name.toLowerCase() || item.aliases.some((alias) => alias.toLowerCase() === skill.name.toLowerCase())));
  const checks = {
    syntax: Boolean(skill.syntax?.action && skill.syntax.object),
    observable: skill.observability.trim().length >= 20,
    definition: skill.description.trim().length >= 25,
    taxonomy: workspace.groups.some((group) => group.id === skill.groupId),
    unique: !duplicate,
    evidence: skill.evidence.length > 0,
  };
  return { checks, score: Math.round(Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100) };
}

export function profileGuidance(profile: RoleProfile, skills: Skill[]) {
  const mapped = profile.skills.map((item) => skills.find((skill) => skill.id === item.skillId)).filter(Boolean) as Skill[];
  const technical = mapped.filter((skill) => skill.dimension === "technical").length;
  const behavioral = mapped.filter((skill) => skill.dimension === "competency").length;
  const human = mapped.filter((skill) => skill.dimension === "trait" || skill.dimension === "driver").length;
  return {
    count: profile.skills.length,
    validCount: profile.skills.length >= 8 && profile.skills.length <= 12,
    composition: `${technical} technical · ${behavioral} behavioral · ${human} traits/drivers`,
    suggested: technical >= 5 && technical <= 6 && behavioral >= 3 && behavioral <= 4 && human >= 1 && human <= 2,
  };
}
